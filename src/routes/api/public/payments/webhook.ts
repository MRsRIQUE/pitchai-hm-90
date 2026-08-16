import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { entitlementPlanId, findPitchaiPlan } from "@/lib/live/plans";
import {
  fsCreateIfAbsent,
  fsDelete,
  fsGet,
  fsQuery,
  fsSet,
  setSubscription,
} from "@/lib/firebase.server";

/** `verifyWebhook` devolve o envelope cru do Stripe; `id` é a chave de dedupe. */
type StripeEvent = { id?: string; type: string; data: { object: any } };

const subscriptionSchema = z.object({
  id: z.string(),
  status: z.string(),
  cancel_at_period_end: z.boolean().optional(),
  current_period_end: z.number().nullable().optional(),
  customer: z.union([z.string(), z.object({ id: z.string() })]).optional(),
  metadata: z.record(z.string()).optional(),
  items: z
    .object({
      data: z
        .array(
          z.object({
            quantity: z.number().nullable().optional(),
            current_period_end: z.number().nullable().optional(),
            price: z
              .object({
                lookup_key: z.string().nullable().optional(),
                unit_amount: z.number().nullable().optional(),
              })
              .optional(),
          }),
        )
        .default([]),
    })
    .optional(),
});

type StripeSubscription = z.infer<typeof subscriptionSchema>;

function planFromSub(sub: StripeSubscription): string {
  const item = sub.items?.data?.[0];
  const key: string | undefined = item?.price?.lookup_key ?? undefined;
  if (key && findPitchaiPlan(key)) return entitlementPlanId(key);
  const metadataPlan = sub.metadata?.plan;
  if (metadataPlan && findPitchaiPlan(metadataPlan)) return entitlementPlanId(metadataPlan);
  return "free";
}

async function upsertSellerSub(sub: StripeSubscription, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.warn("[stripe-webhook] missing userId in subscription", sub.id);
    return;
  }
  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null;
  const plan = planFromSub(sub);
  const status = sub.status;

  await setSubscription(
    userId,
    {
      plan: status === "canceled" ? "free" : plan,
      status,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      stripe_subscription_id: sub.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      granted_until:
        plan !== "free" && ["active", "trialing"].includes(String(status)) && periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { mode: "server" },
  );

  console.log(`[stripe-webhook] ${env} user=${userId} plan=${plan} status=${status}`);

  if (["active", "trialing"].includes(String(status)) && plan !== "free") {
    await registerReferralCommission({
      userId,
      subscriptionId: sub.id,
      plan,
      baseCents: (item?.price?.unit_amount ?? 0) * (item?.quantity ?? 1),
      periodEnd: periodEnd ?? null,
    });
  }
}

/** 60% para quem indicou — uma comissão por ciclo de cobrança. */
async function registerReferralCommission(args: {
  userId: string;
  subscriptionId: string;
  plan: string;
  baseCents: number;
  periodEnd: number | null;
}) {
  const { userId, subscriptionId, plan, baseCents, periodEnd } = args;
  if (!baseCents) return;

  const claims = await fsQuery("referral_claims", {
    where: [{ field: "refereeUid", op: "EQUAL", value: userId }],
    limit: 1,
    mode: "server",
  });
  const referrerId = claims[0]?.data?.referrerUid as string | undefined;
  if (!referrerId) return;

  const rate = 0.6;
  // ID determinístico por ciclo de cobrança. O `Date.now()` que ficava aqui
  // gerava um ID novo a cada reenvio do Stripe e lançava uma segunda comissão
  // de 60% sobre a mesma cobrança. Sem ciclo conhecido, o lançamento é
  // provisório ("init") e é substituído quando o ciclo chega.
  const provisionalId = `${subscriptionId}:init`;
  const invoiceId = periodEnd ? `${subscriptionId}:${periodEnd}` : provisionalId;

  try {
    if (periodEnd) {
      // Remove o provisório do mesmo ciclo inicial para não pagar duas vezes —
      // só enquanto ninguém tiver liquidado a comissão.
      const provisional = await fsGet(`referral_commissions/${provisionalId}`, {
        mode: "server",
      }).catch(() => null);
      if (provisional?.data?.status === "pendente") {
        await fsDelete(`referral_commissions/${provisionalId}`, { mode: "server" });
      }
    }

    const created = await fsCreateIfAbsent(
      `referral_commissions/${invoiceId}`,
      {
        referrerUid: referrerId,
        refereeUid: userId,
        subscription_id: subscriptionId,
        invoice_id: invoiceId,
        plan,
        base_cents: baseCents,
        rate,
        amount_cents: Math.round(baseCents * rate),
        status: "pendente",
        // Campos canônicos usados pelas consultas do afiliado e do Admin.
        // Mantemos o formato camelCase para que o índice createdAt funcione.
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { mode: "server" },
    );
    if (!created) {
      console.log(`[stripe-webhook] comissão ${invoiceId} já registrada — nada a fazer`);
    }
  } catch (error) {
    console.error("[stripe-webhook] commission error:", error);
  }
}

async function revokePendingCommissions(userId: string): Promise<void> {
  // Ao cancelar assinatura, comissões pendentes ("pendente") do afiliado que
  // indicou este usuário devem ser marcadas como "cancelado" para evitar que
  // o afiliado saque comissão de assinatura cancelada.
  try {
    const pending = await fsQuery("referral_commissions", {
      where: [
        { field: "refereeUid", op: "EQUAL", value: userId },
        { field: "status", op: "EQUAL", value: "pendente" },
      ],
      mode: "server",
    });
    await Promise.all(
      pending.map((c) =>
        fsSet(
          `referral_commissions/${c.id}`,
          { status: "cancelado", updatedAt: new Date().toISOString() },
          { mode: "server" },
        ),
      ),
    );
    if (pending.length) {
      console.log(`[stripe-webhook] revogadas ${pending.length} comissões pendentes de ${userId}`);
    }
  } catch (error) {
    console.error("[stripe-webhook] revokePendingCommissions:", error);
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = (await verifyWebhook(req, env)) as StripeEvent;
  const eventId = event.id;

  // Idempotência: o Stripe reenvia o mesmo evento em timeout, erro 5xx ou
  // replay manual. O marcador é criado com pré-condição no próprio Firestore,
  // então apenas o primeiro processamento passa — inclusive sob reenvios
  // simultâneos, que um get-antes-de-set deixaria escapar.
  if (eventId) {
    const first = await fsCreateIfAbsent(
      `payment_events/${eventId}`,
      {
        event_id: eventId,
        type: event.type,
        env,
        received_at: new Date().toISOString(),
      },
      { mode: "server" },
    );
    if (!first) {
      console.log(`[stripe-webhook] evento ${eventId} já processado — reenvio ignorado`);
      return;
    }
  } else {
    console.warn("[stripe-webhook] evento sem id — processando sem dedupe");
  }

  try {
    await dispatchEvent(event, env);
  } catch (error) {
    // Libera o marcador para que o reenvio do Stripe consiga tentar de novo;
    // mantê-lo transformaria uma falha temporária em ativação perdida.
    if (eventId) {
      await fsDelete(`payment_events/${eventId}`, { mode: "server" }).catch(() => undefined);
    }
    throw error;
  }

  if (eventId) {
    await fsSet(
      `payment_events/${eventId}`,
      { processed_at: new Date().toISOString() },
      { mode: "server" },
    ).catch(() => undefined);
  }
}

async function dispatchEvent(event: StripeEvent, env: StripeEnv) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const parsed = subscriptionSchema.safeParse(event.data.object);
      if (!parsed.success) {
        console.error("[stripe-webhook] payload de assinatura inválido:", parsed.error.issues);
        throw new Error("Invalid subscription payload");
      }
      await upsertSellerSub(parsed.data, env);
      break;
    }
    case "customer.subscription.deleted": {
      const parsed = subscriptionSchema.safeParse(event.data.object);
      if (!parsed.success) {
        console.error("[stripe-webhook] payload de assinatura inválido:", parsed.error.issues);
        throw new Error("Invalid subscription payload");
      }
      const sub = parsed.data;
      const userId = sub.metadata?.userId;
      if (userId) {
        await setSubscription(
          userId,
          {
            plan: "free",
            status: "canceled",
            granted_until: null,
            current_period_end: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          },
          { mode: "server" },
        );
        await revokePendingCommissions(userId);
      }
      break;
    }
    default:
      console.log("[stripe-webhook] unhandled:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // O ambiente é SEMPRE inferido da chave configurada. Nunca aceitamos
        // um parâmetro de query: ele permitia aplicar eventos de um ambiente
        // no contexto de outro.
        const stripeEnv: StripeEnv = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
          ? "live"
          : "sandbox";
        try {
          await handleWebhook(request, stripeEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[stripe-webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});

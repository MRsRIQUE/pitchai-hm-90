import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { PRICE_TO_PLAN } from "@/lib/live/plans";
import { fsSet, fsQuery, setSubscription } from "@/lib/firebase.server";

function planFromSub(sub: any): "free" | "pro" | "max" {
  const item = sub.items?.data?.[0];
  const key: string | undefined =
    item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id;
  if (key && PRICE_TO_PLAN[key]) return PRICE_TO_PLAN[key];
  return "free";
}

async function upsertSellerSub(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.warn("[stripe-webhook] missing userId in subscription", sub.id);
    return;
  }
  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
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
        plan !== "free" && ["active", "trialing"].includes(String(status))
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
  // Gera um ID único mesmo se `periodEnd` vier null (caso de `customer.subscription.created`).
  // Antes usava `${subscriptionId}:${periodEnd ?? "current"}` que colidia em reenvios do webhook.
  const invoiceId = `${subscriptionId}:${periodEnd ?? "init_" + Date.now()}`;

  try {
    await fsSet(
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { mode: "server" },
    );
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
          { status: "cancelado", updated_at: new Date().toISOString() },
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

export async function handleStripeWebhook(req: Request, env: StripeEnv): Promise<void> {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSellerSub(event.data.object, env);
      break;
    case "customer.subscription.deleted": {
      const sub = event.data.object;
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
        const rawEnv = new URL(request.url).searchParams.get("env");
        // Stripe não envia `env` no webhook. O endpoint público usa live por
        // padrão; sandbox continua disponível explicitamente com ?env=sandbox.
        const env: StripeEnv = rawEnv === "sandbox" ? "sandbox" : "live";
        try {
          await handleStripeWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[stripe-webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createStripeClient, type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
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

const expandableIdSchema = z.union([z.string(), z.object({ id: z.string() })]);

const checkoutSessionSchema = z.object({
  id: z.string(),
  client_reference_id: z.string().nullable().optional(),
  customer: expandableIdSchema.nullable().optional(),
  subscription: expandableIdSchema.nullable().optional(),
  invoice: expandableIdSchema.nullable().optional(),
  metadata: z.record(z.string()).nullable().optional(),
  discounts: z
    .array(
      z.object({
        promotion_code: expandableIdSchema.nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
});

const invoiceSchema = z.object({
  id: z.string(),
  status: z.string().nullable().optional(),
  amount_paid: z.number(),
  parent: z
    .object({
      subscription_details: z
        .object({
          subscription: expandableIdSchema.nullable().optional(),
          metadata: z.record(z.string()).nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  // Compatibilidade com eventos emitidos antes da migração para `parent`.
  subscription: expandableIdSchema.nullable().optional(),
  metadata: z.record(z.string()).nullable().optional(),
});

type StripeSubscription = z.infer<typeof subscriptionSchema>;
type StripeInvoice = z.infer<typeof invoiceSchema>;

function expandableId(value: z.infer<typeof expandableIdSchema> | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

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
}

/** 60% para quem indicou — uma comissão por ciclo de cobrança. */
async function registerReferralCommission(args: {
  userId: string;
  subscriptionId: string;
  invoiceId: string;
  plan: string;
  baseCents: number;
}) {
  const { userId, subscriptionId, invoiceId, plan, baseCents } = args;
  if (!baseCents) return;

  const claims = await fsQuery("referral_claims", {
    where: [{ field: "refereeUid", op: "EQUAL", value: userId }],
    limit: 1,
    mode: "server",
  });
  const claim = claims[0];
  const referrerId = claim?.data?.referrerUid as string | undefined;
  if (!referrerId) return;

  const rate = 0.6;
  try {
    const created = await fsCreateIfAbsent(
      `referral_commissions/${invoiceId}`,
      {
        referrerUid: referrerId,
        refereeUid: userId,
        referralCode: (claim?.data?.code as string) ?? null,
        attributionSource: (claim?.data?.source as string) ?? "unknown",
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

async function registerPaidInvoice(rawInvoice: unknown, env: StripeEnv) {
  const parsed = invoiceSchema.safeParse(rawInvoice);
  if (!parsed.success) {
    console.error("[stripe-webhook] payload de fatura inválido:", parsed.error.issues);
    throw new Error("Invalid invoice payload");
  }
  const invoice: StripeInvoice = parsed.data;
  if (invoice.status && invoice.status !== "paid") return;

  const subscriptionId =
    expandableId(invoice.parent?.subscription_details?.subscription) ||
    expandableId(invoice.subscription);
  if (!subscriptionId) return;

  const stripe = createStripeClient(env);
  const rawSubscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subscription = subscriptionSchema.safeParse(rawSubscription);
  if (!subscription.success) {
    console.error("[stripe-webhook] assinatura da fatura inválida:", subscription.error.issues);
    throw new Error("Invalid invoice subscription");
  }
  const metadata = {
    ...(invoice.parent?.subscription_details?.metadata ?? {}),
    ...(subscription.data.metadata ?? {}),
  };
  const userId = metadata.userId;
  if (!userId) {
    console.warn("[stripe-webhook] fatura sem userId", invoice.id);
    return;
  }
  const plan = planFromSub(subscription.data);
  if (plan === "free") return;
  await registerReferralCommission({
    userId,
    subscriptionId,
    invoiceId: invoice.id,
    plan,
    // A comissão incide no valor realmente pago, já com cupom e descontos.
    baseCents: invoice.amount_paid,
  });
}

async function registerCouponAttribution(
  session: z.infer<typeof checkoutSessionSchema>,
  env: StripeEnv,
) {
  const promotionCodeId = expandableId(session.discounts?.[0]?.promotion_code);
  if (!promotionCodeId) return;

  const mapping = await fsGet(`affiliate_coupon_codes/${promotionCodeId}`, { mode: "server" });
  const affiliateUid = String(mapping?.data?.affiliateUid || "");
  const affiliateCode = String(mapping?.data?.affiliateCode || "");
  // O evento pode chegar logo depois de o admin pausar o cupom. A Stripe só
  // aceita códigos ativos no pagamento, então preservamos a venda histórica
  // sempre que o mapeamento existir, mesmo que ele já esteja pausado agora.
  if (!affiliateUid || !affiliateCode) return;

  const userId = session.metadata?.userId || session.client_reference_id || "";
  if (!userId || userId === affiliateUid) return;
  const now = new Date().toISOString();
  const created = await fsCreateIfAbsent(
    `referral_claims/${userId}`,
    {
      referrerUid: affiliateUid,
      refereeUid: userId,
      code: affiliateCode,
      source: "checkout",
      status: "claimed",
      promotionCodeId,
      couponCode: String(mapping?.data?.code || ""),
      createdAt: now,
      updatedAt: now,
    },
    { mode: "server" },
  );
  const savedClaim = created
    ? { referrerUid: affiliateUid, code: affiliateCode, source: "checkout" }
    : (await fsGet(`referral_claims/${userId}`, { mode: "server" }))?.data;
  const attributedUid = String(savedClaim?.referrerUid || "");
  const attributedCode = String(savedClaim?.code || "");
  if (!attributedUid || !attributedCode) return;

  const stripe = createStripeClient(env);
  const attribution = {
    sellerCode: attributedCode,
    referrerUid: attributedUid,
    attributionSource: String(savedClaim?.source || "checkout"),
    promotionCodeId,
    couponCode: String(mapping?.data?.code || ""),
    promotionAffiliateCode: affiliateCode,
  };
  const subscriptionId = expandableId(session.subscription);
  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await stripe.subscriptions.update(subscriptionId, {
      metadata: { ...subscription.metadata, userId, ...attribution },
    });
  }
  const customerId = expandableId(session.customer);
  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      await stripe.customers.update(customerId, {
        metadata: { ...customer.metadata, userId, ...attribution },
      });
    }
  }
}

async function handleCheckoutCompleted(rawSession: unknown, env: StripeEnv) {
  const parsed = checkoutSessionSchema.safeParse(rawSession);
  if (!parsed.success) {
    console.error("[stripe-webhook] sessão de checkout inválida:", parsed.error.issues);
    throw new Error("Invalid checkout session payload");
  }
  await registerCouponAttribution(parsed.data, env);

  // Cobre a corrida em que `invoice.paid` chega antes da atribuição do cupom.
  const invoiceId = expandableId(parsed.data.invoice);
  if (invoiceId) {
    const invoice = await createStripeClient(env).invoices.retrieve(invoiceId);
    await registerPaidInvoice(invoice, env);
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
    case "checkout.session.completed": {
      await handleCheckoutCompleted(event.data.object, env);
      break;
    }
    case "invoice.paid": {
      await registerPaidInvoice(event.data.object, env);
      break;
    }
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

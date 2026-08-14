import crypto from "node:crypto";
import {
  fsCreate,
  fsGet,
  fsSet,
  getSubscription,
  getUserByEmail,
  setPendingPayment,
  setSubscription,
} from "@/lib/firebase.server";
import { PITCHAI_PLANS, type PitchaiPlan } from "@/lib/live/plans";
import { isApprovedPaymentStatus, isReversedPaymentStatus } from "@/lib/live/payment-status";

const headers = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" };

function nested(body: any, ...paths: string[]): unknown {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], body);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function amountInCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount > 1000 ? amount : amount * 100);
}

function identifyPlan(body: any): PitchaiPlan | null {
  const clues = [
    nested(body, "plan.code", "plan.name", "plan_code"),
    nested(body, "product.external_reference", "product.name", "product.code", "product_id"),
    nested(body, "offer.name", "offer.code"),
  ]
    .map(normalize)
    .filter(Boolean);

  const configuredCodes: Record<string, string | undefined> = {
    pitchai_mensal: process.env.PERFECTPAY_PLAN_MENSAL_CODE,
    pitchai_trimestral: process.env.PERFECTPAY_PLAN_TRIMESTRAL_CODE,
    pitchai_anual: process.env.PERFECTPAY_PLAN_ANUAL_CODE,
  };
  for (const plan of PITCHAI_PLANS) {
    const configured = normalize(configuredCodes[plan.priceId]);
    if (configured && clues.includes(configured)) return plan;
  }
  if (clues.some((clue) => clue.includes("trimestral") || clue.includes("3 meses"))) {
    return PITCHAI_PLANS.find((plan) => plan.priceId === "pitchai_trimestral") || null;
  }
  if (clues.some((clue) => clue.includes("anual") || clue.includes("12 meses"))) {
    return PITCHAI_PLANS.find((plan) => plan.priceId === "pitchai_anual") || null;
  }
  if (clues.some((clue) => clue.includes("mensal") || clue.includes("1 mes"))) {
    return PITCHAI_PLANS.find((plan) => plan.priceId === "pitchai_mensal") || null;
  }

  const cents = amountInCents(nested(body, "sale_amount", "amount", "value", "price"));
  return PITCHAI_PLANS.find((plan) => cents === plan.amountCents) || null;
}

function addMonths(base: Date, months: number): Date {
  const result = new Date(base);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function eventId(body: any, email: string, status: unknown): string {
  const providerCode = nested(
    body,
    "sale.code",
    "sale_code",
    "transaction.code",
    "transaction_id",
    "code",
  );
  const raw = providerCode
    ? `perfectpay:${providerCode}:${String(status)}`
    : `perfectpay:${email}:${String(status)}:${JSON.stringify(body)}`;
  return `perfectpay_${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

async function claimEvent(
  id: string,
  details: Record<string, unknown>,
): Promise<"claimed" | "duplicate"> {
  try {
    await fsCreate(
      "payment_events",
      { ...details, state: "processing", createdAt: new Date().toISOString() },
      id,
      { mode: "server" },
    );
    return "claimed";
  } catch (error) {
    if (!String(error).includes("ALREADY_EXISTS")) throw error;
    const existing = await fsGet(`payment_events/${id}`, { mode: "server" });
    if (existing?.data?.state === "failed") {
      await fsSet(
        `payment_events/${id}`,
        { state: "processing", retryAt: new Date().toISOString() },
        { mode: "server" },
      );
      return "claimed";
    }
    return "duplicate";
  }
}

export async function handlePaymentWebhook(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return Response.json({ status: "online" }, { headers });

  let claimedId: string | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    const body: any = contentType.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(await request.text()).entries())
      : await request.json().catch(() => ({}));

    const expectedToken = process.env.PERFECTPAY_TOKEN;
    if (!expectedToken)
      return Response.json({ error: "server_misconfigured" }, { status: 503, headers });
    const incomingToken = String(
      nested(body, "token", "webhook_token", "secret", "public_token") || "",
    ).trim();
    if (!incomingToken || incomingToken !== expectedToken) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers });
    }

    const customerEmail = normalize(
      nested(
        body,
        "customer.email",
        "customer[email]",
        "email",
        "client.email",
        "buyer.email",
        "payer_email",
      ),
    );
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
      return Response.json({ error: "missing_customer_email" }, { status: 400, headers });
    }
    const status = nested(
      body,
      "sale_status_enum",
      "sale.status_enum",
      "sale_status",
      "status",
      "event",
      "saleStatus",
    );
    const approved = isApprovedPaymentStatus(status);
    const reversed = isReversedPaymentStatus(status);
    if (!approved && !reversed) {
      return Response.json({ received: true, status, activated: false }, { headers });
    }

    const plan = identifyPlan(body);
    if (approved && !plan) {
      console.error("[webhook-payments] Plano não identificado", { status });
      return Response.json({ error: "unknown_plan" }, { status: 422, headers });
    }

    claimedId = eventId(body, customerEmail, status);
    if (
      (await claimEvent(claimedId, {
        provider: "perfectpay",
        customerEmail,
        status: String(status),
        plan: plan?.priceId || null,
      })) === "duplicate"
    ) {
      return Response.json({ received: true, duplicate: true }, { headers });
    }

    const userDoc = await getUserByEmail(customerEmail, { mode: "server" });
    const saleCode =
      String(
        nested(body, "sale.code", "sale_code", "transaction.code", "transaction_id", "code") || "",
      ) || null;
    if (!userDoc) {
      if (approved && plan) {
        await setPendingPayment(
          customerEmail,
          {
            amount: amountInCents(nested(body, "sale_amount", "amount", "value", "price")),
            origin: "perfectpay",
            status: String(status),
            approvedAt: new Date().toISOString(),
            consumed: false,
            plan: plan.priceId,
            months: plan.months,
            saleCode,
          },
          { mode: "server" },
        );
      }
      await fsSet(
        `payment_events/${claimedId}`,
        {
          state: "processed",
          activated: false,
          reason: "account_not_found",
          processedAt: new Date().toISOString(),
        },
        { mode: "server" },
      );
      return Response.json(
        { received: true, activated: false, reason: "account_not_found" },
        { headers },
      );
    }

    if (reversed) {
      const current = await getSubscription(userDoc.id, { mode: "server" });
      if (!saleCode || !current?.provider_sale_code || current.provider_sale_code === saleCode) {
        await setSubscription(
          userDoc.id,
          {
            plan: "free",
            status: "canceled",
            current_period_end: null,
            granted_until: null,
            provider_sale_code: saleCode,
            updated_at: new Date().toISOString(),
          },
          { mode: "server" },
        );
      }
    } else if (plan) {
      const current = await getSubscription(userDoc.id, { mode: "server" });
      const currentEnd =
        current?.status === "active" &&
        current.current_period_end &&
        Date.parse(current.current_period_end) > Date.now()
          ? new Date(current.current_period_end)
          : new Date();
      const periodEnd = addMonths(currentEnd, plan.months).toISOString();
      await setSubscription(
        userDoc.id,
        {
          plan: plan.priceId,
          status: "active",
          current_period_end: periodEnd,
          granted_until: periodEnd,
          provider: "perfectpay",
          provider_sale_code: saleCode,
          updated_at: new Date().toISOString(),
        },
        { mode: "server" },
      );
    }

    await fsSet(
      `payment_events/${claimedId}`,
      {
        state: "processed",
        activated: approved,
        reversed,
        userId: userDoc.id,
        processedAt: new Date().toISOString(),
      },
      { mode: "server" },
    );
    return Response.json({ success: true, activated: approved, reversed }, { headers });
  } catch (error) {
    console.error("[webhook-payments]", error);
    if (claimedId) {
      await fsSet(
        `payment_events/${claimedId}`,
        { state: "failed", failedAt: new Date().toISOString() },
        { mode: "server" },
      ).catch(() => undefined);
    }
    return Response.json({ error: "internal_error" }, { status: 500, headers });
  }
}

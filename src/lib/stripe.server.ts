import Stripe from "stripe";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "live";

const LIVE_SECRET_KEY = /^(?:sk|rk)_live_/;

export function getStripeEnvironment(): StripeEnv {
  const key = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_LIVE_API_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!LIVE_SECRET_KEY.test(key)) {
    throw new Error("Stripe test mode is disabled; configure a live secret or restricted key");
  }
  return "live";
}

export function getConnectionApiKey(env: StripeEnv): string {
  if (env !== "live") throw new Error("Stripe test mode is disabled");
  const key = process.env.STRIPE_SECRET_KEY || getEnv("STRIPE_LIVE_API_KEY");
  if (!LIVE_SECRET_KEY.test(key)) {
    throw new Error("Stripe test mode is disabled; configure a live secret or restricted key");
  }
  return key;
}

export function createStripeClient(env: StripeEnv): Stripe {
  return new Stripe(getConnectionApiKey(env), {
    apiVersion: "2026-03-25.dahlia",
  });
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { message?: string; raw?: { message?: string } };
    const message = e.raw?.message ?? e.message;
    if (message) return message;
  }
  return "Stripe request failed";
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ type: string; data: { object: any } }> {
  if (env !== "live") throw new Error("Stripe test mode is disabled");
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret = process.env.STRIPE_LIVE_WEBHOOK_SECRET || getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1: string[] = [];
  for (const part of signature.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v;
    if (k === "v1") v1.push(v);
  }
  if (!timestamp || v1.length === 0) throw new Error("Invalid signature format");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = Buffer.from(new Uint8Array(signed)).toString("hex");
  if (!v1.includes(expected)) throw new Error("Invalid webhook signature");

  return JSON.parse(body);
}

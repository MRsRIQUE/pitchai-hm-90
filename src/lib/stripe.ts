import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeEnv = "live";

const clientToken = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) as string | undefined;

function paymentsEnvironment(): StripeEnv {
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error("Pagamentos exigem uma chave publicável live da Stripe.");
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

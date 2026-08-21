const invalid = [];

if (!process.env.VITE_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_live_")) {
  invalid.push("VITE_STRIPE_PUBLISHABLE_KEY must use pk_live_");
}
if (!/^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || "")) {
  invalid.push("STRIPE_SECRET_KEY must use sk_live_ or rk_live_");
}
if (!process.env.STRIPE_LIVE_WEBHOOK_SECRET?.startsWith("whsec_")) {
  invalid.push("STRIPE_LIVE_WEBHOOK_SECRET must use whsec_");
}

if (invalid.length) {
  console.error(`Live Stripe configuration blocked:\n- ${invalid.join("\n- ")}`);
  process.exit(1);
}

console.log("Live Stripe configuration verified.");

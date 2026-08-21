import { afterEach, describe, expect, it } from "vitest";
import { getConnectionApiKey, getStripeEnvironment } from "../../src/lib/stripe.server";

const original = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_LIVE_API_KEY: process.env.STRIPE_LIVE_API_KEY,
  STRIPE_SANDBOX_API_KEY: process.env.STRIPE_SANDBOX_API_KEY,
};

afterEach(() => {
  for (const [name, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("Stripe live-only configuration", () => {
  it.each(["sk_live_example", "rk_live_example"])("accepts live key %s", (key) => {
    process.env.STRIPE_SECRET_KEY = key;
    expect(getStripeEnvironment()).toBe("live");
    expect(getConnectionApiKey("live")).toBe(key);
  });

  it.each(["sk_test_example", "rk_test_example"])("rejects test key %s", (key) => {
    process.env.STRIPE_SECRET_KEY = key;
    expect(() => getStripeEnvironment()).toThrow(/test mode is disabled/i);
    expect(() => getConnectionApiKey("live")).toThrow(/test mode is disabled/i);
  });

  it("never falls back to the legacy sandbox key", () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_LIVE_API_KEY;
    process.env.STRIPE_SANDBOX_API_KEY = "sk_test_legacy";
    expect(() => getStripeEnvironment()).toThrow(/not configured/i);
  });

  it("rejects a sandbox environment received at runtime", () => {
    process.env.STRIPE_SECRET_KEY = "rk_live_example";
    expect(() => getConnectionApiKey("sandbox" as never)).toThrow(/test mode is disabled/i);
  });
});

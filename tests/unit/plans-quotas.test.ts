import { describe, expect, it, vi, afterEach } from "vitest";
import {
  findPitchaiPlan,
  entitlementPlanId,
  formatBRL,
  monthlyEquivalent,
  hasPaidAccess,
  hasActiveCompedAccess,
  PITCHAI_PLANS,
  PRICE_TO_PLAN,
} from "@/lib/live/plans";
import {
  normalizePlanSlug,
  resolvePlanQuota,
  formatTokenLimit,
  getUpgradeOffer,
  DEFAULT_PLAN_QUOTAS,
  PLAN_QUOTA_SCHEMA_VERSION,
} from "@/lib/live/quotas";

// ---------------------------------------------------------------------------
// plans.ts
// ---------------------------------------------------------------------------

describe("findPitchaiPlan", () => {
  it("finds the mensal plan", () => {
    const plan = findPitchaiPlan("pitchai_mensal");
    expect(plan).toBeDefined();
    expect(plan?.name).toBe("Mensal");
    expect(plan?.amountCents).toBe(2790);
  });

  it("finds the trimestral plan", () => {
    expect(findPitchaiPlan("pitchai_trimestral")?.name).toBe("Trimestral");
  });

  it("finds the anual plan", () => {
    expect(findPitchaiPlan("pitchai_anual")?.name).toBe("Anual");
  });

  it("finds legacy test plan", () => {
    expect(findPitchaiPlan("pitchai_trimestral_teste_1real")?.amountCents).toBe(100);
  });

  it("returns undefined for unknown priceId", () => {
    expect(findPitchaiPlan("nonexistent")).toBeUndefined();
  });
});

describe("entitlementPlanId", () => {
  it("maps legacy test plan to trimestral", () => {
    expect(entitlementPlanId("pitchai_trimestral_teste_1real")).toBe("pitchai_trimestral");
  });

  it("returns the priceId for regular plans", () => {
    expect(entitlementPlanId("pitchai_mensal")).toBe("pitchai_mensal");
    expect(entitlementPlanId("pitchai_anual")).toBe("pitchai_anual");
  });

  it("returns 'free' for null/undefined", () => {
    expect(entitlementPlanId(null)).toBe("free");
    expect(entitlementPlanId(undefined)).toBe("free");
  });

  it("returns 'free' for empty string", () => {
    expect(entitlementPlanId("")).toBe("free");
  });
});

describe("formatBRL", () => {
  it("formats 0 cents as R$ 0,00", () => {
    expect(formatBRL(0)).toMatch(/0,00/);
  });

  it("formats 2790 cents as R$ 27,90", () => {
    expect(formatBRL(2790)).toMatch(/27,90/);
  });

  it("formats 11790 cents as R$ 117,90", () => {
    expect(formatBRL(11790)).toMatch(/117,90/);
  });
});

describe("monthlyEquivalent", () => {
  it("calculates mensal (1 month) correctly", () => {
    const plan = PITCHAI_PLANS.find((p) => p.priceId === "pitchai_mensal")!;
    expect(monthlyEquivalent(plan)).toMatch(/27,90/);
  });

  it("calculates trimestral (3 months) correctly", () => {
    const plan = PITCHAI_PLANS.find((p) => p.priceId === "pitchai_trimestral")!;
    // 6790 / 3 = 2263.33 → rounded to 2263 cents
    expect(monthlyEquivalent(plan)).toMatch(/22,63/);
  });

  it("calculates anual (12 months) correctly", () => {
    const plan = PITCHAI_PLANS.find((p) => p.priceId === "pitchai_anual")!;
    // 11790 / 12 = 982.5 → rounded to 983 cents
    expect(monthlyEquivalent(plan)).toMatch(/9,83/);
  });
});

describe("hasPaidAccess", () => {
  it("returns false for null", () => {
    expect(hasPaidAccess(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasPaidAccess(undefined)).toBe(false);
  });

  it("returns false for free plan", () => {
    expect(hasPaidAccess({ plan: "free", status: "active" })).toBe(false);
  });

  it("returns false for null plan", () => {
    expect(hasPaidAccess({ plan: null, status: "active" })).toBe(false);
  });

  it("returns false for non-active status", () => {
    expect(hasPaidAccess({ plan: "pitchai_mensal", status: "past_due" })).toBe(false);
    expect(hasPaidAccess({ plan: "pitchai_mensal", status: "trialing" })).toBe(false);
  });

  it("returns true for active plan with future current_period_end", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(
      hasPaidAccess({ plan: "pitchai_mensal", status: "active", current_period_end: future }),
    ).toBe(true);
  });

  it("returns false for active plan with past current_period_end and no granted_until", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(
      hasPaidAccess({ plan: "pitchai_mensal", status: "active", current_period_end: past }),
    ).toBe(false);
  });

  it("returns true for active plan with future granted_until", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(hasPaidAccess({ plan: "pitchai_mensal", status: "active", granted_until: future })).toBe(
      true,
    );
  });

  it("returns true for comped with future granted_until", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(
      hasPaidAccess({ plan: "pitchai_trimestral", status: "comped", granted_until: future }),
    ).toBe(true);
  });

  it("returns false for comped with past granted_until", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(
      hasPaidAccess({ plan: "pitchai_trimestral", status: "comped", granted_until: past }),
    ).toBe(false);
  });

  it("returns false for comped without granted_until", () => {
    expect(hasPaidAccess({ plan: "pitchai_trimestral", status: "comped" })).toBe(false);
  });
});

describe("hasActiveCompedAccess", () => {
  it("returns false for null", () => {
    expect(hasActiveCompedAccess(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(hasActiveCompedAccess(undefined)).toBe(false);
  });

  it("returns false for non-comped status", () => {
    expect(hasActiveCompedAccess({ status: "active" })).toBe(false);
  });

  it("returns false for comped without grantedUntil", () => {
    expect(hasActiveCompedAccess({ status: "comped" })).toBe(false);
  });

  it("returns true for comped with future grantedUntil", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(hasActiveCompedAccess({ status: "comped", grantedUntil: future })).toBe(true);
  });

  it("returns false for comped with past grantedUntil", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(hasActiveCompedAccess({ status: "comped", grantedUntil: past })).toBe(false);
  });
});

describe("PRICE_TO_PLAN", () => {
  it("maps all current plans to 'pro'", () => {
    expect(PRICE_TO_PLAN.pitchai_mensal).toBe("pro");
    expect(PRICE_TO_PLAN.pitchai_trimestral).toBe("pro");
    expect(PRICE_TO_PLAN.pitchai_anual).toBe("pro");
  });

  it("maps legacy test plan to 'pro'", () => {
    expect(PRICE_TO_PLAN.pitchai_trimestral_teste_1real).toBe("pro");
  });

  it("maps legacy max plans to 'max'", () => {
    expect(PRICE_TO_PLAN.pitchai_max_monthly).toBe("max");
    expect(PRICE_TO_PLAN.pitchai_max_yearly).toBe("max");
  });
});

// ---------------------------------------------------------------------------
// quotas.ts
// ---------------------------------------------------------------------------

describe("PLAN_QUOTA_SCHEMA_VERSION", () => {
  it("is a number", () => {
    expect(typeof PLAN_QUOTA_SCHEMA_VERSION).toBe("number");
  });

  it("is version 2", () => {
    expect(PLAN_QUOTA_SCHEMA_VERSION).toBe(2);
  });
});

describe("normalizePlanSlug", () => {
  it("returns 'gratuito' for undefined", () => {
    expect(normalizePlanSlug(undefined)).toBe("gratuito");
  });

  it("returns 'gratuito' for null", () => {
    expect(normalizePlanSlug(null)).toBe("gratuito");
  });

  it("returns 'gratuito' for empty string", () => {
    expect(normalizePlanSlug("")).toBe("gratuito");
  });

  it("returns 'gratuito' for 'free'", () => {
    expect(normalizePlanSlug("free")).toBe("gratuito");
  });

  it("normalizes 'mensal' to 'pitchai_mensal'", () => {
    expect(normalizePlanSlug("mensal")).toBe("pitchai_mensal");
  });

  it("normalizes 'starter' to 'pitchai_mensal'", () => {
    expect(normalizePlanSlug("starter")).toBe("pitchai_mensal");
  });

  it("normalizes 'trimestral' to 'pitchai_trimestral'", () => {
    expect(normalizePlanSlug("trimestral")).toBe("pitchai_trimestral");
  });

  it("normalizes 'pro' to 'pitchai_trimestral'", () => {
    expect(normalizePlanSlug("pro")).toBe("pitchai_trimestral");
  });

  it("normalizes 'anual' to 'pitchai_anual'", () => {
    expect(normalizePlanSlug("anual")).toBe("pitchai_anual");
  });

  it("trims and lowercases input", () => {
    expect(normalizePlanSlug("  PITCHAI_MENSAL  ")).toBe("pitchai_mensal");
  });

  it("passes through unknown slugs unchanged", () => {
    expect(normalizePlanSlug("custom_plan")).toBe("custom_plan");
  });
});

describe("resolvePlanQuota", () => {
  it("returns default gratuito quota for unknown plan", () => {
    const quota = resolvePlanQuota("unknown_plan");
    expect(quota.planSlug).toBe("gratuito");
    expect(quota.dailyTokenLimit).toBe(0);
    expect(quota.monthlyTokenLimit).toBe(0);
  });

  it("resolves pitchai_mensal quota correctly", () => {
    const quota = resolvePlanQuota("pitchai_mensal");
    expect(quota.planSlug).toBe("pitchai_mensal");
    expect(quota.dailyTokenLimit).toBe(500_000);
    expect(quota.monthlyTokenLimit).toBe(5_000_000);
    expect(quota.ttsMinutesLimit).toBe(0);
    expect(quota.allowedModel).toBe("flash");
  });

  it("resolves pitchai_trimestral quota correctly", () => {
    const quota = resolvePlanQuota("pitchai_trimestral");
    expect(quota.planSlug).toBe("pitchai_trimestral");
    expect(quota.dailyTokenLimit).toBe(1_200_000);
    expect(quota.monthlyTokenLimit).toBe(12_000_000);
    expect(quota.ttsMinutesLimit).toBe(180);
    expect(quota.allowedModel).toBe("both");
  });

  it("resolves pitchai_anual quota correctly", () => {
    const quota = resolvePlanQuota("pitchai_anual");
    expect(quota.planSlug).toBe("pitchai_anual");
    expect(quota.dailyTokenLimit).toBe(3_000_000);
    expect(quota.monthlyTokenLimit).toBe(30_000_000);
    expect(quota.ttsMinutesLimit).toBe(600);
    expect(quota.allowedModel).toBe("both");
  });

  it("applies aliases", () => {
    const quota = resolvePlanQuota("free");
    expect(quota.planSlug).toBe("gratuito");

    const quota2 = resolvePlanQuota("pro");
    expect(quota2.planSlug).toBe("pitchai_trimestral");
  });

  it("applies overrides", () => {
    const overrides = {
      pitchai_mensal: { dailyTokenLimit: 999_999 },
    };
    const quota = resolvePlanQuota("pitchai_mensal", overrides);
    expect(quota.dailyTokenLimit).toBe(999_999);
    expect(quota.monthlyTokenLimit).toBe(5_000_000); // untouched
  });

  it("clamps negative overrides to 0", () => {
    const overrides = {
      pitchai_mensal: { dailyTokenLimit: -100, monthlyTokenLimit: -200 },
    };
    const quota = resolvePlanQuota("pitchai_mensal", overrides);
    expect(quota.dailyTokenLimit).toBe(0);
    expect(quota.monthlyTokenLimit).toBe(0);
  });

  it("ignores non-object overrides", () => {
    const quota = resolvePlanQuota("pitchai_mensal", "bad");
    expect(quota.dailyTokenLimit).toBe(500_000);
  });
});

describe("formatTokenLimit", () => {
  it("formats millions with integer divisor", () => {
    expect(formatTokenLimit(5_000_000)).toBe("5 milhões");
  });

  it("formats millions with decimal divisor", () => {
    expect(formatTokenLimit(1_500_000)).toBe("1.5 milhões");
  });

  it("formats thousands in pt-BR", () => {
    expect(formatTokenLimit(500_000)).toMatch(/500/);
  });

  it("formats small values", () => {
    expect(formatTokenLimit(100)).toMatch(/100/);
  });
});

describe("getUpgradeOffer", () => {
  it("recommends trimestral when on mensal", () => {
    const offer = getUpgradeOffer("pitchai_mensal");
    expect(offer.recommendedPlan).toBe("pitchai_trimestral");
    expect(offer.url).toContain("pitchai_trimestral");
  });

  it("recommends anual when on trimestral", () => {
    const offer = getUpgradeOffer("pitchai_trimestral");
    expect(offer.recommendedPlan).toBe("pitchai_anual");
    expect(offer.url).toContain("pitchai_anual");
  });

  it("returns generic offer for anual (top tier)", () => {
    const offer = getUpgradeOffer("pitchai_anual");
    expect(offer.recommendedPlan).toBeNull();
    expect(offer.url).toBe("/planos");
  });

  it("normalizes aliases before resolving", () => {
    const offer = getUpgradeOffer("mensal");
    expect(offer.recommendedPlan).toBe("pitchai_trimestral");
  });

  it("returns generic offer for unknown plan", () => {
    const offer = getUpgradeOffer("unknown");
    expect(offer.recommendedPlan).toBeNull();
  });
});

describe("DEFAULT_PLAN_QUOTAS", () => {
  it("has entries for all standard plans", () => {
    expect(DEFAULT_PLAN_QUOTAS.gratuito).toBeDefined();
    expect(DEFAULT_PLAN_QUOTAS.pitchai_mensal).toBeDefined();
    expect(DEFAULT_PLAN_QUOTAS.pitchai_trimestral).toBeDefined();
    expect(DEFAULT_PLAN_QUOTAS.pitchai_anual).toBeDefined();
  });

  it("has monotonically increasing limits", () => {
    const order = ["gratuito", "pitchai_mensal", "pitchai_trimestral", "pitchai_anual"];
    for (let i = 1; i < order.length; i++) {
      expect(DEFAULT_PLAN_QUOTAS[order[i]].monthlyTokenLimit).toBeGreaterThan(
        DEFAULT_PLAN_QUOTAS[order[i - 1]].monthlyTokenLimit,
      );
    }
  });

  it("all quotas have 'block' as overLimitAction", () => {
    for (const q of Object.values(DEFAULT_PLAN_QUOTAS)) {
      expect(q.overLimitAction).toBe("block");
    }
  });
});

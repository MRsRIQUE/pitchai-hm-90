export type PlanQuota = {
  planSlug: string;
  planName: string;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  ttsMinutesLimit: number;
  allowedModel: "flash" | "pro" | "both";
  overLimitAction: "block" | "throttle" | "alert";
};

export const PLAN_QUOTA_SCHEMA_VERSION = 2;

/**
 * Limites comerciais padrão. O admin pode sobrescrevê-los em
 * admin_settings/plan_quotas sem precisar publicar uma nova versão.
 */
export const DEFAULT_PLAN_QUOTAS: Record<string, PlanQuota> = {
  gratuito: {
    planSlug: "gratuito",
    planName: "Gratuito",
    dailyTokenLimit: 0,
    monthlyTokenLimit: 0,
    ttsMinutesLimit: 0,
    allowedModel: "flash",
    overLimitAction: "block",
  },
  pitchai_mensal: {
    planSlug: "pitchai_mensal",
    planName: "Mensal",
    dailyTokenLimit: 500_000,
    monthlyTokenLimit: 5_000_000,
    ttsMinutesLimit: 0,
    allowedModel: "flash",
    overLimitAction: "block",
  },
  pitchai_trimestral: {
    planSlug: "pitchai_trimestral",
    planName: "Trimestral",
    dailyTokenLimit: 1_200_000,
    monthlyTokenLimit: 12_000_000,
    ttsMinutesLimit: 180,
    allowedModel: "both",
    overLimitAction: "block",
  },
  pitchai_anual: {
    planSlug: "pitchai_anual",
    planName: "Anual",
    dailyTokenLimit: 3_000_000,
    monthlyTokenLimit: 30_000_000,
    ttsMinutesLimit: 600,
    allowedModel: "both",
    overLimitAction: "block",
  },
};

const PLAN_ALIASES: Record<string, string> = {
  free: "gratuito",
  mensal: "pitchai_mensal",
  pro: "pitchai_trimestral",
  pro_mensal: "pitchai_mensal",
  pitchai_pro_monthly: "pitchai_mensal",
  trimestral: "pitchai_trimestral",
  anual: "pitchai_anual",
  pitchai_pro_yearly: "pitchai_anual",
  pitchai_max_monthly: "pitchai_anual",
  pitchai_max_yearly: "pitchai_anual",
};

export function normalizePlanSlug(plan?: string | null): string {
  const value = String(plan || "gratuito")
    .trim()
    .toLowerCase();
  return PLAN_ALIASES[value] || value;
}

export function resolvePlanQuota(
  plan: string,
  overrides?: Record<string, unknown> | null,
): PlanQuota {
  const slug = normalizePlanSlug(plan);
  const fallback = DEFAULT_PLAN_QUOTAS[slug] || DEFAULT_PLAN_QUOTAS.gratuito;
  const override = overrides?.[slug];
  if (!override || typeof override !== "object") return fallback;
  const candidate = { ...fallback, ...(override as Partial<PlanQuota>) };
  return {
    ...candidate,
    dailyTokenLimit: Math.max(0, Number(candidate.dailyTokenLimit) || 0),
    monthlyTokenLimit: Math.max(0, Number(candidate.monthlyTokenLimit) || 0),
    ttsMinutesLimit: Math.max(0, Number(candidate.ttsMinutesLimit) || 0),
  };
}

export type UpgradeOffer = {
  recommendedPlan: string | null;
  recommendedPlanName: string | null;
  url: string;
  cta: string;
  message: string;
};

export function getUpgradeOffer(
  plan: string,
  overrides?: Record<string, unknown> | null,
): UpgradeOffer {
  const slug = normalizePlanSlug(plan);
  if (slug === "pitchai_mensal") {
    const nextLimit = formatTokenLimit(
      resolvePlanQuota("pitchai_trimestral", overrides).monthlyTokenLimit,
    );
    return {
      recommendedPlan: "pitchai_trimestral",
      recommendedPlanName: "Trimestral",
      url: "/comprar?plan=pitchai_trimestral",
      cta: "Fazer upgrade para o Trimestral",
      message: `Faça upgrade para o Trimestral e tenha ${nextLimit} de tokens por mês, além de voz em tempo real.`,
    };
  }
  if (slug === "pitchai_trimestral") {
    const nextLimit = formatTokenLimit(
      resolvePlanQuota("pitchai_anual", overrides).monthlyTokenLimit,
    );
    return {
      recommendedPlan: "pitchai_anual",
      recommendedPlanName: "Anual",
      url: "/comprar?plan=pitchai_anual",
      cta: "Fazer upgrade para o Anual",
      message: `Faça upgrade para o Anual e aumente sua franquia para ${nextLimit} de tokens por mês.`,
    };
  }
  return {
    recommendedPlan: null,
    recommendedPlanName: null,
    url: "/planos",
    cta: "Ver opções de ampliação",
    message: "Consulte as opções de ampliação de franquia para continuar agora.",
  };
}

export function formatTokenLimit(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)} milhões`;
  }
  return value.toLocaleString("pt-BR");
}

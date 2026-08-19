/**
 * Fonte única de verdade dos planos do Pitch AI.
 * Consumido pela UI (/planos, /app, home) e pelo webhook de pagamento.
 * Nunca escreva preço hardcoded fora deste arquivo.
 */

export type PlanTier = "free" | "pro" | "max";

export type CompedAccessRecord = {
  email?: string | null;
  plan?: string | null;
  status?: string | null;
  grantedUntil?: string | null;
  /** Legado: algumas cortesias antigas foram gravadas com snake_case. */
  granted_until?: string | null;
  note?: string | null;
};

export type PitchaiPlan = {
  /** price_id no provedor de pagamento (lookup_key) */
  priceId: string;
  name: string;
  /** Valor total cobrado no ciclo, em centavos */
  amountCents: number;
  /** Meses cobertos pelo ciclo */
  months: number;
  badge?: string;
  highlight?: boolean;
  /** Se o recurso de áudio/voz da IA é permitido */
  allowAudio: boolean;
  audioNote: string;
};

export const PITCHAI_PLANS: PitchaiPlan[] = [
  {
    priceId: "pitchai_mensal",
    name: "Mensal",
    amountCents: 2790,
    months: 1,
    allowAudio: false,
    audioNote: "Áudio / Voz da IA bloqueado (apenas respostas em texto)",
  },
  {
    priceId: "pitchai_trimestral",
    name: "Trimestral",
    amountCents: 6790,
    months: 3,
    badge: "Economize 19%",
    highlight: true,
    allowAudio: true,
    audioNote: "Voz e áudio da IA liberados em tempo real",
  },
  {
    priceId: "pitchai_anual",
    name: "Anual",
    amountCents: 11790,
    months: 12,
    badge: "Economize 65%",
    allowAudio: true,
    audioNote: "Voz e áudio da IA liberados em tempo real",
  },
];

/** Legado de homologação: oculto da página pública e sem novas vendas. */
const PITCHAI_LEGACY_TEST_PLANS: PitchaiPlan[] = [
  {
    priceId: "pitchai_trimestral_teste_1real",
    name: "Trimestral — Teste R$ 1",
    amountCents: 100,
    months: 3,
    allowAudio: true,
    audioNote: "Mesmos recursos e limites do plano Trimestral",
  },
];

export function findPitchaiPlan(priceId: string): PitchaiPlan | undefined {
  return [...PITCHAI_PLANS, ...PITCHAI_LEGACY_TEST_PLANS].find((plan) => plan.priceId === priceId);
}

/** Converte planos de homologação para o plano comercial que libera os recursos. */
export function entitlementPlanId(priceId?: string | null): string {
  if (priceId === "pitchai_trimestral_teste_1real") return "pitchai_trimestral";
  return String(priceId || "free");
}

/** Benefícios incluídos — observação sobre áudio por plano. */
export const PLAN_FEATURES = [
  "Pitch contínuo com IA durante toda a live",
  "Respostas automáticas no chat com o nome do cliente",
  "Auto-fixar produto e leitura da vitrine",
  "Voz e áudio em tempo real (liberado nos planos Trimestral e Anual)",
  "Histórico de lives e analytics completos",
  "Suporte prioritário",
];

/** Estado sem assinatura: cadastro não concede uso da ferramenta. */
export const FREE_LIMITS = [
  "Painel e extensão bloqueados até a confirmação do pagamento",
  "Sem respostas de IA ou geração de voz",
  "Sem sessões de live",
];

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Preço equivalente por mês, para comparação entre ciclos. */
export function monthlyEquivalent(plan: PitchaiPlan): string {
  return formatBRL(Math.round(plan.amountCents / plan.months));
}

/** Mapa price_id → tier interno usado nos limites de uso. */
export const PRICE_TO_PLAN: Record<string, PlanTier> = {
  pitchai_mensal: "pro",
  pitchai_trimestral: "pro",
  pitchai_anual: "pro",
  pitchai_trimestral_teste_1real: "pro",
  // Legado: assinaturas criadas antes da unificação de preços.
  pitchai_pro_monthly: "pro",
  pitchai_pro_yearly: "pro",
  pitchai_max_monthly: "max",
  pitchai_max_yearly: "max",
};

/** Um acesso liberado pode vir de assinatura paga ou cortesia do admin. */
export function hasPaidAccess(
  sub?: {
    plan?: string | null;
    status?: string | null;
    granted_until?: string | null;
    current_period_end?: string | null;
  } | null,
): boolean {
  if (!sub) return false;
  if (!sub.plan || sub.plan === "free") return false;

  const isFutureDate = (value?: string | null) => {
    if (!value) return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > Date.now();
  };

  // Cortesia só é válida durante o período explicitamente concedido pelo admin.
  if (sub.status === "comped") return isFutureDate(sub.granted_until);

  // Somente pagamento confirmado e dentro da vigência libera a ferramenta.
  // `trialing` ainda pode não ter cobrança e `past_due` representa falha/atraso.
  if (sub.status !== "active") return false;
  return isFutureDate(sub.current_period_end) || isFutureDate(sub.granted_until);
}

/** Nome legível do plano. "free"/"gratuito" não são planos — é "sem plano". */
export function planDisplayName(plan?: string | null): string {
  if (!plan) return "Sem plano";
  const names: Record<string, string> = {
    pitchai_mensal: "Mensal",
    mensal: "Mensal",
    pitchai_trimestral: "Trimestral",
    trimestral: "Trimestral",
    pitchai_anual: "Anual",
    anual: "Anual",
    pitchai_trimestral_teste_1real: "Trimestral",
    pitchai_pro_monthly: "Pro Mensal",
    pitchai_pro_yearly: "Pro Anual",
    pitchai_max_monthly: "Max Mensal",
    pitchai_max_yearly: "Max Anual",
    pro: "Pro",
    max: "Max",
    free: "Sem plano",
    gratuito: "Sem plano",
  };
  return names[plan] ?? plan;
}

/** Nome exibido quando o acesso é cortesia — categoria própria, não um "plano". */
export const COMPED_LABEL = "Cortesia";

// ---------------------------------------------------------------------------
// Regras da cortesia
//
// Ficam aqui, num módulo que serve cliente e servidor, para o painel e a rota
// `/api/admin/courtesy` não divergirem: antes o teto de dias existia só no
// servidor e o plano só era aceito lá, sem o painel nunca enviar o campo.
// ---------------------------------------------------------------------------

/** Planos concedíveis por cortesia — só os que liberam voz/áudio da IA. */
export const COURTESY_PLAN_IDS = ["pitchai_trimestral", "pitchai_anual"] as const;
export type CourtesyPlanId = (typeof COURTESY_PLAN_IDS)[number];
export const COURTESY_DEFAULT_PLAN: CourtesyPlanId = "pitchai_trimestral";

/** Janela permitida por concessão. O teto antigo era 3650 (dez anos). */
export const COURTESY_MIN_DAYS = 1;
export const COURTESY_MAX_DAYS = 365;
export const COURTESY_DEFAULT_DAYS = 90;
/** Atalhos oferecidos no painel, para evitar digitar prazos longos por engano. */
export const COURTESY_DAY_PRESETS = [7, 30, 90, 180, 365] as const;

/** A justificativa deixou de ser opcional: toda cortesia precisa de motivo. */
export const COURTESY_NOTE_MIN = 3;
export const COURTESY_NOTE_MAX = 300;

export function isCourtesyPlanId(value: unknown): value is CourtesyPlanId {
  return COURTESY_PLAN_IDS.includes(value as CourtesyPlanId);
}

/** Valor de validade da cortesia, aceitando camelCase (atual) e snake_case (legado). */
export function compedGrantedUntil(comped?: CompedAccessRecord | null): string | null {
  return comped?.grantedUntil ?? comped?.granted_until ?? null;
}

export function hasActiveCompedAccess(comped?: CompedAccessRecord | null): boolean {
  if (!comped || comped.status !== "comped") return false;
  const until = compedGrantedUntil(comped);
  if (!until) return false;
  const timestamp = Date.parse(until);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

// ---------------------------------------------------------------------------
// Identificação e ordenação dos planos comerciais
// ---------------------------------------------------------------------------

/**
 * Converte qualquer identificador de plano (inclusive aliases e legado de
 * homologação) no price_id canônico do catálogo (`PITCHAI_PLANS`), ou null
 * quando não corresponde a nenhum plano comercial.
 */
export function canonicalPlanId(plan?: string | null): string | null {
  const value = String(plan || "").trim().toLowerCase();
  if (!value || value === "free" || value === "gratuito") return null;
  const aliases: Record<string, string> = {
    pitchai_mensal: "pitchai_mensal",
    mensal: "pitchai_mensal",
    pro_mensal: "pitchai_mensal",
    starter: "pitchai_mensal",
    pitchai_pro_monthly: "pitchai_mensal",
    pitchai_trimestral: "pitchai_trimestral",
    trimestral: "pitchai_trimestral",
    pitchai_trimestral_teste_1real: "pitchai_trimestral",
    pro: "pitchai_trimestral",
    studio: "pitchai_trimestral",
    pitchai_anual: "pitchai_anual",
    anual: "pitchai_anual",
    pitchai_pro_yearly: "pitchai_anual",
    pitchai_max_monthly: "pitchai_anual",
    pitchai_max_yearly: "pitchai_anual",
    max: "pitchai_anual",
  };
  return (
    aliases[value] ??
    PITCHAI_PLANS.find((p) => p.priceId === value)?.priceId ??
    null
  );
}

/**
 * Posição do plano no catálogo comercial derivada da ordem de `PITCHAI_PLANS`
 * (mensal < trimestral < anual). -1 quando o price_id não está no catálogo.
 */
export function planRank(priceId?: string | null): number {
  return PITCHAI_PLANS.findIndex((p) => p.priceId === priceId);
}

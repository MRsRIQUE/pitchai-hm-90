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

export function hasActiveCompedAccess(comped?: CompedAccessRecord | null): boolean {
  if (!comped || comped.status !== "comped" || !comped.grantedUntil) return false;
  const timestamp = Date.parse(comped.grantedUntil);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

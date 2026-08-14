/**
 * Fonte única de verdade dos planos do Pitch AI.
 * Consumido pela UI (/planos, /app, home) e pelo webhook de pagamento.
 * Nunca escreva preço hardcoded fora deste arquivo.
 */

export type PlanTier = "free" | "pro" | "max";

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
  /** Link direto de checkout */
  checkoutUrl: string;
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
    checkoutUrl: "https://go.perfectpay.com.br/PPU38CQERA9",
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
    checkoutUrl: "https://go.perfectpay.com.br/PPU38CQERAA",
    allowAudio: true,
    audioNote: "Voz e áudio da IA liberados em tempo real",
  },
  {
    priceId: "pitchai_anual",
    name: "Anual",
    amountCents: 11790,
    months: 12,
    badge: "Economize 65%",
    checkoutUrl: "https://go.perfectpay.com.br/PPU38CQERAB",
    allowAudio: true,
    audioNote: "Voz e áudio da IA liberados em tempo real",
  },
];

/** Benefícios incluídos — observação sobre áudio por plano. */
export const PLAN_FEATURES = [
  "Pitch contínuo com IA durante toda a live",
  "Respostas automáticas no chat com o nome do cliente",
  "Auto-fixar produto e leitura da vitrine",
  "Voz e áudio em tempo real (liberado nos planos Trimestral e Anual)",
  "Histórico de lives e analytics completos",
  "Suporte prioritário",
];

/** Limites técnicos do estado interno sem assinatura; não é oferta pública. */
export const FREE_LIMITS = [
  "100 respostas de chat por dia",
  "50 áudios de voz por dia",
  "1 canal de live",
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

/** Busca um plano pelo price_id — usado para retomar o checkout após o cadastro. */
export function getPlanByPriceId(priceId?: string | null): PitchaiPlan | undefined {
  if (!priceId) return undefined;
  return PITCHAI_PLANS.find((plan) => plan.priceId === priceId);
}

/**
 * Destino do botão "Assinar": o usuário passa pela criação de conta antes do
 * checkout, para que o pagamento já caia numa conta existente.
 */
export function signupLinkForPlan(plan: PitchaiPlan) {
  return { to: "/entrar", search: { mode: "signup" as const, plan: plan.priceId } };
}

/** Anexa o e-mail do usuário ao link de checkout para pré-popular o campo e
 *  permitir que o webhook de pagamento case a compra com a conta. */
export function checkoutUrlWithEmail(plan: PitchaiPlan, email?: string | null): string {
  if (!email) return plan.checkoutUrl;
  try {
    const url = new URL(plan.checkoutUrl);
    url.searchParams.set("email", email);
    return url.toString();
  } catch {
    return plan.checkoutUrl;
  }
}

/** Mapa price_id → tier interno usado nos limites de uso. */
export const PRICE_TO_PLAN: Record<string, PlanTier> = {
  pitchai_mensal: "pro",
  pitchai_trimestral: "pro",
  pitchai_anual: "pro",
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
  if (sub.granted_until && new Date(sub.granted_until) > new Date()) return true;
  const status = sub.status ?? "";
  if (!["active", "trialing", "past_due", "comped"].includes(status)) return false;
  if (sub.plan === "free") return false;
  if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) return false;
  return true;
}

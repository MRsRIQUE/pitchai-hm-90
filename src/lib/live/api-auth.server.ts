import crypto from "node:crypto";
import {
  fsGet,
  getAiTokenUsage,
  getSyncTokenOwner,
  getUserUsage,
  incrementAiTokenUsage,
  incrementUsageBestEffort,
  isAdmin,
} from "@/lib/firebase.server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import { PRICE_TO_PLAN, type PlanTier } from "@/lib/live/plans";
import { resolveUserAccess } from "@/lib/live/access.server";
import {
  getUpgradeOffer,
  PLAN_QUOTA_SCHEMA_VERSION,
  resolvePlanQuota,
  type PlanQuota,
  type UpgradeOffer,
} from "@/lib/live/quotas";

const seenNonces = new Map<string, number>();
const MAX_NONCES = 10000;

function isNonceReplayed(nonce: string, ts: number): boolean {
  if (!nonce) return false;
  const now = Date.now();
  // Remove expired nonces (older than 10 minutes).
  for (const [k, v] of seenNonces.entries()) {
    if (now - v > 600_000) seenNonces.delete(k);
  }
  // LRU bound: if still too many entries, evict oldest 25%.
  if (seenNonces.size >= MAX_NONCES) {
    const entries = [...seenNonces.entries()].sort((a, b) => a[1] - b[1]);
    const evictCount = Math.ceil(MAX_NONCES * 0.25);
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      seenNonces.delete(entries[i][0]);
    }
  }
  if (seenNonces.has(nonce)) return true;
  seenNonces.set(nonce, ts);
  return false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractSyncToken(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  let token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    token = request.headers.get("x-pitchai-token") || "";
  }
  return token;
}

function verifyHmac(request: Request, token: string, endpoint: string): boolean {
  const sig = request.headers.get("x-pitchai-signature");
  const tsStr = request.headers.get("x-pitchai-timestamp");
  const nonce = request.headers.get("x-pitchai-nonce") || "";

  // Em produção exigimos HMAC sempre; em dev deixamos passar (para facilitar testes locais).
  const isProduction = process.env.NODE_ENV === "production";
  if (!sig || !tsStr) {
    return !isProduction;
  }
  const ts = parseInt(tsStr, 10);
  const now = Date.now();
  if (isNaN(ts) || Math.abs(now - ts) > 300_000) return false;
  if (isNonceReplayed(nonce, ts)) return false;
  const expected = crypto
    .createHmac("sha256", token)
    .update(`${ts}:${nonce}:${endpoint}`)
    .digest("hex");
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

const CHAT_LIMITS: Record<PlanTier, number> = { free: 0, pro: 5000, max: 50000 };
const TTS_LIMITS: Record<PlanTier, number> = { free: 0, pro: 3000, max: 30000 };

export function planLimits(plan: string): { chat: number; tts: number; allowAudio: boolean } {
  const tier: PlanTier =
    plan === "pitchai_mensal" ||
    plan === "mensal" ||
    plan === "pro_mensal" ||
    plan === "pitchai_pro_monthly"
      ? "pro"
      : PRICE_TO_PLAN[plan] || (plan !== "free" && plan ? "pro" : "free");
  const allowAudio =
    tier !== "free" &&
    !(
      plan === "pitchai_mensal" ||
      plan === "mensal" ||
      plan === "pro_mensal" ||
      plan === "pitchai_pro_monthly"
    );
  return { chat: CHAT_LIMITS[tier], tts: TTS_LIMITS[tier], allowAudio };
}

export interface GuardResult {
  ok: boolean;
  status?: number;
  message?: string;
  userId?: string;
  plan?: string;
  remaining?: number;
  tier?: PlanTier;
  tokenUsed?: number;
  tokenLimit?: number;
  tokenRemaining?: number;
  dailyTokenUsed?: number;
  dailyTokenLimit?: number;
  quotaPeriod?: string;
  quotaResetAt?: string;
  quotaScope?: "daily" | "monthly";
  upgrade?: UpgradeOffer;
}

type TokenQuotaStatus = {
  used: number;
  limit: number;
  remaining: number;
  dailyUsed: number;
  dailyLimit: number;
  period: string;
  resetAt: string;
  exceeded: boolean;
  scope?: "daily" | "monthly";
  upgrade: UpgradeOffer;
};

let quotaSettingsCache: { value: Record<string, unknown>; expiresAt: number } | null = null;

async function loadPlanQuota(plan: string): Promise<PlanQuota> {
  if (!quotaSettingsCache || quotaSettingsCache.expiresAt <= Date.now()) {
    const doc = await fsGet("admin_settings/plan_quotas", { mode: "server" }).catch(() => null);
    const stored = (doc?.data as Record<string, unknown> | undefined) ?? {};
    quotaSettingsCache = {
      // Configurações antigas tinham a mesma franquia em todos os planos e
      // não sustentavam um upgrade real. A v2 começa com os novos padrões.
      value: Number(stored.quotaSchemaVersion) === PLAN_QUOTA_SCHEMA_VERSION ? stored : {},
      expiresAt: Date.now() + 60_000,
    };
  }
  return resolvePlanQuota(plan, quotaSettingsCache.value);
}

function quotaClock(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { day, month, nextDay: nextDay.toISOString(), nextMonth: nextMonth.toISOString() };
}

async function getTokenQuotaStatus(userId: string, plan: string): Promise<TokenQuotaStatus> {
  const clock = quotaClock();
  const [quota, usage] = await Promise.all([
    loadPlanQuota(plan),
    getAiTokenUsage(userId, clock.day, clock.month, { mode: "server" }),
  ]);
  const monthlyRemaining = Math.max(0, quota.monthlyTokenLimit - usage.monthly.totalTokens);
  const dailyExceeded = usage.daily.totalTokens >= quota.dailyTokenLimit;
  const monthlyExceeded = usage.monthly.totalTokens >= quota.monthlyTokenLimit;
  const scope = monthlyExceeded ? "monthly" : dailyExceeded ? "daily" : undefined;
  return {
    used: usage.monthly.totalTokens,
    limit: quota.monthlyTokenLimit,
    remaining: monthlyRemaining,
    dailyUsed: usage.daily.totalTokens,
    dailyLimit: quota.dailyTokenLimit,
    period: clock.month,
    resetAt: scope === "daily" ? clock.nextDay : clock.nextMonth,
    exceeded: Boolean(scope),
    scope,
    upgrade: getUpgradeOffer(plan, quotaSettingsCache?.value),
  };
}

function applyTokenQuota(result: GuardResult, quota: TokenQuotaStatus): GuardResult {
  return {
    ...result,
    tokenUsed: quota.used,
    tokenLimit: quota.limit,
    tokenRemaining: quota.remaining,
    dailyTokenUsed: quota.dailyUsed,
    dailyTokenLimit: quota.dailyLimit,
    quotaPeriod: quota.period,
    quotaResetAt: quota.resetAt,
    quotaScope: quota.scope,
    upgrade: quota.upgrade,
  };
}

async function resolveBySyncToken(token: string): Promise<string | null> {
  return getSyncTokenOwner(token);
}

async function resolveByUserToken(token: string): Promise<string | null> {
  try {
    const user = await verifyFirebaseIdToken(token);
    return user.uid;
  } catch {
    return null;
  }
}

async function authorizeUser(userId: string): Promise<GuardResult> {
  const [access, adminUsage] = await Promise.all([
    resolveUserAccess(userId, { mode: "server" }),
    fsGet(`ai_usage_stats/${userId}`, { mode: "server" }).catch(() => null),
  ]);
  if (adminUsage?.data?.status === "blocked") {
    return {
      ok: false,
      status: 403,
      message: "O acesso à IA desta conta foi bloqueado pela administração.",
      userId,
      remaining: 0,
    };
  }
  if (!access.active) {
    return {
      ok: false,
      status: 403,
      message: "Assinatura paga ativa necessária para utilizar o Pitch AI.",
      userId,
      plan: "free",
      remaining: 0,
      tier: "free",
    };
  }

  const plan = access.plan;
  return {
    ok: true,
    userId,
    plan,
    tier: PRICE_TO_PLAN[plan] || "pro",
  };
}

/** Autoriza operações da extensão apenas para uma licença paga/cortesia vigente. */
export async function authorizeSyncToken(token: string): Promise<GuardResult> {
  if (!token || !UUID_RE.test(token)) {
    return { ok: false, status: 401, message: "Sync token ausente ou inválido." };
  }

  const userId = await resolveBySyncToken(token).catch(() => null);
  if (!userId) return { ok: false, status: 401, message: "Sync token inválido." };
  return authorizeUser(userId);
}

async function resolveAndAuthorize(
  endpoint: "chat_reply" | "tts_speak",
  token: string,
): Promise<GuardResult> {
  const userId = UUID_RE.test(token) ? null : await resolveByUserToken(token);
  const access = UUID_RE.test(token)
    ? await authorizeSyncToken(token)
    : userId
      ? await authorizeUser(userId)
      : { ok: false, status: 401, message: "Credenciais inválidas" };

  if (!access.ok) return access;
  const authorizedUserId = access.userId;
  if (!authorizedUserId) return { ok: false, status: 401, message: "Credenciais inválidas" };

  const plan = access.plan || "free";
  const { chat, tts, allowAudio } = planLimits(plan);

  if (endpoint === "tts_speak" && !allowAudio) {
    return {
      ok: false,
      status: 403,
      message:
        "O recurso de áudio e voz da IA está bloqueado no plano Mensal. Faça upgrade para o plano Trimestral ou Anual para utilizar vozes em tempo real.",
      userId: authorizedUserId,
      plan,
      upgrade: getUpgradeOffer(plan),
    };
  }

  let tokenQuota: TokenQuotaStatus;
  try {
    tokenQuota = await getTokenQuotaStatus(authorizedUserId, plan);
  } catch (error) {
    console.error("[api-auth] Falha ao consultar franquia de tokens:", error);
    return {
      ok: false,
      status: 503,
      message: "Não foi possível confirmar sua franquia de tokens. Tente novamente em instantes.",
      userId: authorizedUserId,
      plan,
    };
  }

  if (tokenQuota.exceeded) {
    const scopeLabel = tokenQuota.scope === "daily" ? "diária" : "mensal";
    return applyTokenQuota(
      {
        ok: false,
        status: 429,
        message: `Sua franquia ${scopeLabel} de tokens chegou ao limite. ${tokenQuota.upgrade.message}`,
        userId: authorizedUserId,
        plan,
        remaining: 0,
      },
      tokenQuota,
    );
  }

  const day = new Date().toISOString().split("T")[0];
  const limit = endpoint === "chat_reply" ? chat : tts;
  const usage = await getUserUsage(authorizedUserId, day, { mode: "server" }).catch(() => null);
  const used = (usage ?? {})[endpoint] ?? 0;
  if (used >= limit) {
    return applyTokenQuota(
      {
        ok: false,
        status: 429,
        message: `Cota diária de IA esgotada para o plano '${plan}'. Faça upgrade para continuar.`,
        userId: authorizedUserId,
        plan,
        remaining: 0,
      },
      tokenQuota,
    );
  }

  const { count } = await incrementUsageBestEffort(authorizedUserId, day, endpoint);
  return applyTokenQuota(
    {
      ok: true,
      userId: authorizedUserId,
      plan,
      remaining: Math.max(0, limit - count),
      tier: PRICE_TO_PLAN[plan] || "free",
    },
    tokenQuota,
  );
}

/** Registra os tokens reais devolvidos pelo provedor e informa o saldo pós-chamada. */
export async function recordAiUsageTokens(
  guard: GuardResult,
  tokensInput: number,
  tokensOutput: number,
): Promise<TokenQuotaStatus> {
  if (!guard.userId || !guard.plan) throw new Error("Guard sem usuário ou plano");
  const clock = quotaClock();
  const quota = await loadPlanQuota(guard.plan);
  const usage = await incrementAiTokenUsage(
    guard.userId,
    clock.day,
    clock.month,
    tokensInput,
    tokensOutput,
    { mode: "server" },
  );
  const monthlyRemaining = Math.max(0, quota.monthlyTokenLimit - usage.monthly.totalTokens);
  const dailyExceeded = usage.daily.totalTokens >= quota.dailyTokenLimit;
  const monthlyExceeded = usage.monthly.totalTokens >= quota.monthlyTokenLimit;
  const scope = monthlyExceeded ? "monthly" : dailyExceeded ? "daily" : undefined;
  return {
    used: usage.monthly.totalTokens,
    limit: quota.monthlyTokenLimit,
    remaining: monthlyRemaining,
    dailyUsed: usage.daily.totalTokens,
    dailyLimit: quota.dailyTokenLimit,
    period: clock.month,
    resetAt: scope === "daily" ? clock.nextDay : clock.nextMonth,
    exceeded: Boolean(scope),
    scope,
    upgrade: getUpgradeOffer(guard.plan, quotaSettingsCache?.value),
  };
}

export async function guardApiRequest(
  request: Request,
  endpoint: "chat_reply" | "tts_speak",
): Promise<GuardResult> {
  const token = extractSyncToken(request);
  if (!token || !UUID_RE.test(token)) {
    return { ok: false, status: 401, message: "Missing or invalid sync token" };
  }
  if (!verifyHmac(request, token, endpoint)) {
    return { ok: false, status: 401, message: "Invalid HMAC signature" };
  }
  return resolveAndAuthorize(endpoint, token);
}

export async function guardAiRequest(
  request: Request,
  endpoint: "chat_reply" | "tts_speak",
): Promise<GuardResult> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, message: "Missing credentials" };
  return resolveAndAuthorize(endpoint, token);
}

export async function getSyncTokenStatus(token: string) {
  if (!token || !UUID_RE.test(token)) {
    return {
      ok: false,
      valid: false,
      locked: true,
      reason: "invalid_token",
      message: "Sync token ausente ou inválido.",
    };
  }

  const access = await authorizeSyncToken(token);
  if (!access.ok || !access.userId) {
    const paymentRequired = access.status === 403;
    return {
      ok: paymentRequired,
      valid: paymentRequired,
      locked: true,
      reason: paymentRequired ? "payment_required" : "invalid_token",
      userId: access.userId,
      plan: "free",
      remainingChat: 0,
      remainingTts: 0,
      chatLimit: 0,
      ttsLimit: 0,
      message: access.message,
    };
  }

  const userId = access.userId;
  const plan = access.plan || "free";

  const { chat: chatLimit, tts: ttsLimit, allowAudio } = planLimits(plan);
  const day = new Date().toISOString().split("T")[0];
  const usage = await getUserUsage(userId, day, { mode: "server" }).catch(() => null);
  const chatUsed = (usage ?? {})["chat_reply"] ?? 0;
  const ttsUsed = (usage ?? {})["tts_speak"] ?? 0;

  const remainingChat = Math.max(0, chatLimit - chatUsed);
  const remainingTts = Math.max(0, (allowAudio ? ttsLimit : 0) - ttsUsed);

  let tokenQuota: TokenQuotaStatus;
  try {
    tokenQuota = await getTokenQuotaStatus(userId, plan);
  } catch {
    return {
      ok: true,
      valid: true,
      // A indisponibilidade da cota não invalida a assinatura nem deve
      // bloquear os controles locais da live. Só as chamadas de IA fecham.
      locked: false,
      aiLocked: true,
      reason: "quota_unavailable",
      userId,
      plan,
      message: "Não foi possível confirmar sua franquia de tokens. Tente novamente em instantes.",
    };
  }

  if (tokenQuota.exceeded || (remainingChat <= 0 && remainingTts <= 0)) {
    const quotaMessage = tokenQuota.exceeded
      ? `Sua franquia ${tokenQuota.scope === "daily" ? "diária" : "mensal"} de tokens chegou ao limite. ${tokenQuota.upgrade.message}`
      : `Cota diária de IA esgotada para o plano '${plan}'. Faça upgrade para continuar.`;
    return {
      ok: true,
      valid: true,
      // A franquia limita somente chat/voz. Controles locais da live, como
      // fixar produto, proteção e encerramento, continuam autorizados.
      locked: false,
      aiLocked: true,
      reason: "quota_exceeded",
      userId,
      plan,
      remainingChat,
      remainingTts,
      chatLimit,
      ttsLimit,
      tokenUsed: tokenQuota.used,
      tokenLimit: tokenQuota.limit,
      tokenRemaining: tokenQuota.remaining,
      dailyTokenUsed: tokenQuota.dailyUsed,
      dailyTokenLimit: tokenQuota.dailyLimit,
      quotaPeriod: tokenQuota.period,
      quotaResetAt: tokenQuota.resetAt,
      quotaScope: tokenQuota.scope,
      upgrade: tokenQuota.upgrade,
      message: quotaMessage,
    };
  }

  return {
    ok: true,
    valid: true,
    locked: false,
    aiLocked: false,
    reason: null,
    userId,
    plan,
    remainingChat,
    remainingTts,
    chatLimit,
    ttsLimit,
    tokenUsed: tokenQuota.used,
    tokenLimit: tokenQuota.limit,
    tokenRemaining: tokenQuota.remaining,
    dailyTokenUsed: tokenQuota.dailyUsed,
    dailyTokenLimit: tokenQuota.dailyLimit,
    quotaPeriod: tokenQuota.period,
    quotaResetAt: tokenQuota.resetAt,
    upgrade: tokenQuota.upgrade,
    message: "Extensão autorizada e operando normalmente.",
  };
}

export async function checkIsAdmin(uid: string, email?: string | null): Promise<boolean> {
  return isAdmin(uid, email);
}

import crypto from "node:crypto";
import {
  getSyncTokenOwner,
  getUserUsage,
  incrementUsageBestEffort,
  isAdmin,
} from "@/lib/firebase.server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import { PRICE_TO_PLAN, type PlanTier } from "@/lib/live/plans";
import { resolveUserAccess } from "@/lib/live/access.server";

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
  const access = await resolveUserAccess(userId, { mode: "server" });
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
    };
  }

  const day = new Date().toISOString().split("T")[0];
  const limit = endpoint === "chat_reply" ? chat : tts;
  const usage = await getUserUsage(authorizedUserId, day, { mode: "server" }).catch(() => null);
  const used = (usage ?? {})[endpoint] ?? 0;
  if (used >= limit) {
    return {
      ok: false,
      status: 429,
      message: `Cota diária de IA esgotada para o plano '${plan}'. Faça upgrade para continuar.`,
      userId: authorizedUserId,
      plan,
      remaining: 0,
    };
  }

  const { count } = await incrementUsageBestEffort(authorizedUserId, day, endpoint);
  return {
    ok: true,
    userId: authorizedUserId,
    plan,
    remaining: Math.max(0, limit - count),
    tier: PRICE_TO_PLAN[plan] || "free",
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

  if (remainingChat <= 0 && remainingTts <= 0) {
    return {
      ok: true,
      valid: true,
      locked: true,
      reason: "quota_exceeded",
      userId,
      plan,
      remainingChat,
      remainingTts,
      chatLimit,
      ttsLimit,
      message: `Cota diária de IA esgotada para o plano '${plan}'. Faça upgrade para continuar.`,
    };
  }

  return {
    ok: true,
    valid: true,
    locked: false,
    reason: null,
    userId,
    plan,
    remainingChat,
    remainingTts,
    chatLimit,
    ttsLimit,
    message: "Extensão autorizada e operando normalmente.",
  };
}

export async function checkIsAdmin(uid: string, email?: string | null): Promise<boolean> {
  return isAdmin(uid, email);
}

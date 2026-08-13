import crypto from "node:crypto";
import {
  getSyncTokenOwner,
  getSubscription,
  getUserUsage,
  incrementUsageBestEffort,
  isAdmin,
} from "@/lib/firebase.server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import { PRICE_TO_PLAN, type PlanTier } from "@/lib/live/plans";

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

const CHAT_LIMITS: Record<PlanTier, number> = { free: 100, pro: 5000, max: 50000 };
const TTS_LIMITS: Record<PlanTier, number> = { free: 50, pro: 3000, max: 30000 };

export function planLimits(plan: string): { chat: number; tts: number; allowAudio: boolean } {
  const tier: PlanTier =
    plan === "pitchai_mensal" ||
    plan === "mensal" ||
    plan === "pro_mensal" ||
    plan === "pitchai_pro_monthly"
      ? "pro"
      : PRICE_TO_PLAN[plan] || (plan !== "free" && plan ? "pro" : "free");
  const allowAudio = !(
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

async function resolveAndAuthorize(
  request: Request,
  endpoint: "chat_reply" | "tts_speak",
  token: string,
): Promise<GuardResult> {
  const userId = UUID_RE.test(token)
    ? await resolveBySyncToken(token)
    : await resolveByUserToken(token);
  if (!userId) return { ok: false, status: 401, message: "Credenciais inválidas" };

  const sub = await getSubscription(userId, { mode: "server" }).catch(() => null);
  const plan =
    sub && sub.status && ["active", "trialing", "past_due", "comped"].includes(sub.status)
      ? sub.plan || "free"
      : "free";
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
  const usage = await getUserUsage(userId, day, { mode: "server" }).catch(() => null);
  const used = (usage ?? {})[endpoint] ?? 0;
  if (used >= limit) {
    return {
      ok: false,
      status: 429,
      message: `Cota diária de IA esgotada para o plano '${plan}'. Faça upgrade para continuar.`,
      userId,
      plan,
      remaining: 0,
    };
  }

  const { count } = await incrementUsageBestEffort(userId, day, endpoint);
  return {
    ok: true,
    userId,
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
  return resolveAndAuthorize(request, endpoint, token);
}

export async function guardAiRequest(
  request: Request,
  endpoint: "chat_reply" | "tts_speak",
): Promise<GuardResult> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, message: "Missing credentials" };
  return resolveAndAuthorize(request, endpoint, token);
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

  const userId = await getSyncTokenOwner(token);
  if (!userId) {
    return {
      ok: false,
      valid: false,
      locked: true,
      reason: "invalid_token",
      message: "Sync token não encontrado no servidor.",
    };
  }

  const sub = await getSubscription(userId, { mode: "server" }).catch(() => null);
  let plan = "free";
  let active = false;
  if (sub) {
    if (sub.granted_until && new Date(sub.granted_until) > new Date()) {
      plan = "pro";
      active = true;
    } else if (["active", "trialing", "comped"].includes(sub.status || "")) {
      plan = sub.plan || "free";
      active = true;
    }
  }

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

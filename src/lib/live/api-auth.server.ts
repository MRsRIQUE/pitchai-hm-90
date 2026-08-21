import crypto from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import {
  FirebaseServerCredentialsError,
  fsCreateIfAbsent,
  fsDelete,
  fsGet,
  fsSet,
  getAiTokenUsage,
  getSyncTokenOwner,
  getUserUsage,
  incrementAiTokenUsage,
  incrementUsageBestEffort,
  isAdmin,
} from "@/lib/firebase.server";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import { PRICE_TO_PLAN, planDisplayName, type PlanTier } from "@/lib/live/plans";
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
const NONCE_TTL_MS = 600_000;

function isNonceReplayedInMemory(nonce: string, ts: number): boolean {
  if (!nonce) return false;
  const now = Date.now();
  // Remove expired nonces (older than 10 minutes).
  for (const [k, v] of seenNonces.entries()) {
    if (now - v > NONCE_TTL_MS) seenNonces.delete(k);
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

/**
 * Camada persistente de anti-replay: grava o nonce no Firestore com
 * create-if-absent. Se o documento já existir, é replay (inclusive entre
 * instâncias/deployments). Best-effort: se o Firestore estiver indisponível,
 * cai para a checagem em memória.
 */
async function isNonceReplayedPersisted(nonce: string, ts: number): Promise<boolean> {
  if (!nonce) return false;
  try {
    const created = await fsCreateIfAbsent(
      "api_nonces",
      {
        createdAt: new Date(ts).toISOString(),
        expireAt: new Date(ts + NONCE_TTL_MS).toISOString(),
      },
      nonce,
      { mode: "server" },
    );
    return !created;
  } catch (error) {
    console.warn("[api-auth] anti-replay persistido indisponível, usando memória:", error);
    return false;
  }
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

async function verifyHmac(request: Request, token: string, endpoint: string): Promise<boolean> {
  const sig = request.headers.get("x-pitchai-signature");
  const tsStr = request.headers.get("x-pitchai-timestamp");
  const nonce = request.headers.get("x-pitchai-nonce") || "";

  // Em produção exigimos HMAC sempre. O bypass é OPT-IN via flag explícita
  // (nunca via NODE_ENV, que pode vir mal configurado no deploy) e serve
  // apenas para testes locais: PITCHAI_SKIP_HMAC=1 npm run dev
  const skipHmac = ["1", "true"].includes(String(process.env.PITCHAI_SKIP_HMAC));
  if (!sig || !tsStr) {
    return skipHmac;
  }
  const ts = parseInt(tsStr, 10);
  const now = Date.now();
  if (isNaN(ts) || Math.abs(now - ts) > 300_000) return false;
  if (isNonceReplayedInMemory(nonce, ts) || (await isNonceReplayedPersisted(nonce, ts))) {
    return false;
  }
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
  planName?: string;
  source?: "paid" | "comped" | "none";
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
  /** Motivo legível por máquina. Hoje só "device_mismatch" o preenche. */
  reason?: string;
  /** Desde quando a instalação atualmente vinculada está no ar (ISO). */
  boundAt?: string | null;
  /** Quando o desvínculo volta a ser permitido (ISO), se já foi usado hoje. */
  canReleaseAt?: string | null;
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
  let access: Awaited<ReturnType<typeof resolveUserAccess>>;
  let adminUsage: Awaited<ReturnType<typeof fsGet>>;
  try {
    [access, adminUsage] = await Promise.all([
      resolveUserAccess(userId, { mode: "server" }),
      fsGet(`ai_usage_stats/${userId}`, { mode: "server" }).catch(() => null),
    ]);
  } catch (error) {
    // Credencial de servidor ausente e falha NOSSA, e precisa sair pelo mesmo
    // canal de erro das rotas (JSON + CORS). Deixar o throw escapar viraria 500
    // sem CORS, que na extensao aparece como erro de rede em vez de mensagem.
    // Mesmo assim NAO devolvemos "sem plano": 503 diz que o acesso nao pode ser
    // verificado, e nao que a pessoa nao tem direito a ele.
    if (error instanceof FirebaseServerCredentialsError) {
      console.error("[api-auth] credenciais de servidor ausentes:", error.message);
      return {
        ok: false,
        status: 503,
        message:
          "Não foi possível verificar seu acesso agora. Isso é uma falha nossa, não do seu plano.",
        userId,
      };
    }
    throw error;
  }
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
    // Cortesia exibe o nome do plano concedido — é ele que define a franquia.
    planName: planDisplayName(plan),
    source: access.source,
    tier: PRICE_TO_PLAN[plan] || "pro",
  };
}

// ---------------------------------------------------------------------------
// Vínculo de instalação — uma extensão por conta
// ---------------------------------------------------------------------------
//
// O sync token sozinho não amarra ninguém: colado em três máquinas, funciona
// nas três. Aqui ele passa a valer para UMA instalação. A extensão sorteia um
// identificador na primeira execução, guarda no chrome.storage e o manda em
// todas as chamadas; a primeira chamada já autorizada amarra o par
// conta -> instalação, e as demais instalações são recusadas com um recado que
// diz o que fazer.
//
// Três decisões de projeto que valem a leitura, porque protegem o cliente
// legítimo antes do fraudador:
//   1. O vínculo é chaveado por UID, não por token. Trocar o token (regenerar
//      ou reparar) carrega o vínculo junto em vez de zerá-lo — sem isso, o
//      botão "gerar novo código" seria um desvínculo ilimitado pela porta dos
//      fundos, e a regra do "uma vez por dia" viraria enfeite.
//   2. Chamada SEM identificador de instalação NUNCA bloqueia. A extensão é
//      distribuída em .zip, sem atualização automática: no dia em que isto
//      subir, a base inteira ainda manda requisição sem o cabeçalho. Tratar
//      ausência como violação derrubaria todo mundo de uma vez.
//   3. Falha nossa libera. Se o Firestore não responder, o vendedor entra —
//      quem não conseguiu verificar fomos nós, e ninguém pode perder uma live
//      por causa disso. Só divergência confirmada fecha a porta.

/** Cabeçalho onde a extensão manda o identificador da instalação. */
const INSTALL_HEADER = "x-pitchai-install";
/** Desvínculo pelo próprio cliente: uma vez a cada 24h corridas. */
export const DEVICE_RELEASE_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * Cache curto do vínculo. O desvínculo tem que derrubar o outro navegador
 * "na hora", então este número é o atraso máximo dessa queda — 10s é
 * imperceptível para quem desvinculou e evita uma leitura por requisição.
 */
const BINDING_CACHE_TTL_MS = 10_000;
/** lastSeenAt é informação de suporte: uma gravação por hora basta. */
const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000;
const MAX_BINDING_CACHE = 5000;

export type DeviceBindingMode = "off" | "observar" | "exigir";

export type DeviceBinding = {
  installId: string;
  token: string;
  boundAt: string;
  lastSeenAt: string;
};

type DeviceMismatch = {
  ok: false;
  status: 403;
  message: string;
  reason: "device_mismatch";
  boundAt: string | null;
  canReleaseAt: string | null;
};

const bindingCache = new Map<string, { value: DeviceBinding | null; expiresAt: number }>();
let bindingModeCache: { value: DeviceBindingMode; expiresAt: number } | null = null;

function bindingPath(uid: string): string {
  return `device_bindings/${uid}`;
}

function releasePath(uid: string): string {
  return `device_binding_releases/${uid}`;
}

function rememberBinding(uid: string, value: DeviceBinding | null): void {
  if (bindingCache.size >= MAX_BINDING_CACHE) {
    const now = Date.now();
    for (const [key, entry] of bindingCache.entries()) {
      if (entry.expiresAt <= now) bindingCache.delete(key);
    }
    if (bindingCache.size >= MAX_BINDING_CACHE) {
      const oldest = bindingCache.keys().next().value;
      if (oldest) bindingCache.delete(oldest);
    }
  }
  bindingCache.set(uid, { value, expiresAt: Date.now() + BINDING_CACHE_TTL_MS });
}

/** Derruba o cache local para que o próximo pedido releia o vínculo do banco. */
export function forgetDeviceBinding(uid: string): void {
  bindingCache.delete(uid);
}

/**
 * Modo de operação da trava, em admin_settings/device_binding. Sem documento o
 * padrão é "exigir": a decisão do dono do produto foi travar desde o primeiro
 * dia. O documento existe para ele afrouxar ("observar" registra a divergência
 * mas libera; "off" desliga) sem precisar de deploy.
 */
export async function loadDeviceBindingMode(): Promise<DeviceBindingMode> {
  const now = Date.now();
  if (bindingModeCache && bindingModeCache.expiresAt > now) return bindingModeCache.value;
  const doc = await fsGet("admin_settings/device_binding", { mode: "server" }).catch(
    () => undefined,
  );
  if (doc === undefined) {
    // Leitura falhou: mantém o último modo conhecido em vez de inventar um.
    if (bindingModeCache) {
      bindingModeCache.expiresAt = now + 30_000;
      return bindingModeCache.value;
    }
    return "exigir";
  }
  const raw = String((doc?.data as Record<string, unknown> | undefined)?.mode ?? "");
  const value: DeviceBindingMode = raw === "off" || raw === "observar" ? raw : "exigir";
  bindingModeCache = { value, expiresAt: now + 60_000 };
  return value;
}

function extractInstallId(request: Request | null | undefined): string {
  const raw = (request?.headers?.get(INSTALL_HEADER) || "").trim().toLowerCase();
  return UUID_RE.test(raw) ? raw : "";
}

/**
 * Requisição em curso, quando quem chamou não teve como passá-la adiante.
 * Existe para que a trava valha também nos endpoints que só recebem o token no
 * corpo (live/config, live/session, live/mapping e live/verify) sem precisar
 * editá-los.
 */
function ambientRequest(): Request | null {
  try {
    return getRequest() ?? null;
  } catch {
    return null;
  }
}

export async function readDeviceBinding(uid: string, fresh = false): Promise<DeviceBinding | null> {
  if (!fresh) {
    const hit = bindingCache.get(uid);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }
  const doc = await fsGet(bindingPath(uid), { mode: "server" });
  const data = doc?.data as Record<string, unknown> | undefined;
  const installId = String(data?.installId ?? "").trim();
  const value: DeviceBinding | null = installId
    ? {
        installId,
        token: String(data?.token ?? ""),
        boundAt: String(data?.boundAt ?? ""),
        lastSeenAt: String(data?.lastSeenAt ?? ""),
      }
    : null;
  rememberBinding(uid, value);
  return value;
}

export async function readDeviceReleaseState(
  uid: string,
): Promise<{ lastReleaseAt: string | null; count: number }> {
  const doc = await fsGet(releasePath(uid), { mode: "server" }).catch(() => null);
  const data = doc?.data as Record<string, unknown> | undefined;
  const lastReleaseAt = String(data?.lastReleaseAt ?? "").trim();
  return {
    lastReleaseAt: lastReleaseAt || null,
    count: Number(data?.count ?? 0) || 0,
  };
}

/** Instante em que o desvínculo volta a ser permitido, ou null se já pode. */
export function nextReleaseAt(lastReleaseAt: string | null): string | null {
  if (!lastReleaseAt) return null;
  const at = Date.parse(lastReleaseAt);
  if (Number.isNaN(at)) return null;
  const next = at + DEVICE_RELEASE_WINDOW_MS;
  return next > Date.now() ? new Date(next).toISOString() : null;
}

/** "19/08 às 14h32" — o vendedor precisa da hora exata, não de um "amanhã". */
export function formatReleaseMoment(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")} às ${get("hour")}h${get("minute")}`;
}

async function bindDevice(uid: string, token: string, installId: string): Promise<boolean> {
  const now = new Date().toISOString();
  // create-if-absent resolve o empate no servidor: se duas máquinas chamarem no
  // mesmo instante, uma cria e a outra recebe false — sem "os dois ganharam".
  const created = await fsCreateIfAbsent(
    bindingPath(uid),
    { uid, installId, token, boundAt: now, lastSeenAt: now },
    { mode: "server" },
  );
  if (created) rememberBinding(uid, { installId, token, boundAt: now, lastSeenAt: now });
  else forgetDeviceBinding(uid);
  return created;
}

async function touchBinding(uid: string, token: string, binding: DeviceBinding): Promise<void> {
  const seenAt = Date.parse(binding.lastSeenAt);
  const stale = Number.isNaN(seenAt) || Date.now() - seenAt > LAST_SEEN_REFRESH_MS;
  // Token diferente do gravado acontece quando o código foi regenerado: o
  // vínculo continua o mesmo, só o código mudou.
  if (!stale && binding.token === token) return;
  const now = new Date().toISOString();
  try {
    await fsSet(bindingPath(uid), { lastSeenAt: now, token }, { mode: "server" });
    rememberBinding(uid, { ...binding, lastSeenAt: now, token });
  } catch (error) {
    console.warn("[api-auth] não foi possível atualizar o vínculo da instalação:", error);
  }
}

/**
 * O que dizer à extensão sobre o vínculo quando o acesso foi LIBERADO.
 *
 * Sem isto a extensão só sabe "passei", e passar tem várias causas que não são
 * "este navegador é o vinculado": pode não ter mandado identificador, o modo
 * pode estar off/observar, ou a leitura do Firestore pode ter falhado. O card
 * afirmava vínculo em todos esses casos — inventando uma resposta que ninguém
 * deu. Aqui a resposta passa a ser do servidor.
 */
async function describeBinding(
  userId: string,
  installId: string,
): Promise<{
  deviceBindingMode: DeviceBindingMode;
  deviceBound: boolean;
  deviceIsThis: boolean;
  boundAt: string | null;
  deviceKnown: boolean;
}> {
  const desconhecido = {
    deviceBindingMode: "exigir" as DeviceBindingMode,
    deviceBound: false,
    deviceIsThis: false,
    boundAt: null,
    deviceKnown: false,
  };
  // Sem identificador não há vínculo possível: dizer "não vinculado" seria
  // verdade, mas "não sabemos" é o que a extensão precisa ouvir para não
  // desenhar um estado que ela não pode sustentar.
  if (!installId) return desconhecido;
  try {
    const [mode, binding] = await Promise.all([loadDeviceBindingMode(), readDeviceBinding(userId)]);
    return {
      deviceBindingMode: mode,
      deviceBound: Boolean(binding),
      deviceIsThis: Boolean(binding && binding.installId === installId),
      boundAt: binding?.boundAt ?? null,
      deviceKnown: true,
    };
  } catch {
    return desconhecido;
  }
}

async function deviceMismatchResult(uid: string, boundAt: string | null): Promise<DeviceMismatch> {
  const release = await readDeviceReleaseState(uid).catch(() => ({
    lastReleaseAt: null,
    count: 0,
  }));
  const canReleaseAt = nextReleaseAt(release.lastReleaseAt);
  const espera = canReleaseAt
    ? ` Você já desvinculou hoje — poderá desvincular de novo em ${formatReleaseMoment(canReleaseAt)}.`
    : "";
  return {
    ok: false,
    status: 403,
    reason: "device_mismatch",
    boundAt: boundAt || null,
    canReleaseAt,
    // A mensagem nomeia o caso da reinstalação de propósito: sem loja, cada
    // atualização manual pode virar uma instalação nova, e o vendedor precisa
    // entender que não perdeu a assinatura nem está sendo acusado de nada.
    message:
      "Esta licença já está ativa em outro navegador. Se você acabou de atualizar ou reinstalar a extensão, este navegador conta como novo. Abra o painel do Pitch AI, vá em Conta e clique em “Desvincular navegador” — você pode fazer isso uma vez por dia." +
      espera,
  };
}

/**
 * Confere se a instalação que está chamando é a que tem direito à licença.
 * Devolve null quando pode seguir, e a recusa quando não pode.
 */
async function enforceDeviceBinding(
  userId: string,
  token: string,
  installId: string,
): Promise<DeviceMismatch | null> {
  // Sem identificador não há o que comparar. Isso é permanente enquanto a
  // extensão for distribuída em .zip: não coloque prazo nem data aqui.
  if (!installId) return null;

  const mode = await loadDeviceBindingMode().catch(() => "exigir" as DeviceBindingMode);
  if (mode === "off") return null;

  let binding: DeviceBinding | null;
  try {
    binding = await readDeviceBinding(userId);
  } catch (error) {
    console.warn("[api-auth] vínculo da instalação ilegível, liberando o acesso:", error);
    return null;
  }

  if (!binding) {
    let created: boolean;
    try {
      created = await bindDevice(userId, token, installId);
    } catch (error) {
      console.warn("[api-auth] não foi possível amarrar a instalação, liberando:", error);
      return null;
    }
    if (created) return null;
    // Outra instalação amarrou primeiro: relê sem cache antes de recusar.
    try {
      binding = await readDeviceBinding(userId, true);
    } catch {
      return null;
    }
    if (!binding) return null;
  }

  if (binding.installId === installId) {
    await touchBinding(userId, token, binding);
    return null;
  }

  if (mode === "observar") {
    console.info(
      `[api-auth] instalação divergente em modo observar uid=${userId} vinculada=${binding.installId.slice(-6)} chamando=${installId.slice(-6)}`,
    );
    return null;
  }

  return deviceMismatchResult(userId, binding.boundAt);
}

/**
 * Mantém o vínculo quando o código de conexão é trocado. É o que impede o
 * "gerar novo token" de virar um desvínculo sem limite: o código muda, a
 * instalação continua a mesma.
 */
export async function carryDeviceBindingToNewToken(uid: string, token: string): Promise<void> {
  try {
    const binding = await readDeviceBinding(uid, true);
    if (!binding) return;
    await fsSet(bindingPath(uid), { token }, { mode: "server" });
    rememberBinding(uid, { ...binding, token });
  } catch (error) {
    // Nunca impede a emissão do token: no pior caso o vínculo fica com o código
    // antigo gravado, e a própria checagem o corrige na chamada seguinte.
    console.warn("[api-auth] não foi possível transferir o vínculo para o novo token:", error);
  }
}

export type DeviceReleaseOutcome =
  | { ok: true; released: boolean; canReleaseAt: string | null; message: string }
  | { ok: false; status: 429 | 503; canReleaseAt: string | null; message: string };

/**
 * Desvincula a instalação atual. Só o dono da conta chega aqui, e só uma vez a
 * cada 24h. Quando não há nada vinculado a chamada não gasta a cota do dia —
 * seria cruel cobrar a única liberação diária por uma operação que não liberou
 * nada.
 */
export async function releaseDeviceBinding(
  uid: string,
  source: "painel" | "admin" = "painel",
): Promise<DeviceReleaseOutcome> {
  let release: { lastReleaseAt: string | null; count: number };
  let binding: DeviceBinding | null;
  try {
    [release, binding] = await Promise.all([
      readDeviceReleaseState(uid),
      readDeviceBinding(uid, true),
    ]);
  } catch (error) {
    console.error("[api-auth] falha ao ler o estado do vínculo para desvincular:", error);
    return {
      ok: false,
      status: 503,
      canReleaseAt: null,
      message:
        "Não foi possível desvincular agora. Isso é uma falha nossa — tente de novo em instantes.",
    };
  }

  if (!binding) {
    return {
      ok: true,
      released: false,
      canReleaseAt: nextReleaseAt(release.lastReleaseAt),
      message:
        "Nenhum navegador está vinculado. O próximo que abrir a extensão com o seu código será vinculado a ele.",
    };
  }

  const blockedUntil = nextReleaseAt(release.lastReleaseAt);
  if (blockedUntil) {
    return {
      ok: false,
      status: 429,
      canReleaseAt: blockedUntil,
      message: `Você já desvinculou nas últimas 24 horas. Poderá desvincular de novo em ${formatReleaseMoment(blockedUntil)}.`,
    };
  }

  const now = new Date().toISOString();
  try {
    await fsDelete(bindingPath(uid), { mode: "server" });
  } catch (error) {
    console.error("[api-auth] falha ao apagar o vínculo:", error);
    return {
      ok: false,
      status: 503,
      canReleaseAt: null,
      message:
        "Não foi possível desvincular agora. Isso é uma falha nossa — tente de novo em instantes.",
    };
  }
  forgetDeviceBinding(uid);
  // Só marca a cota depois de o vínculo ter caído de fato: se a gravação do
  // contador falhar, o cliente fica com um desvínculo a mais, nunca com um a
  // menos.
  await fsSet(
    releasePath(uid),
    { uid, lastReleaseAt: now, count: release.count + 1, lastReleasedBy: source },
    { mode: "server" },
  ).catch((error) => {
    console.warn("[api-auth] não foi possível registrar o desvínculo:", error);
  });

  return {
    ok: true,
    released: true,
    canReleaseAt: nextReleaseAt(now),
    message:
      "Navegador desvinculado. Abra a extensão no navegador que você quer usar para vinculá-lo — o anterior perde o acesso imediatamente.",
  };
}

/** Autoriza operações da extensão apenas para uma licença paga/cortesia vigente. */
export async function authorizeSyncToken(
  token: string,
  options: { request?: Request | null; installId?: string } = {},
): Promise<GuardResult> {
  if (!token || !UUID_RE.test(token)) {
    return { ok: false, status: 401, message: "Sync token ausente ou inválido." };
  }

  const userId = await resolveBySyncToken(token).catch(() => null);
  if (!userId) return { ok: false, status: 401, message: "Sync token inválido." };
  const access = await authorizeUser(userId);
  // Só amarra depois de o token e o plano terem passado: um token vazado não
  // pode prender a conta do dono legítimo numa instalação que não é dele.
  if (!access.ok) return access;

  const installId =
    options.installId && UUID_RE.test(options.installId)
      ? options.installId.toLowerCase()
      : extractInstallId(options.request ?? ambientRequest());
  const mismatch = await enforceDeviceBinding(userId, token, installId);
  return mismatch ? { ...access, ...mismatch } : access;
}

async function resolveAndAuthorize(
  endpoint: "chat_reply" | "tts_speak",
  token: string,
  request?: Request,
): Promise<GuardResult> {
  const userId = UUID_RE.test(token) ? null : await resolveByUserToken(token);
  const access = UUID_RE.test(token)
    ? await authorizeSyncToken(token, { request })
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
  if (!(await verifyHmac(request, token, endpoint))) {
    return { ok: false, status: 401, message: "Invalid HMAC signature" };
  }
  return resolveAndAuthorize(endpoint, token, request);
}

export async function guardAiRequest(
  request: Request,
  endpoint: "chat_reply" | "tts_speak",
): Promise<GuardResult> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, message: "Missing credentials" };
  return resolveAndAuthorize(endpoint, token, request);
}

export async function getSyncTokenStatus(token: string, request?: Request) {
  if (!token || !UUID_RE.test(token)) {
    return {
      ok: false,
      valid: false,
      locked: true,
      reason: "invalid_token",
      message: "Sync token ausente ou inválido.",
    };
  }

  const access = await authorizeSyncToken(token, { request });

  // Instalação diferente da vinculada. Sai como 200 porque isto é um endpoint
  // de estado — a extensão lê `valid`/`locked` e um 4xx aqui viraria "código
  // inválido" na cara de quem está com o código certo. E `valid: true` é
  // deliberado: o token vale e a assinatura está em dia; quem não está
  // autorizado é o navegador.
  if (access.reason === "device_mismatch") {
    return {
      ok: true,
      valid: true,
      locked: true,
      aiLocked: false,
      reason: "device_mismatch",
      userId: access.userId,
      plan: access.plan ?? "free",
      planName: access.plan ? planDisplayName(access.plan) : "Sem plano",
      remainingChat: 0,
      remainingTts: 0,
      chatLimit: 0,
      ttsLimit: 0,
      boundAt: access.boundAt ?? null,
      canReleaseAt: access.canReleaseAt ?? null,
      actionUrl: "/app?desvincular=1",
      message: access.message,
    };
  }

  // Falha NOSSA (503) nunca pode sair com cara de "sem plano": o token e o
  // acesso podem estar perfeitos e mesmo assim nao conseguimos verificar. Sair
  // como "invalid_token"/"Sem plano" era exatamente a mentira que este trabalho
  // veio remover — o 503 tem que chegar rotulado ate a ponta.
  if (access.status === 503) {
    return {
      ok: false,
      valid: false,
      locked: true,
      reason: "server_misconfigured",
      userId: access.userId,
      plan: null,
      planName: null,
      remainingChat: null,
      remainingTts: null,
      chatLimit: null,
      ttsLimit: null,
      message: access.message,
    };
  }

  if (!access.ok || !access.userId) {
    const paymentRequired = access.status === 403;
    return {
      ok: paymentRequired,
      valid: paymentRequired,
      locked: true,
      reason: paymentRequired ? "payment_required" : "invalid_token",
      userId: access.userId,
      plan: "free",
      planName: "Sem plano",
      remainingChat: 0,
      remainingTts: 0,
      chatLimit: 0,
      ttsLimit: 0,
      message: access.message,
    };
  }

  const userId = access.userId;
  const plan = access.plan || "free";
  const planName = planDisplayName(plan);

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
      planName,
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
      planName,
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

  const binding = await describeBinding(userId, extractInstallId(request ?? ambientRequest()));

  return {
    ok: true,
    valid: true,
    locked: false,
    aiLocked: false,
    reason: null,
    userId,
    ...binding,
    plan,
    planName,
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

import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit as firestoreLimit,
  getDocs,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import type { LiveConfig } from "./config";

export type LiveSessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  messages_answered: number;
  messages_ignored: number;
  messages_blocked: number;
  products_pitched: Array<{ name: string; id?: string | null; at?: string }> | null;
  tokens_in: number;
  tokens_out: number;
  tts_seconds: number;
  estimated_cost_cents: number;
  sales_snapshot: any | null;
  notes: string | null;
};

async function currentUser(): Promise<{ uid: string; email?: string | null } | null> {
  return new Promise((resolve) => {
    const auth = getFirebaseAuth();
    if (auth.currentUser) {
      return resolve({ uid: auth.currentUser.uid, email: auth.currentUser.email });
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user ? { uid: user.uid, email: user.email } : null);
    });
  });
}

/** Garante que existe um sync token para o usuário logado e devolve a config. */
export async function ensureMyLiveConfig(): Promise<{
  sync_token: string;
  config: Partial<LiveConfig>;
} | null> {
  const user = await currentUser();
  if (!user) return null;
  const uid = user.uid;
  const db = getFirebaseDb();

  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    const existingToken = (userDoc.data() as any)?.syncToken as string | undefined;

    if (existingToken) {
      const cfgDoc = await getDoc(doc(db, "live_configs_by_token", existingToken));
      return {
        sync_token: existingToken,
        config: (cfgDoc.data() as any)?.config ?? {},
      };
    }

    const newToken = crypto.randomUUID();
    await setDoc(doc(db, "sync_tokens", newToken), {
      uid,
      createdAt: new Date().toISOString(),
    });
    await setDoc(doc(db, "live_configs_by_token", newToken), {
      uid,
      config: {},
      updatedAt: new Date().toISOString(),
    });
    await setDoc(
      doc(db, "users", uid),
      { syncToken: newToken, email: user.email ?? null, createdAt: new Date().toISOString() },
      { merge: true },
    );
    return { sync_token: newToken, config: {} };
  } catch (err) {
    console.warn("[sync.ts] ensureMyLiveConfig falhou:", err);
    return null;
  }
}

/** Envia a config atual para o Firestore (doc público por token). */
export async function pushMyLiveConfig(config: LiveConfig): Promise<void> {
  const uid = (await currentUser())?.uid ?? null;
  if (!uid) return;
  const existing = await ensureMyLiveConfig();
  const token = existing?.sync_token;
  if (!token) return;
  const db = getFirebaseDb();
  await setDoc(
    doc(db, "live_configs_by_token", token),
    {
      uid,
      config: config as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export type VitrineItem = { name: string; price?: string; description?: string };

/**
 * Chaves que a barra injetada na live (extensão) liga/desliga em tempo real e
 * que o painel web precisa espelhar. São booleanos simples, sempre o último
 * clique vence — quem clicou por último (barra ou painel) manda.
 */
export const LIVE_CONTROL_KEYS = [
  "protecaoGeral",
  "violacao",
  "autoMod",
  "respostasIA",
  "revisarAntesDeEnviar",
] as const;

export type LiveControlKey = (typeof LIVE_CONTROL_KEYS)[number];
export type LiveControls = Partial<Record<LiveControlKey, boolean>>;

/**
 * Janela em que ignoramos o que vem do servidor logo depois de um clique local.
 * Sem isso, uma leitura que já estava em voo quando o usuário clicou volta com
 * o valor antigo e o botão "pula" sozinho de volta. Tem que ser menor que o
 * intervalo do auto-sync (20s) para o servidor voltar a mandar logo em seguida.
 */
const CONTROL_ECHO_WINDOW_MS = 8_000;

let lastLocalControlWriteAt = 0;

/** Marca que o painel acabou de escrever um controle (ver janela acima). */
export function markLocalControlWrite() {
  lastLocalControlWriteAt = Date.now();
}

/** true enquanto vale ignorar os controles vindos do servidor. */
export function isWithinControlEchoWindow(): boolean {
  return Date.now() - lastLocalControlWriteAt < CONTROL_ECHO_WINDOW_MS;
}

/** Lê só os booleanos de controle de um objeto de config remoto. */
export function extractLiveControls(remote: unknown): LiveControls {
  const source = (remote ?? {}) as Record<string, unknown>;
  const controls: LiveControls = {};
  for (const key of LIVE_CONTROL_KEYS) {
    if (typeof source[key] === "boolean") controls[key] = source[key] as boolean;
  }
  return controls;
}

/**
 * Grava APENAS os campos informados dentro de `config` no doc compartilhado.
 *
 * Nunca mande a config inteira daqui: o painel costuma estar com um estado
 * local mais velho que o da barra da live, e um push completo apagaria o que a
 * extensão acabou de ligar. O `merge: true` do SDK cliente faz merge profundo,
 * então só os campos listados aqui são tocados.
 */
export async function pushLiveConfigFields(fields: Partial<LiveConfig>): Promise<boolean> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return true;

  const uid = (await currentUser())?.uid ?? null;
  if (!uid) return false;
  const existing = await ensureMyLiveConfig();
  const token = existing?.sync_token;
  if (!token) return false;

  const db = getFirebaseDb();
  await setDoc(
    doc(db, "live_configs_by_token", token),
    {
      uid,
      config: Object.fromEntries(entries),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return true;
}

/** Publica os liga/desliga da barra da live. Ver `LIVE_CONTROL_KEYS`. */
export async function pushLiveControls(controls: LiveControls): Promise<boolean> {
  const entries = Object.entries(controls).filter(([, v]) => typeof v === "boolean");
  if (entries.length === 0) return true;

  markLocalControlWrite();
  try {
    return await pushLiveConfigFields(Object.fromEntries(entries) as Partial<LiveConfig>);
  } finally {
    // Uma leitura pode ter começado antes do write terminar; renova a janela.
    markLocalControlWrite();
  }
}

/**
 * Puxa o estado compartilhado com a extensão: os produtos que ela leu da
 * vitrine do TikTok e os controles da barra da live (Proteção, Auto Mod...).
 * Retorna null quando o usuário não está logado ou ainda não há config no backend.
 */
export async function pullVitrine(options?: { signal?: AbortSignal }): Promise<{
  items: VitrineItem[];
  updatedAt: string | null;
  controls: LiveControls;
} | null> {
  const { signal } = options || {};

  if (signal?.aborted) return null;

  try {
    const existing = await ensureMyLiveConfig();
    if (!existing?.sync_token) return null;
    const db = getFirebaseDb();
    const cfgDoc = await getDoc(doc(db, "live_configs_by_token", existing.sync_token));

    if (signal?.aborted) return null;
    if (!cfgDoc.exists()) return null;

    const data = cfgDoc.data() as any;
    const remote = data.config ?? {};
    const produtos: any[] = Array.isArray(remote.produtos) ? remote.produtos : [];

    const items = produtos
      .filter((p) => p?.fromVitrine && typeof p?.name === "string" && p.name.trim())
      .map((p) => ({
        name: String(p.name),
        price: typeof p.price === "string" ? p.price : undefined,
        description: typeof p.description === "string" ? p.description : undefined,
      }));

    return {
      items,
      updatedAt: data.updatedAt ?? null,
      controls: extractLiveControls(remote),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return null;
    throw error;
  }
}

export async function regenerateSyncToken(): Promise<string | null> {
  const uid = (await currentUser())?.uid ?? null;
  if (!uid) return null;
  const db = getFirebaseDb();

  try {
    const existing = await ensureMyLiveConfig();
    const oldToken = existing?.sync_token;
    const oldConfig = existing?.config ?? {};

    const newToken = crypto.randomUUID();
    await setDoc(doc(db, "sync_tokens", newToken), {
      uid,
      createdAt: new Date().toISOString(),
    });
    await setDoc(doc(db, "live_configs_by_token", newToken), {
      uid,
      config: oldConfig,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, "users", uid), { syncToken: newToken }, { merge: true });

    if (oldToken) {
      await deleteDoc(doc(db, "sync_tokens", oldToken)).catch(() => {});
      await deleteDoc(doc(db, "live_configs_by_token", oldToken)).catch(() => {});
    }
    return newToken;
  } catch (err) {
    console.warn("[sync.ts] regenerateSyncToken falhou:", err);
    return null;
  }
}

export async function listMySessions(limit = 50): Promise<LiveSessionRow[]> {
  const uid = (await currentUser())?.uid ?? null;
  if (!uid) return [];
  const db = getFirebaseDb();
  const q = query(
    collection(db, "users", uid, "sessions"),
    orderBy("started_at", "desc"),
    firestoreLimit(limit),
  );
  const snap = await getDocs(q);
  return snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }) as unknown as LiveSessionRow,
  );
}

export async function deleteSession(id: string): Promise<void> {
  const uid = (await currentUser())?.uid ?? null;
  if (!uid) return;
  const db = getFirebaseDb();
  await deleteDoc(doc(db, "users", uid, "sessions", id));
}

/** Quantidade de vendas registradas na sessão de live mais recente. */
export async function pollSalesCount(): Promise<number | null> {
  const uid = (await currentUser())?.uid ?? null;
  if (!uid) return null;
  const db = getFirebaseDb();
  const q = query(
    collection(db, "users", uid, "sessions"),
    orderBy("started_at", "desc"),
    firestoreLimit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;
  const data = snap.docs[0].data() as any;
  const snapList = data.sales_snapshot;
  return Array.isArray(snapList) ? snapList.length : 0;
}

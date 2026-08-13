import firebaseConfigData from "../../firebase-applet-config.json";

export const FIREBASE_PROJECT_ID = firebaseConfigData.projectId;
export const FIREBASE_API_KEY = firebaseConfigData.apiKey;
export const FIREBASE_DATABASE_ID = firebaseConfigData.firestoreDatabaseId;
export const FIREBASE_SERVER_EMAIL = process.env.FIREBASE_SERVER_EMAIL || "";

const IDENTITYTOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}`;

export interface FirebaseUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

/**
 * Verifica um ID token do Firebase via Identity Toolkit (REST).
 * Não requer service account — somente a API key pública do projeto.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseUserInfo> {
  const res = await fetch(`${IDENTITYTOOLKIT_URL}/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Unauthorized: invalid Firebase ID token (${msg})`);
  }
  const user = body?.users?.[0];
  if (!user?.localId) {
    throw new Error("Unauthorized: no user found in Firebase ID token");
  }
  return {
    uid: user.localId,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    emailVerified: !!user.emailVerified,
  };
}

// ---------------------------------------------------------------------------
// Auth de servidor (sem service account): usa uma conta Firebase criada no
// console com email/senha e faz signInWithPassword via REST.
// ---------------------------------------------------------------------------

let serverTokenCache: { token: string; expiresAt: number } | undefined;
// Promise em-flight para evitar 2 chamadas concorrentes a signInWithPassword
// que poderiam invalidar o token da primeira chamada (race condition).
let inflightServerToken: Promise<string> | null = null;

async function acquireServerToken(): Promise<string> {
  const email = process.env.FIREBASE_SERVER_EMAIL;
  const password = process.env.FIREBASE_SERVER_PASSWORD;
  if (!email || !password) {
    throw new Error("FIREBASE_SERVER_EMAIL/FIREBASE_SERVER_PASSWORD nao configurados");
  }
  if (serverTokenCache && serverTokenCache.expiresAt > Date.now() + 60_000) {
    return serverTokenCache.token;
  }
  if (inflightServerToken) {
    return inflightServerToken;
  }
  inflightServerToken = (async () => {
    const res = await fetch(
      `${IDENTITYTOOLKIT_URL}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.idToken) {
      // Evita vazamento de credenciais em logs — mensagem genérica sanitizada.
      throw new Error("Falha ao autenticar servidor Firebase");
    }
    const expiresInSeconds = Number(body?.expiresIn ?? 3600);
    serverTokenCache = {
      token: body.idToken,
      expiresAt: Date.now() + (expiresInSeconds - 60) * 1000,
    };
    return body.idToken as string;
  })();
  try {
    return await inflightServerToken;
  } finally {
    inflightServerToken = null;
  }
}

export type FirestoreAuthMode = "public" | "server";

async function authorization(
  mode: FirestoreAuthMode,
  userToken?: string,
): Promise<{ headers: Record<string, string>; key: string }> {
  if (mode === "server") {
    const token = await acquireServerToken();
    return { headers: { authorization: `Bearer ${token}` }, key: "" };
  }
  if (userToken) {
    return { headers: { authorization: `Bearer ${userToken}` }, key: "" };
  }
  return { headers: {}, key: `?key=${encodeURIComponent(FIREBASE_API_KEY)}` };
}

// ---------------------------------------------------------------------------
// Encoding/decoding de valores Firestore (formato REST)
// ---------------------------------------------------------------------------

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => encodeValue(v)) } };
  }
  if (typeof value === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields[k] = encodeValue(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function decodeValue(value: Record<string, unknown> | undefined): unknown {
  if (!value) return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue as string;
  if ("booleanValue" in value) return value.booleanValue as boolean;
  if ("integerValue" in value) return Number(value.integerValue as string);
  if ("doubleValue" in value) return value.doubleValue as number;
  if ("timestampValue" in value) return value.timestampValue as string;
  if ("referenceValue" in value) return value.referenceValue as string;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: Array<Record<string, unknown>> })?.values ?? [];
    return values.map((v) => decodeValue(v));
  }
  if ("mapValue" in value) {
    const fields = (value.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields;
    return decodeFields(fields ?? {});
  }
  return null;
}

function decodeFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeValue(v);
  return out;
}

export interface FirestoreDocument {
  id: string;
  data: Record<string, unknown>;
}

function parseDocument(doc: any): FirestoreDocument {
  const id = doc?.name?.split("/").pop() ?? "";
  return { id, data: decodeFields(doc?.fields ?? {}) };
}

// ---------------------------------------------------------------------------
// Operações Firestore via REST
// ---------------------------------------------------------------------------

export async function fsGet(
  path: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<FirestoreDocument | null> {
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const url = `${FIRESTORE_BASE_URL}/documents/${path}${key}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Firestore GET ${path} falhou: ${body?.error?.message ?? res.status}`);
  }
  return parseDocument(await res.json());
}

export async function fsSet(
  path: string,
  data: Record<string, unknown>,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const fieldPaths = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const separator = fieldPaths ? (key ? "&" : "?") : "";
  const url = `${FIRESTORE_BASE_URL}/documents/${path}${key}${separator}${fieldPaths}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)])),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Firestore PATCH ${path} falhou: ${body?.error?.message ?? res.status}`);
  }
}

export async function fsDelete(
  path: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const url = `${FIRESTORE_BASE_URL}/documents/${path}${key}`;
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Firestore DELETE ${path} falhou: ${body?.error?.message ?? res.status}`);
  }
}

export type FirestoreWhere = {
  field: string;
  op: "EQUAL" | "GREATER_THAN" | "LESS_THAN" | "ARRAY_CONTAINS";
  value: unknown;
};

export interface FirestoreQueryOptions {
  where?: FirestoreWhere[];
  orderBy?: { field: string; direction: "ASCENDING" | "DESCENDING" };
  limit?: number;
  mode?: FirestoreAuthMode;
  userToken?: string;
}

export async function fsQuery(
  collectionPath: string,
  options: FirestoreQueryOptions = {},
): Promise<FirestoreDocument[]> {
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const segments = collectionPath.split("/");
  // detecta subcoleção (path com > 2 segmentos: col/doc/col2 → parent + child).
  const hasParent = segments.length > 2;
  const collectionId = segments[segments.length - 1];
  const parent = hasParent ? segments.slice(0, -1).join("/") : "";
  const structuredQuery: Record<string, unknown> = {
    from: hasParent ? [{ collectionId, allDescendants: false }] : [{ collectionId }],
  };
  if (options.where?.length) {
    structuredQuery.where = buildFilter(options.where);
  }
  if (options.orderBy) {
    structuredQuery.orderBy = [
      { field: { fieldPath: options.orderBy.field }, direction: options.orderBy.direction },
    ];
  }
  if (options.limit != null) {
    structuredQuery.limit = { value: options.limit };
  }
  const url = `${FIRESTORE_BASE_URL}/documents${parent ? `/${parent}` : ""}:runQuery${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Firestore QUERY ${collectionPath} falhou: ${body?.error?.message ?? res.status}`,
    );
  }
  const items = await res.json();
  return (Array.isArray(items) ? items : [])
    .filter((r: any) => r?.document)
    .map((r: any) => parseDocument(r.document));
}

function singleFilter(cond: FirestoreWhere): Record<string, unknown> {
  return {
    fieldFilter: {
      field: { fieldPath: cond.field },
      op: cond.op,
      value: encodeValue(cond.value),
    },
  };
}

function buildFilter(conditions: FirestoreWhere[]): Record<string, unknown> {
  if (conditions.length === 1) return singleFilter(conditions[0]);
  return {
    compositeFilter: {
      op: "AND",
      filters: conditions.map(singleFilter),
    },
  };
}

export async function fsCreate(
  collectionPath: string,
  data: Record<string, unknown>,
  docId?: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<string> {
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const docIdQuery = docId ? `documentId=${encodeURIComponent(docId)}` : "";
  const queryParams = [docIdQuery, key ? key.slice(1) : ""].filter(Boolean).join("&");
  const url = `${FIRESTORE_BASE_URL}/documents/${collectionPath}${queryParams ? `?${queryParams}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)])),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Firestore CREATE ${collectionPath} falhou: ${body?.error?.message ?? res.status}`,
    );
  }
  const created = await res.json();
  return created?.name?.split("/").pop() ?? "";
}

// ---------------------------------------------------------------------------
// Modelo de dados do app (coleções)
// ---------------------------------------------------------------------------

export type SubscriptionData = {
  plan: string;
  status: string;
  granted_until: string | null;
  current_period_end: string | null;
  updated_at?: string;
  user_id?: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  cancel_at_period_end?: boolean;
};

export type UsageEvent = {
  uid: string;
  endpoint: string;
  day: string;
  at: string;
};

export type ReferralClaim = {
  referrerUid: string;
  refereeUid: string;
  code: string;
  status: string;
  createdAt: string;
};

// sync_tokens/{token} — mapeia token -> usuário
export async function getSyncTokenOwner(token: string): Promise<string | null> {
  const doc = await fsGet(`sync_tokens/${token}`, { mode: "public" });
  return (doc?.data?.uid as string) ?? null;
}

export async function createSyncToken(
  token: string,
  uid: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(`sync_tokens/${token}`, { uid, createdAt: new Date().toISOString() }, options);
}

// live_configs_by_token/{token} — config pública lida pela extensão
export async function getLiveConfigByToken(token: string) {
  const doc = await fsGet(`live_configs_by_token/${token}`, { mode: "public" });
  if (!doc) return null;
  return {
    uid: doc.data.uid as string,
    config: (doc.data.config as Record<string, unknown>) ?? {},
    updatedAt: (doc.data.updatedAt as string) ?? null,
  };
}

export async function setLiveConfigByToken(
  token: string,
  data: { uid: string; config: unknown; updatedAt?: string },
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(
    `live_configs_by_token/${token}`,
    {
      uid: data.uid,
      config: data.config,
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    },
    options,
  );
}

// users/{uid}/subscription/current — plano e assinatura
export async function getSubscription(
  uid: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<SubscriptionData | null> {
  const doc = await fsGet(`users/${uid}/subscription/current`, options);
  if (!doc) return null;
  return doc.data as unknown as SubscriptionData;
}

export async function setSubscription(
  uid: string,
  data: SubscriptionData,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(`users/${uid}/subscription/current`, { ...data, user_id: uid }, options);
}

// users/{uid} — busca por e-mail (usado por webhooks de pagamento e ativação)
export async function getUserByEmail(
  email: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<FirestoreDocument | null> {
  const res = await fsQuery("users", {
    ...options,
    where: [{ field: "email", op: "EQUAL", value: email.toLowerCase().trim() }],
    limit: 1,
  });
  return res[0] ?? null;
}

export async function setUserEmailIndex(
  uid: string,
  email: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  if (!email) return;
  await fsSet(`users/${uid}`, { email: email.toLowerCase().trim() }, options);
}

// users/{uid}/sessions — sessões de live
export async function listSessions(
  uid: string,
  limit = 50,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
) {
  return fsQuery(`users/${uid}/sessions`, {
    ...options,
    orderBy: { field: "started_at", direction: "DESCENDING" },
    limit,
  });
}

export async function createSession(
  uid: string,
  sessionId: string,
  data: Record<string, unknown>,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(`users/${uid}/sessions/${sessionId}`, data, options);
}

// users/{uid}/usage/{day} — contadores por dia (doc unico por dia)
export async function getUserUsage(
  uid: string,
  day: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<Record<string, number> | null> {
  const doc = await fsGet(`users/${uid}/usage/${day}`, options);
  if (!doc) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(doc.data)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}

export async function incrementUsage(
  uid: string,
  day: string,
  endpoint: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<number> {
  // Incremento atômico via Firestore REST `commit` com FieldTransform.increment.
  // Evita a race condition do read-modify-write (perde contagem em concorrência).

  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const docPath = `users/${uid}/usage/${day}`;
  const docName = `projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/${docPath}`;
  // URL do commit no parent da collection.
  const url = `${FIRESTORE_BASE_URL}/documents/users/${uid}/usage:commit${key}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      writes: [
        {
          // Transform atômico no campo `endpoint`: incrementa em 1.
          // O Firestore cria o documento automaticamente se não existir.
          transform: {
            field: endpoint,
            incrementValue: { integerValue: "1" },
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      `Firestore commit increment ${docPath} falhou: ${errBody?.error?.message ?? res.status}`,
    );
  }

  // Lê o valor pós-increment para retornar o contador atualizado.
  const updated = await getUserUsage(uid, day, options);
  return (updated ?? {})[endpoint] ?? 0;
}

/**
 * Incrementa a cota diária com degradação graciosa: se o modo servidor não
 * estiver configurado, tenta como usuário; se falhar, apenas lê o uso atual.
 */
export async function incrementUsageBestEffort(
  uid: string,
  day: string,
  endpoint: string,
  userToken?: string,
): Promise<{ count: number; incremented: boolean }> {
  const attempts: Array<{ mode?: FirestoreAuthMode; userToken?: string }> = [];
  if (userToken) attempts.push({ mode: "public", userToken });
  attempts.push({ mode: "server" });
  let lastError: unknown;
  for (const opts of attempts) {
    try {
      const count = await incrementUsage(uid, day, endpoint, opts);
      return { count, incremented: true };
    } catch (err) {
      lastError = err;
    }
  }
  console.warn("[firebase.server] incrementUsageBestEffort falhou:", lastError);
  const current = await getUserUsage(uid, day, { mode: "public", userToken });
  return { count: (current ?? {})[endpoint] ?? 0, incremented: false };
}

// referral_claims — pedidos de indicação
export async function createReferralClaim(
  claimId: string,
  data: ReferralClaim,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(`referral_claims/${claimId}`, data, options);
}

// ranked_products — ranking de produtos (somente leitura pública)
export async function getRankedProducts(
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
) {
  return fsQuery("ranked_products", {
    ...options,
    orderBy: { field: "createdAt", direction: "DESCENDING" },
  });
}

export async function setRankedProduct(
  productId: string,
  data: Record<string, unknown>,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(`ranked_products/${productId}`, data, options);
}

// admins — verificação de admin (leitura pública)
export async function isAdmin(uid: string): Promise<boolean> {
  const doc = await fsGet(`admins/${uid}`, { mode: "public" });
  return !!doc?.data?.role;
}

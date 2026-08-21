import firebaseConfigData from "../../firebase-applet-config.json";

export const FIREBASE_PROJECT_ID = firebaseConfigData.projectId;
export const FIREBASE_API_KEY = firebaseConfigData.apiKey;
export const FIREBASE_DATABASE_ID = firebaseConfigData.firestoreDatabaseId;

const IDENTITYTOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}`;
const FIRESTORE_RESOURCE_ROOT = `projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}`;

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
// Auth de servidor: service account (fluxo OAuth2 JWT-bearer).
//
// Substitui o login email/senha da antiga conta técnica. O access token emitido
// para a service account tem acesso administrativo ao Firestore e NÃO passa
// pelas regras de segurança, então rotinas sem usuário (webhook de pagamento,
// jobs) deixam de depender de `firestore.rules` estar publicado e de uma senha
// que também serviria para logar no app como usuário comum.
// ---------------------------------------------------------------------------

const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

type ServiceAccountCredentials = { clientEmail: string; privateKey: string };

let serviceAccountCache: ServiceAccountCredentials | null | undefined;

/**
 * Aceita a credencial em dois formatos:
 *  - FIREBASE_SERVICE_ACCOUNT: o JSON da service account (texto ou base64);
 *  - FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY: os dois campos avulsos.
 */
function loadServiceAccount(): ServiceAccountCredentials | null {
  if (serviceAccountCache !== undefined) return serviceAccountCache;

  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (raw) {
    // Painéis de deploy costumam quebrar JSON multilinha, então o valor também
    // pode vir em base64.
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    try {
      const parsed = JSON.parse(json);
      if (parsed?.client_email && parsed?.private_key) {
        serviceAccountCache = {
          clientEmail: String(parsed.client_email),
          privateKey: normalizePrivateKey(String(parsed.private_key)),
        };
        return serviceAccountCache;
      }
    } catch {
      // Cai no formato avulso abaixo; o erro concreto é reportado por quem chama.
    }
  }

  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  if (clientEmail && privateKey) {
    serviceAccountCache = { clientEmail, privateKey: normalizePrivateKey(privateKey) };
    return serviceAccountCache;
  }

  serviceAccountCache = null;
  return null;
}

/** Variáveis de ambiente entregam a chave PEM com "\n" literal. */
function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, "\n").trim();
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const buf = Buffer.from(body, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString("base64url");
}

async function signServiceAccountJwt(account: ServiceAccountCredentials): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FIRESTORE_SCOPE,
      aud: GOOGLE_TOKEN_URI,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(account.privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(signature)}`;
}

let serverTokenCache: { token: string; expiresAt: number } | undefined;
// Promise em-flight para evitar duas trocas de token concorrentes.
let inflightServerToken: Promise<string> | null = null;

/**
 * Falha de CONFIGURAÇÃO do servidor, não de dados. Precisa de um tipo próprio
 * porque quem lê acesso (`resolveUserAccess`) engolia qualquer erro e devolvia
 * "sem acesso" — o que fazia uma variável de ambiente ausente ser exibida ao
 * cliente como "Sem plano", inclusive para quem tinha cortesia ativa.
 */
export class FirebaseServerCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseServerCredentialsError";
  }
}

async function acquireServerToken(): Promise<string> {
  const account = loadServiceAccount();
  if (!account) {
    throw new FirebaseServerCredentialsError(
      "Credenciais de servidor Firebase nao configuradas (FIREBASE_SERVICE_ACCOUNT ou FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)",
    );
  }
  if (serverTokenCache && serverTokenCache.expiresAt > Date.now() + 60_000) {
    return serverTokenCache.token;
  }
  if (inflightServerToken) {
    return inflightServerToken;
  }
  inflightServerToken = (async () => {
    const assertion = await signServiceAccountJwt(account);
    const res = await fetch(GOOGLE_TOKEN_URI, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.access_token) {
      // Evita vazamento de credenciais em logs — mensagem genérica sanitizada.
      throw new Error("Falha ao autenticar service account do Firebase");
    }
    const expiresInSeconds = Number(body?.expires_in ?? 3600);
    serverTokenCache = {
      token: body.access_token,
      expiresAt: Date.now() + (expiresInSeconds - 60) * 1000,
    };
    return body.access_token as string;
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
    // Server functions autenticadas podem encaminhar o token Firebase que já
    // foi verificado pelo middleware; nesse caminho quem manda são as regras
    // do Firestore, e o acesso vale o do próprio usuário — não é privilegiado.
    // Rotinas sem usuário (webhooks/jobs) usam a service account abaixo, que
    // tem acesso administrativo.
    if (userToken) {
      return { headers: { authorization: `Bearer ${userToken}` }, key: "" };
    }
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
  /** Caminho relativo completo dentro de /documents. */
  path: string;
  data: Record<string, unknown>;
}

function parseDocument(doc: any): FirestoreDocument {
  const fullName = String(doc?.name ?? "");
  const path = fullName.split("/documents/")[1] ?? fullName;
  const id = path.split("/").pop() ?? "";
  return { id, path, data: decodeFields(doc?.fields ?? {}) };
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

/** Lê documentos conhecidos em lotes, evitando uma requisição por documento. */
export async function fsGetMany(
  paths: string[],
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<FirestoreDocument[]> {
  if (!paths.length) return [];
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const chunks: string[][] = [];
  for (let index = 0; index < paths.length; index += 100)
    chunks.push(paths.slice(index, index + 100));

  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await fetch(`${FIRESTORE_BASE_URL}/documents:batchGet${key}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({
          // batchGet exige nomes de recurso, não URLs HTTP completas.
          documents: chunk.map((path) => `${FIRESTORE_RESOURCE_ROOT}/documents/${path}`),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`Firestore BATCH GET falhou: ${body?.error?.message ?? res.status}`);
      }
      const responseText = await res.text();
      let responses: any[];
      try {
        const parsed = JSON.parse(responseText);
        responses = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // batchGet pode ser entregue como um fluxo JSON, com um objeto por linha.
        responses = responseText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      }
      return (Array.isArray(responses) ? responses : [])
        .filter((item: any) => item?.found)
        .map((item: any) => parseDocument(item.found));
    }),
  );
  return pages.flat();
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

/**
 * Cria o documento somente se ele ainda não existir, e responde se a criação
 * foi mesmo desta chamada. A pré-condição `currentDocument.exists=false` é
 * avaliada pelo servidor do Firestore, então dois reenvios simultâneos do mesmo
 * webhook não conseguem criar o documento duas vezes — é o que dá idempotência
 * real, coisa que um get-seguido-de-set não garante.
 *
 * @returns true se este chamador criou o documento; false se já existia.
 */
export async function fsCreateIfAbsent(
  path: string,
  data: Record<string, unknown>,
  docIdOrOptions?: string | { mode?: FirestoreAuthMode; userToken?: string },
  maybeOptions: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<boolean> {
  // Duas formas de chamada, ambas em uso:
  //   fsCreateIfAbsent("colecao/docId", data, { mode })        -> PATCH no doc
  //   fsCreateIfAbsent("colecao", data, docId, { mode })       -> POST na coleção
  const docId = typeof docIdOrOptions === "string" ? docIdOrOptions : undefined;
  const options = typeof docIdOrOptions === "string" ? maybeOptions : (docIdOrOptions ?? {});
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);

  // Com docId explícito o Firestore só aceita a criação via POST na coleção;
  // sem ele, o PATCH com `currentDocument.exists=false` faz a checagem no
  // servidor, o que dá idempotência real contra reenvios simultâneos.
  const params = docId
    ? [`documentId=${encodeURIComponent(docId)}`, key ? key.slice(1) : ""]
    : [key ? key.slice(1) : "", "currentDocument.exists=false"];
  const query = params.filter(Boolean).join("&");
  const url = `${FIRESTORE_BASE_URL}/documents/${path}${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    method: docId ? "POST" : "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)])),
    }),
  });
  if (res.ok) return true;
  const body = await res.json().catch(() => ({}));
  const status = String(body?.error?.status ?? "");
  if (res.status === 409 || status === "FAILED_PRECONDITION" || status === "ALREADY_EXISTS") {
    return false;
  }
  throw new Error(
    `Firestore CREATE-IF-ABSENT ${path} falhou: ${body?.error?.message ?? res.status}`,
  );
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
  /** Valor exclusivo do campo de ordenação usado para buscar a próxima página. */
  startAfter?: unknown;
  limit?: number;
  /** Executa uma collection-group query a partir da raiz do banco. */
  collectionGroup?: boolean;
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
  const parent = options.collectionGroup ? "" : hasParent ? segments.slice(0, -1).join("/") : "";
  const structuredQuery: Record<string, unknown> = {
    from: [
      {
        collectionId,
        ...(options.collectionGroup || hasParent
          ? { allDescendants: Boolean(options.collectionGroup) }
          : {}),
      },
    ],
  };
  if (options.where?.length) {
    structuredQuery.where = buildFilter(options.where);
  }
  if (options.orderBy) {
    structuredQuery.orderBy = [
      { field: { fieldPath: options.orderBy.field }, direction: options.orderBy.direction },
    ];
    if (options.startAfter !== undefined) {
      structuredQuery.startAt = { before: false, values: [encodeValue(options.startAfter)] };
    }
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
  provider?: string;
  provider_sale_code?: string | null;
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
  source?: "link" | "seller_code" | "checkout";
  landingPath?: string | null;
  createdAt: string;
  updatedAt?: string;
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
  const normalizedEmail = email.toLowerCase().trim();
  try {
    const res = await fsQuery("users", {
      ...options,
      where: [{ field: "email", op: "EQUAL", value: normalizedEmail }],
      limit: 1,
    });
    return res[0] ?? null;
  } catch (error) {
    // Contas Google podem ter sido criadas antes da indexação pelo perfil.
    // Tenta a leitura pública apenas quando a consulta autenticada falhar;
    // as regras do Firestore continuam sendo a autoridade final.
    if (options.mode !== "server") throw error;
    const fallback = await fsQuery("users", {
      where: [{ field: "email", op: "EQUAL", value: normalizedEmail }],
      limit: 1,
    });
    return fallback[0] ?? null;
  }
}

export async function setUserEmailIndex(
  uid: string,
  email: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  if (!email) return;
  await fsSet(`users/${uid}`, { email: email.toLowerCase().trim() }, options);
}

// pending_payments/{emailId} — pagamentos aprovados de e-mails que ainda não
// criaram conta no Pitch AI. Consumido (e removido) quando a licença é ativada.
function pendingPaymentDocId(email: string): string {
  // Firestore aceita "/" em nomes de documento apenas como separador de path,
  // então usamos um encode simples e reversível para o e-mail completo.
  return encodeURIComponent(email.toLowerCase().trim());
}

export interface PendingPaymentData {
  email: string;
  amount?: number | null;
  origin?: string | null;
  status?: string | null;
  approvedAt: string;
  consumed?: boolean;
  consumedBy?: string | null;
  consumedAt?: string | null;
  plan?: string | null;
  months?: number | null;
  saleCode?: string | null;
}

export async function setPendingPayment(
  email: string,
  data: Omit<PendingPaymentData, "email">,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(
    `pending_payments/${pendingPaymentDocId(email)}`,
    { ...data, email: email.toLowerCase().trim() },
    options,
  );
}

export async function getPendingPayment(
  email: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<FirestoreDocument | null> {
  return fsGet(`pending_payments/${pendingPaymentDocId(email)}`, options);
}

export async function deletePendingPayment(
  email: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsDelete(`pending_payments/${pendingPaymentDocId(email)}`, options);
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
  const url = `${FIRESTORE_BASE_URL}/documents:commit${key}`;
  const now = new Date().toISOString();

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      writes: [
        {
          update: { name: docName, fields: { updatedAt: encodeValue(now) } },
          updateMask: { fieldPaths: ["updatedAt"] },
          updateTransforms: [{ fieldPath: endpoint, increment: { integerValue: "1" } }],
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

  // A telemetria administrativa nunca pode impedir a cota principal.
  await incrementAdminUsageCountBestEffort(uid, now, options).catch(() => undefined);

  // Lê o valor pós-increment para retornar o contador atualizado.
  const updated = await getUserUsage(uid, day, options);
  return (updated ?? {})[endpoint] ?? 0;
}

async function incrementAdminUsageCountBestEffort(
  uid: string,
  now: string,
  options: { mode?: FirestoreAuthMode; userToken?: string },
): Promise<void> {
  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const statsName = `projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/ai_usage_stats/${uid}`;
  const res = await fetch(`${FIRESTORE_BASE_URL}/documents:commit${key}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: statsName,
            fields: {
              userId: encodeValue(uid),
              lastApiCallAt: encodeValue(now),
              updatedAt: encodeValue(now),
            },
          },
          updateMask: { fieldPaths: ["userId", "lastApiCallAt", "updatedAt"] },
          updateTransforms: [{ fieldPath: "apiCallCount", increment: { integerValue: "1" } }],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Firestore admin usage increment falhou: ${res.status}`);
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

export type AiTokenUsage = {
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
};

function tokenUsageFromDocument(data?: Record<string, unknown> | null): AiTokenUsage {
  const tokensInput = Math.max(0, Number(data?.tokensInput) || 0);
  const tokensOutput = Math.max(0, Number(data?.tokensOutput) || 0);
  return { tokensInput, tokensOutput, totalTokens: tokensInput + tokensOutput };
}

/** Lê a franquia de tokens do dia e do mês corrente. */
export async function getAiTokenUsage(
  uid: string,
  day: string,
  month: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<{ daily: AiTokenUsage; monthly: AiTokenUsage }> {
  const [dailyDoc, monthlyDoc] = await Promise.all([
    fsGet(`users/${uid}/usage/${day}`, options),
    fsGet(`users/${uid}/token_usage/${month}`, options),
  ]);
  return {
    daily: tokenUsageFromDocument(dailyDoc?.data),
    monthly: tokenUsageFromDocument(monthlyDoc?.data),
  };
}

/**
 * Registra entrada e saída em uma única operação atômica nos contadores diário,
 * mensal e administrativo. Assim chamadas simultâneas não perdem consumo.
 */
export async function incrementAiTokenUsage(
  uid: string,
  day: string,
  month: string,
  tokensInput: number,
  tokensOutput: number,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<{ daily: AiTokenUsage; monthly: AiTokenUsage }> {
  const input = Math.max(0, Math.round(tokensInput));
  const output = Math.max(0, Math.round(tokensOutput));
  if (input + output === 0) return getAiTokenUsage(uid, day, month, options);

  const { headers, key } = await authorization(options.mode ?? "public", options.userToken);
  const documentName = (path: string) =>
    `projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}/documents/${path}`;
  const now = new Date().toISOString();
  const total = input + output;
  const paths = [
    `users/${uid}/usage/${day}`,
    `users/${uid}/token_usage/${month}`,
    `ai_usage_stats/${uid}`,
  ];

  const res = await fetch(`${FIRESTORE_BASE_URL}/documents:commit${key}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      writes: paths.map((path, index) => ({
        update: {
          name: documentName(path),
          fields: {
            userId: encodeValue(uid),
            updatedAt: encodeValue(now),
            ...(index === 1 ? { period: encodeValue(month) } : {}),
          },
        },
        updateMask: {
          fieldPaths: ["userId", "updatedAt", ...(index === 1 ? ["period"] : [])],
        },
        updateTransforms: [
          { fieldPath: "tokensInput", increment: { integerValue: String(input) } },
          { fieldPath: "tokensOutput", increment: { integerValue: String(output) } },
          { fieldPath: "totalTokens", increment: { integerValue: String(total) } },
        ],
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Firestore token usage increment falhou: ${body?.error?.message ?? res.status}`,
    );
  }
  return getAiTokenUsage(uid, day, month, options);
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
//
// Allowlist por e-mail: administradores definidos aqui têm acesso garantido
// independentemente de existir um documento em `admins/{uid}` no Firestore.
// Útil quando não há credenciais de servidor para gravar a coleção `admins`.
export const ADMIN_EMAILS = new Set<string>(["hferro150@gmail.com", "cortezin66@gmail.com"]);

export function getNormalizedAdminEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export function isAdminEmail(email?: string | null): boolean {
  const normalizedEmail = getNormalizedAdminEmail(email);
  return normalizedEmail !== null && ADMIN_EMAILS.has(normalizedEmail);
}

export async function isAdmin(
  uid: string,
  email?: string | null,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const doc = await fsGet(`admins/${uid}`, options);
  return doc?.data?.role === "admin";
}

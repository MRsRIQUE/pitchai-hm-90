import {
  FIREBASE_API_KEY,
  FIREBASE_DATABASE_ID,
  FIREBASE_PROJECT_ID,
  type FirestoreAuthMode,
} from "../firebase.server";

/**
 * Operações Firestore em lote para o fluxo de admin.
 * A service account fica em `firebase.server.ts`; aqui o modo server exige
 * `userToken` (o mesmo Bearer que as chamadas avulsas já usam hoje).
 */

const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}`;
const FIRESTORE_RESOURCE_ROOT = `projects/${FIREBASE_PROJECT_ID}/databases/${FIREBASE_DATABASE_ID}`;

const BATCH_SIZE = 400;

/** Apaga documentos em lote (documents:commit), até 400 por commit. */
export async function fsDeleteMany(
  paths: string[],
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  if (!paths.length) return;
  if (options.mode === "server" && !options.userToken) {
    throw new Error(
      "fsDeleteMany em modo server exige userToken (service account não disponível aqui)",
    );
  }
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.userToken) headers.authorization = `Bearer ${options.userToken}`;
  const key =
    options.mode !== "server" && !options.userToken
      ? `?key=${encodeURIComponent(FIREBASE_API_KEY)}`
      : "";

  for (let index = 0; index < paths.length; index += BATCH_SIZE) {
    const chunk = paths.slice(index, index + BATCH_SIZE);
    const res = await fetch(`${FIRESTORE_BASE_URL}/documents:commit${key}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        writes: chunk.map((path) => ({
          delete: { name: `${FIRESTORE_RESOURCE_ROOT}/documents/${path}` },
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Firestore DELETE em lote falhou: ${body?.error?.message ?? res.status}`);
    }
  }
}

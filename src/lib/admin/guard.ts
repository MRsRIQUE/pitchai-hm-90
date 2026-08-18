import { isAdmin, verifyFirebaseIdToken } from "../firebase.server";
import { AdminError } from "./errors";

export type AdminContext = { uid: string; email: string | null; token: string };

/**
 * Guard único de admin para rotas HTTP (TanStack Start `server.handlers`).
 * Extrai o Bearer token, verifica o ID token Firebase e a permissão de admin.
 * Falha de leitura do Firestore vira "não é admin" (403), nunca exception.
 *
 * Lança `AdminError` tipado: 401 (sessão) ou 403 (permissão).
 */
export async function requireAdminRequest(request: Request): Promise<AdminContext> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new AdminError(401, "Não autenticado");
  const user = await verifyFirebaseIdToken(token).catch(() => null);
  if (!user) throw new AdminError(401, "Sessão inválida");
  let admin = false;
  try {
    admin = await isAdmin(user.uid, user.email, { mode: "server", userToken: token });
  } catch {
    admin = false;
  }
  if (!admin) throw new AdminError(403, "Acesso negado");
  return { uid: user.uid, email: user.email, token };
}

/**
 * Converte qualquer erro em `Response` com o shape de erro das rotas de admin.
 * - `AdminError` → JSON com a mensagem no corpo e o status do erro (o texto
 *   real fica no corpo, não em `statusText`, para o cliente exibir a
 *   diferença entre 401 e 403).
 * - Qualquer outro erro → 500 com a mensagem.
 *
 * `includeOk` mantém o shape `{ ok: false, error }` usado por `/api/admin/check`.
 */
export async function adminApiError(
  error: unknown,
  options: { includeOk?: boolean; logLabel?: string } = {},
): Promise<Response> {
  const includeOk = Boolean(options.includeOk);
  if (error instanceof AdminError) {
    return Response.json(
      includeOk ? { ok: false, error: error.message } : { error: error.message },
      { status: error.status },
    );
  }
  const detail = error instanceof Error ? error.message : "Erro desconhecido";
  if (options.logLabel) console.error(`[${options.logLabel}]`, detail);
  return Response.json(includeOk ? { ok: false, error: detail } : { error: detail }, {
    status: 500,
  });
}

import { createFileRoute } from "@tanstack/react-router";
import { fsGet, isAdmin, verifyFirebaseIdToken } from "@/lib/firebase.server";

type AdminContext = { uid: string; email: string | null; token: string };

async function requireAdmin(request: Request): Promise<AdminContext> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Response("Não autenticado", { status: 401 });
  const user = await verifyFirebaseIdToken(token).catch(() => null);
  if (!user) throw new Response("Sessão inválida", { status: 401 });
  if (!(await isAdmin(user.uid, user.email, { mode: "server", userToken: token })))
    throw new Response("Acesso negado", { status: 403 });
  return { uid: user.uid, email: user.email, token };
}

function apiError(error: unknown) {
  if (error instanceof Response) {
    return Response.json(
      { ok: false, error: error.statusText || "Falha na solicitação" },
      { status: error.status },
    );
  }
  const detail = error instanceof Error ? error.message : "Erro desconhecido";
  console.error("[admin/check]", detail);
  return Response.json({ ok: false, error: detail }, { status: 500 });
}

export const Route = createFileRoute("/api/admin/check")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request);
          return Response.json({ ok: true });
        } catch (error) {
          return apiError(error);
        }
      },
    },
  },
});

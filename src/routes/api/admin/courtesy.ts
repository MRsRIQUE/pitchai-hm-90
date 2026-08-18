import { createFileRoute } from "@tanstack/react-router";
import {
  fsQuery,
  fsSet,
  getUserByEmail,
  isAdmin,
  verifyFirebaseIdToken,
} from "@/lib/firebase.server";
import {
  COURTESY_DEFAULT_PLAN,
  COURTESY_MAX_DAYS,
  COURTESY_MIN_DAYS,
  COURTESY_NOTE_MAX,
  COURTESY_NOTE_MIN,
  COURTESY_PLAN_IDS,
  isCourtesyPlanId,
} from "@/lib/live/plans";

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

async function apiError(error: unknown) {
  if (error instanceof Response) {
    // Mesmo motivo de `api/admin/check`: o texto real está no corpo, não em
    // `statusText` — que fica vazio quando a Response é criada só com `status`.
    const detail =
      (await error.text().catch(() => "")) || error.statusText || "Falha na solicitação";
    return Response.json({ error: detail }, { status: error.status });
  }
  const detail = error instanceof Error ? error.message : "Erro desconhecido";
  console.error("[admin/courtesy]", detail);
  return Response.json({ error: detail }, { status: 500 });
}

export const Route = createFileRoute("/api/admin/courtesy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const docs = await fsQuery("comped_access", {
            limit: 200,
            mode: "server",
            userToken: admin.token,
          });
          const items = docs
            .map((doc) => ({
              userId: doc.id,
              email: String(doc.data.email || "(conta removida)"),
              plan: String(doc.data.plan || COURTESY_DEFAULT_PLAN),
              status: String(doc.data.status || "comped"),
              grantedUntil: (doc.data.grantedUntil as string | null) || null,
              note: (doc.data.note as string | null) || null,
            }))
            .filter((item) => item.status === "comped")
            .sort((a, b) => String(b.grantedUntil).localeCompare(String(a.grantedUntil)));
          return Response.json({ items });
        } catch (error) {
          return apiError(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const body = await request.json().catch(() => ({}));
          const email = String(body.email || "")
            .trim()
            .toLowerCase();
          const days = Number(body.days);
          const plan = String(body.plan || COURTESY_DEFAULT_PLAN);
          const note = String(body.note || "")
            .trim()
            .slice(0, COURTESY_NOTE_MAX);
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return Response.json({ error: "Digite um e-mail válido." }, { status: 400 });
          }
          if (!Number.isInteger(days) || days < COURTESY_MIN_DAYS || days > COURTESY_MAX_DAYS) {
            return Response.json(
              { error: `O período deve ser de ${COURTESY_MIN_DAYS} a ${COURTESY_MAX_DAYS} dias.` },
              { status: 400 },
            );
          }
          if (!isCourtesyPlanId(plan)) {
            return Response.json(
              { error: `Plano inválido. Use ${COURTESY_PLAN_IDS.join(" ou ")}.` },
              { status: 400 },
            );
          }
          if (note.length < COURTESY_NOTE_MIN) {
            return Response.json(
              { error: "Descreva o motivo da cortesia (mínimo 3 caracteres)." },
              { status: 400 },
            );
          }

          const firestore = { mode: "server" as const, userToken: admin.token };
          const user = await getUserByEmail(email, firestore);
          if (!user) {
            return Response.json(
              {
                error:
                  "Conta não encontrada. A pessoa precisa criar e acessar a conta antes da cortesia.",
              },
              { status: 404 },
            );
          }

          const now = new Date();
          const grantedUntil = new Date(now.getTime() + days * 86_400_000).toISOString();
          await fsSet(
            `comped_access/${user.id}`,
            {
              email,
              plan,
              status: "comped",
              grantedUntil,
              note: note || null,
              grantedBy: admin.uid,
              grantedAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
            firestore,
          );
          return Response.json({ ok: true, userId: user.id, plan, grantedUntil });
        } catch (error) {
          return apiError(error);
        }
      },

      DELETE: async ({ request }) => {
        try {
          const admin = await requireAdmin(request);
          const body = await request.json().catch(() => ({}));
          const userId = String(body.userId || "").trim();
          if (!/^[A-Za-z0-9_-]{6,128}$/.test(userId)) {
            return Response.json({ error: "Conta inválida." }, { status: 400 });
          }
          await fsSet(
            `comped_access/${userId}`,
            {
              status: "revoked",
              grantedUntil: new Date(0).toISOString(),
              revokedBy: admin.uid,
              revokedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            { mode: "server", userToken: admin.token },
          );
          return Response.json({ ok: true });
        } catch (error) {
          return apiError(error);
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { fsSet, verifyFirebaseIdToken } from "@/lib/firebase.server";
import { throttle } from "@/lib/live/rate-limit.server";

export const Route = createFileRoute("/api/account/ensure")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return Response.json({ error: "Não autenticado." }, { status: 401 });
        const user = await verifyFirebaseIdToken(token).catch(() => null);
        if (!user?.email) {
          return Response.json({ error: "A conta precisa ter um e-mail válido." }, { status: 400 });
        }
        const gate = throttle(`account_ensure:${user.uid}`, { limit: 30, windowMs: 60_000 });
        if (!gate.ok) {
          return Response.json(
            { error: "Muitas tentativas. Aguarde um instante." },
            { status: 429, headers: { "Retry-After": String(gate.retryAfter) } },
          );
        }
        try {
          await fsSet(
            `users/${user.uid}`,
            {
              email: user.email.trim().toLowerCase(),
              displayName: user.displayName || null,
              updated_at: new Date().toISOString(),
            },
            { mode: "server", userToken: token },
          );
          return Response.json({ ok: true, userId: user.uid });
        } catch (error) {
          console.error("[account/ensure]", error);
          return Response.json(
            { error: "Não foi possível concluir o cadastro da conta. Tente novamente." },
            { status: 500 },
          );
        }
      },
    },
  },
});

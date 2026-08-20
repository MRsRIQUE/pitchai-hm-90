import { createFileRoute } from "@tanstack/react-router";
import { verifyFirebaseIdToken } from "@/lib/firebase.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { createStripeClient } from "@/lib/stripe.server";

// Verificação pós-checkout: a página de retorno só confia no status real da
// Checkout Session no Stripe, nunca na presença do session_id na URL.
const USER_LIMIT = { limit: 30, windowMs: 10 * 60_000 };

const SESSION_ID = /^[a-zA-Z0-9_]{10,255}$/;

export const Route = createFileRoute("/api/checkout/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("session_id") || "";
        if (!SESSION_ID.test(sessionId)) {
          return Response.json({ error: "Sessão inválida." }, { status: 400 });
        }

        const token = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return Response.json({ error: "Sessão expirada." }, { status: 401 });
        const user = await verifyFirebaseIdToken(token).catch(() => null);
        if (!user) return Response.json({ error: "Sessão inválida." }, { status: 401 });

        const gate = throttle(`checkout_status:${user.uid}`, USER_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Muitas consultas. Aguarde um instante." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        try {
          const stripeEnv = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
            ? ("live" as const)
            : ("sandbox" as const);
          const stripe = createStripeClient(stripeEnv);
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          // Só devolve o status ao dono da sessão: o session_id não é segredo
          // (viaja na URL), então sem este bloqueio qualquer usuário logado
          // poderia sondar sessões alheias.
          if (session.client_reference_id && session.client_reference_id !== user.uid) {
            return Response.json({ error: "Sessão de outro usuário." }, { status: 403 });
          }
          return Response.json({
            status: session.status,
            paymentStatus: session.payment_status,
            isOwner: session.client_reference_id === user.uid,
          });
        } catch (error) {
          console.error("[checkout/status]", error);
          return Response.json(
            { error: "Não foi possível verificar o pagamento." },
            { status: 500 },
          );
        }
      },
    },
  },
});

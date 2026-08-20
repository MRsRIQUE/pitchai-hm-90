import { createFileRoute } from "@tanstack/react-router";
import { getSubscription, verifyFirebaseIdToken } from "@/lib/firebase.server";
import { throttle } from "@/lib/live/rate-limit.server";
import { createStripeClient } from "@/lib/stripe.server";

// Portal de faturamento do Stripe: trocar cartão, baixar faturas e cancelar a
// assinatura sem sair do fluxo do Pitch AI. O limite por conta evita loop de
// um cliente com a tela travada criando sessões do portal sem parar.
const USER_LIMIT = { limit: 10, windowMs: 10 * 60_000 };

export const Route = createFileRoute("/api/billing/portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token) return Response.json({ error: "Sessão inválida." }, { status: 401 });
        const user = await verifyFirebaseIdToken(token).catch(() => null);
        if (!user) return Response.json({ error: "Sessão inválida." }, { status: 401 });

        const gate = throttle(`billing_portal:${user.uid}`, USER_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Muitas tentativas. Aguarde alguns minutos." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        try {
          const sub = await getSubscription(user.uid, { mode: "server" });
          if (!sub?.stripe_customer_id) {
            return Response.json(
              { error: "Nenhuma assinatura ativa encontrada para esta conta." },
              { status: 404 },
            );
          }

          const stripeEnv = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
            ? ("live" as const)
            : ("sandbox" as const);
          const stripe = createStripeClient(stripeEnv);

          const body = await request.json().catch(() => ({}));
          const origin = new URL(request.url).origin;
          const returnUrl =
            typeof body?.returnUrl === "string" && body.returnUrl.startsWith(origin)
              ? body.returnUrl
              : `${origin}/app?section=conta`;

          const session = await stripe.billingPortal.sessions.create({
            customer: sub.stripe_customer_id,
            return_url: returnUrl,
          });
          return Response.json({ url: session.url });
        } catch (error) {
          console.error("[billing/portal] falhou:", error);
          return Response.json(
            { error: "Não foi possível abrir o portal de assinatura." },
            { status: 500 },
          );
        }
      },
    },
  },
});

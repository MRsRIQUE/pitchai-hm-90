import { createFileRoute } from "@tanstack/react-router";
import { fsCreate, fsSet, verifyFirebaseIdToken } from "@/lib/firebase.server";
import { findPitchaiPlan } from "@/lib/live/plans";
import { throttle } from "@/lib/live/rate-limit.server";
import { createStripeClient, getStripeErrorMessage, type StripeEnv } from "@/lib/stripe.server";

// Cada POST aceito cria um documento no Firestore e um customer/sessão no
// Stripe, então o endpoint precisa de teto próprio. O limite por IP corta o
// abuso antes mesmo de gastar uma verificação de token; o limite por conta
// corta o loop de um usuário legítimo com a tela travada.
const IP_LIMIT = { limit: 30, windowMs: 10 * 60_000 };
const USER_LIMIT = { limit: 6, windowMs: 10 * 60_000 };

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "desconhecido";
}

function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "Muitas tentativas de pagamento. Aguarde alguns minutos e tente novamente." },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

export const Route = createFileRoute("/api/checkout/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const byIp = throttle(`checkout:ip:${clientIp(request)}`, IP_LIMIT);
        if (!byIp.ok) return tooManyRequests(byIp.retryAfter);

        const token = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token)
          return Response.json({ error: "Crie sua conta antes de pagar." }, { status: 401 });
        const user = await verifyFirebaseIdToken(token).catch(() => null);
        if (!user?.email) return Response.json({ error: "Sessão inválida." }, { status: 401 });

        const byUser = throttle(`checkout:uid:${user.uid}`, USER_LIMIT);
        if (!byUser.ok) return tooManyRequests(byUser.retryAfter);

        const body = await request.json().catch(() => ({}));
        const plan = findPitchaiPlan(String(body.plan || ""));
        if (!plan) return Response.json({ error: "Plano inválido." }, { status: 400 });

        const email = user.email.trim().toLowerCase();
        const now = new Date().toISOString();
        try {
          // Garante que o webhook encontre a conta antes que o checkout seja aberto.
          await fsSet(
            `users/${user.uid}`,
            { email, displayName: user.displayName || null, updated_at: now },
            { mode: "server" },
          );
          await fsCreate(
            "checkout_intents",
            {
              userId: user.uid,
              email,
              plan: plan.priceId,
              amountCents: plan.amountCents,
              months: plan.months,
              status: "created",
              createdAt: now,
            },
            undefined,
            { mode: "server" },
          );

          const stripeEnv: StripeEnv = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_")
            ? "live"
            : "sandbox";
          const stripe = createStripeClient(stripeEnv);
          const prices = await stripe.prices.list({
            lookup_keys: [plan.priceId],
            active: true,
            limit: 1,
          });
          const price = prices.data[0];
          if (!price) {
            return Response.json(
              { error: `Preço Stripe não configurado para o plano ${plan.name}.` },
              { status: 503 },
            );
          }

          const existingCustomers = await stripe.customers.list({ email, limit: 1 });
          const customer = existingCustomers.data[0]
            ? await stripe.customers.update(existingCustomers.data[0].id, {
                name: user.displayName || undefined,
                metadata: { ...existingCustomers.data[0].metadata, userId: user.uid },
              })
            : await stripe.customers.create({
                email,
                name: user.displayName || undefined,
                metadata: { userId: user.uid },
              });

          const origin = new URL(request.url).origin;
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: customer.id,
            line_items: [{ price: price.id, quantity: 1 }],
            success_url: `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/planos?checkout=cancelado`,
            allow_promotion_codes: true,
            billing_address_collection: "auto",
            client_reference_id: user.uid,
            metadata: { userId: user.uid, plan: plan.priceId },
            subscription_data: { metadata: { userId: user.uid, plan: plan.priceId } },
          });
          if (!session.url) throw new Error("Stripe não retornou a URL do checkout.");
          return Response.json({ checkoutUrl: session.url });
        } catch (error) {
          // O detalhe fica só no log: as mensagens de erro do Firestore e do
          // Stripe carregam caminho de documento, uid e id de preço, e chegavam
          // inteiras à tela do comprador.
          const debugMsg = getStripeErrorMessage(error);
          console.error("[checkout/start]", debugMsg);
          return Response.json(
            { error: "Não foi possível iniciar o pagamento. Tente novamente em instantes.", debug: debugMsg },
            { status: 500 },
          );
        }
      },
    },
  },
});

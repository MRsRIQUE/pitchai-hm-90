import { createFileRoute } from "@tanstack/react-router";
import { fsCreate, fsSet, verifyFirebaseIdToken } from "@/lib/firebase.server";
import { PITCHAI_PLANS } from "@/lib/live/plans";

export const Route = createFileRoute("/api/checkout/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = (request.headers.get("authorization") || "")
          .replace(/^Bearer\s+/i, "")
          .trim();
        if (!token)
          return Response.json({ error: "Crie sua conta antes de pagar." }, { status: 401 });
        const user = await verifyFirebaseIdToken(token).catch(() => null);
        if (!user?.email) return Response.json({ error: "Sessão inválida." }, { status: 401 });

        const body = await request.json().catch(() => ({}));
        const plan = PITCHAI_PLANS.find((item) => item.priceId === String(body.plan || ""));
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

          const checkout = new URL(plan.checkoutUrl);
          checkout.searchParams.set("email", email);
          if (user.displayName) checkout.searchParams.set("name", user.displayName);
          return Response.json({ checkoutUrl: checkout.toString() });
        } catch (error) {
          console.error("[checkout/start]", error);
          return Response.json({ error: "Não foi possível iniciar o pagamento." }, { status: 500 });
        }
      },
    },
  },
});

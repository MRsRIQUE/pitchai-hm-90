import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, handleStripeWebhook } from "@/routes/api/public/payments/webhook";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestedEnv = new URL(request.url).searchParams.get("env");
        const env: StripeEnv = requestedEnv === "sandbox" ? "sandbox" : "live";
        try {
          await handleStripeWebhook(request, env);
          return Response.json({ received: true });
        } catch (error) {
          console.error("[stripe/webhook]", error);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { handlePaymentWebhook } from "@/lib/live/payment-webhook";

export const Route = createFileRoute("/api/payments")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePaymentWebhook(request),
      OPTIONS: async ({ request }) => handlePaymentWebhook(request),
    },
  },
});

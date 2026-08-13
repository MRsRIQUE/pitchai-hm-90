import { createFileRoute } from "@tanstack/react-router";
import { handlePaymentWebhook } from "@/lib/live/payment-webhook";

export const Route = createFileRoute("/api/public/payments/perfectpay")({
  server: {
    handlers: {
      POST: async ({ request }) => handlePaymentWebhook(request),
      OPTIONS: async ({ request }) => handlePaymentWebhook(request),
    },
  },
});

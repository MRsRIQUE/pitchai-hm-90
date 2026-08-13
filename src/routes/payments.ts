import { createFileRoute } from "@tanstack/react-router";
import { handlePaymentWebhook } from "@/lib/live/payment-webhook";

export const Route = createFileRoute("/payments")({
  server: {
    handlers: {
      GET: async ({ request }) => handlePaymentWebhook(request),
      POST: async ({ request }) => handlePaymentWebhook(request),
      OPTIONS: async ({ request }) => handlePaymentWebhook(request),
    },
  },
});

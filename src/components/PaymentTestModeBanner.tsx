const clientToken = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN) as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-center text-sm text-red-300">
        Pagamentos Stripe ainda não configurados neste ambiente.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-center text-sm text-red-300">
        Pagamentos bloqueados: o modo de teste da Stripe não é permitido.
      </div>
    );
  }
  return null;
}

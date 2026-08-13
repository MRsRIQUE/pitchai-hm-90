const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-center text-sm text-red-300">
        Pagamentos em produção não configurados. Finalize o go-live no Lovable.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full bg-orange-500/10 border-b border-orange-500/30 px-4 py-2 text-center text-xs text-orange-300">
        Modo teste — pagamentos no preview são simulados. Cartão: <code>4242 4242 4242 4242</code>
      </div>
    );
  }
  return null;
}

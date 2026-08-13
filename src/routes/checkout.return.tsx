import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <CheckCircle2 className="w-16 h-16 text-[#00E676] mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2">Pagamento confirmado!</h1>
        <p className="text-white/70 mb-6">
          {session_id
            ? "Sua assinatura foi ativada. Em alguns segundos os novos limites já estarão valendo."
            : "Estamos processando seu pagamento."}
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            to="/app"
            className="px-5 py-3 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] font-semibold"
          >
            Ir para o painel
          </Link>
          <Link to="/planos" className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/20">
            Ver planos
          </Link>
        </div>
      </div>
    </div>
  );
}

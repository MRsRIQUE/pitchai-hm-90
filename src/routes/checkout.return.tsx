import { createFileRoute, Link } from "@tanstack/react-router";
import { onAuthStateChanged } from "firebase/auth";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

type VerifyState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "pending" }
  | { kind: "error"; message?: string };

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  const [state, setState] = useState<VerifyState>({ kind: "loading" });

  useEffect(() => {
    if (!session_id) {
      setState({ kind: "pending" });
      return;
    }
    const auth = getFirebaseAuth();
    let settled = false;
    const fallback = window.setTimeout(() => {
      if (!settled) setState({ kind: "pending" });
    }, 5_000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return; // o fallback cobre: sem sessão não dá para verificar
      settled = true;
      window.clearTimeout(fallback);
      // O webhook pode chegar alguns segundos depois da sessão completar:
      // consulta com um pouco de paciência antes de declarar erro.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const token = await user.getIdToken();
          const res = await fetch(
            `/api/checkout/status?session_id=${encodeURIComponent(session_id)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const payload = await res.json().catch(() => null);
          if (res.ok && payload?.status === "complete" && payload?.paymentStatus === "paid") {
            setState({ kind: "success" });
            return;
          }
          if (res.ok && (payload?.status === "open" || payload?.status === "expired")) {
            setState({ kind: "error", message: "O pagamento não foi concluído." });
            return;
          }
        } catch {
          // tenta de novo
        }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2500));
      }
      setState({ kind: "pending" });
    });
    return () => {
      settled = true;
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, [session_id]);

  return (
    <div className="marketing-page min-h-screen flex items-center justify-center px-4">
      <div className="marketing-panel max-w-md rounded-3xl p-8 text-center">
        {state.kind === "loading" && (
          <>
            <Loader2 className="w-16 h-16 text-[#7C3AED] mx-auto mb-4 animate-spin" />
            <h1 className="marketing-title text-3xl mb-2">Confirmando pagamento…</h1>
            <p className="text-white/70">Estamos verificando sua sessão no Stripe.</p>
          </>
        )}
        {state.kind === "success" && (
          <>
            <CheckCircle2 className="w-16 h-16 text-[#00E676] mx-auto mb-4" />
            <h1 className="marketing-title text-4xl mb-2">Checkout concluído!</h1>
            <p className="text-white/70 mb-6">
              Pagamento confirmado. Em alguns segundos o webhook ativa sua assinatura e os novos
              limites.
            </p>
          </>
        )}
        {state.kind === "pending" && (
          <>
            <Loader2 className="w-16 h-16 text-[#7C3AED] mx-auto mb-4 animate-spin" />
            <h1 className="marketing-title text-3xl mb-2">Processando…</h1>
            <p className="text-white/70 mb-6">
              Estamos processando seu pagamento. Assim que o Stripe confirmar, sua assinatura é
              ativada automaticamente — você pode fechar esta página.
            </p>
          </>
        )}
        {state.kind === "error" && (
          <>
            <AlertTriangle className="w-16 h-16 text-[#F59E0B] mx-auto mb-4" />
            <h1 className="marketing-title text-3xl mb-2">Pagamento não concluído</h1>
            <p className="text-white/70 mb-6">
              {state.message ?? "Não conseguimos confirmar o pagamento."} Nenhuma cobrança foi feita
              — você pode tentar novamente.
            </p>
          </>
        )}
        <div className="flex gap-3 justify-center">
          <Link
            to="/app"
            className="px-5 py-3 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] font-semibold"
          >
            Ir para o painel
          </Link>
          {state.kind === "error" ? (
            <Link
              to="/planos"
              className="px-5 py-3 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] font-semibold"
            >
              Tentar novamente
            </Link>
          ) : (
            <Link to="/planos" className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/20">
              Ver planos
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

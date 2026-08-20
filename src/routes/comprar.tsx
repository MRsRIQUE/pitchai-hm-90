import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";
import { findPitchaiPlan } from "@/lib/live/plans";

type Search = { plan?: string };

export const Route = createFileRoute("/comprar")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    plan: typeof search.plan === "string" ? search.plan : undefined,
  }),
  component: ComprarPage,
});

function ComprarPage() {
  const { plan: planId } = useSearch({ from: "/comprar" });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const plan = findPitchaiPlan(planId || "");

  useEffect(() => {
    if (!plan) return;
    const auth = getFirebaseAuth();
    let settled = false;
    const redirectToSignup = () => {
      if (settled) return;
      settled = true;
      const next = `/comprar?plan=${encodeURIComponent(plan.priceId)}`;
      navigate({ to: "/entrar", search: { mode: "signup", next }, replace: true });
    };
    const fallback = window.setTimeout(() => {
      if (!auth.currentUser) redirectToSignup();
    }, 3_000);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        redirectToSignup();
        return;
      }
      settled = true;
      window.clearTimeout(fallback);
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/checkout/start", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plan: plan.priceId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.checkoutUrl) {
          throw new Error(payload?.error || "Não foi possível abrir o checkout.");
        }
        window.location.assign(payload.checkoutUrl);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível abrir o checkout.");
      }
    });
    return () => {
      settled = true;
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, [navigate, plan]);

  if (!plan) {
    return (
      <main className="marketing-page grid min-h-dvh place-items-center px-4">
        <div className="marketing-panel max-w-md rounded-2xl p-8 text-center">
          <h1 className="marketing-title text-2xl">Plano não encontrado</h1>
          <Link to="/planos" className="mt-4 inline-block text-purple-400 underline">
            Ver planos
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="marketing-page grid min-h-dvh place-items-center px-4">
      <div className="marketing-panel max-w-md rounded-2xl p-8 text-center">
        {error ? (
          <>
            <h1 className="marketing-title text-2xl">Não foi possível continuar</h1>
            <p className="mt-3 text-sm text-red-400">{error}</p>
            <Link to="/planos" className="mt-5 inline-block text-purple-400 underline">
              Voltar aos planos
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-purple-500" />
            <h1 className="marketing-title mt-4 text-2xl">Preparando seu checkout</h1>
            <p className="mt-2 text-sm opacity-70">Confirmando sua conta e o plano {plan.name}…</p>
          </>
        )}
      </div>
    </main>
  );
}

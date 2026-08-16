import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";
import { getMyReferralSummary } from "@/lib/referrals.functions";
import { SiteNav } from "@/components/live/SiteNav";
import { copyToClipboard } from "@/lib/clipboard";

export const Route = createFileRoute("/indique")({
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "Indique e ganhe 60% · Pitch AI" },
      {
        name: "description",
        content:
          "Compartilhe seu link do Pitch AI e receba 60% de comissão de cada assinatura indicada.",
      },
      { property: "og:title", content: "Indique e ganhe 60% · Pitch AI" },
      {
        property: "og:description",
        content: "Ganhe 60% por cada assinante que você indicar ao Pitch AI.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IndiquePage,
});

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function IndiquePage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    const fbAuth = getFirebaseAuth();
    setAuthed(!!fbAuth.currentUser);
    const unsub = onAuthStateChanged(fbAuth, (user) => setAuthed(!!user));
    return () => unsub();
  }, []);

  const fetchSummary = useServerFn(getMyReferralSummary);
  const { data, isLoading, error } = useQuery({
    queryKey: ["referrals", "summary"],
    queryFn: () => fetchSummary({}),
    enabled: authed === true,
  });

  if (authed === false) {
    return (
      <Shell>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-white/70">Entre na sua conta para pegar seu link de indicação.</p>
          <Link
            to="/entrar"
            search={{ next: "/indique" }}
            className="mt-4 inline-block rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold"
          >
            Entrar na minha conta
          </Link>
        </div>
      </Shell>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = data ? `${origin}/?ref=${data.code}` : "";

  return (
    <Shell>
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#7C3AED]/25 to-[#FF6B35]/10 p-6">
        <h1 className="text-2xl font-bold">Indique e ganhe 60%</h1>
        <p className="mt-2 max-w-xl text-sm text-white/70">
          Compartilhe seu link. Quando alguém assinar o Pitch AI por ele, você recebe{" "}
          <b className="text-[#00E676]">60% do valor pago</b> — a cada ciclo, enquanto a assinatura
          estiver ativa.
        </p>

        {isLoading && <p className="mt-6 text-sm text-white/50">Carregando…</p>}
        {error && (
          <p className="mt-6 text-sm text-red-400">
            Não foi possível carregar seu link. Recarregue a página.
          </p>
        )}

        {data && (
          <div className="mt-6 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none"
              />
              <button
                onClick={async () => {
                  const copied = await copyToClipboard(link);
                  if (copied) toast.success("Link copiado!");
                  else toast.error("Não consegui copiar — selecione o link e copie manualmente");
                }}
                className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold hover:bg-[#6D28D9]"
              >
                Copiar link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Automatize sua live do TikTok Shop com IA: ${link}`)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-center text-sm hover:bg-white/10"
              >
                WhatsApp
              </a>
            </div>
            <p className="text-xs text-white/40">
              Seu código: <span className="font-mono text-white/70">{data.code}</span>
            </p>
          </div>
        )}
      </section>

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Indicados" value={String(data.totalIndicados)} />
            <Stat label="Viraram assinantes" value={String(data.totalAssinantes)} />
            <Stat label="A receber" value={brl(data.totalPendenteCents)} />
            <Stat label="Já pago" value={brl(data.totalPagoCents)} />
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="font-semibold">Minhas comissões</h2>
            {data.commissions.length === 0 ? (
              <p className="py-6 text-center text-sm text-white/50">
                Nenhuma comissão ainda. Compartilhe seu link para começar.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/50">
                      <th className="py-2 pr-2">Data</th>
                      <th className="py-2 pr-2">Plano</th>
                      <th className="py-2 pr-2 text-right">Base</th>
                      <th className="py-2 pr-2 text-right">Comissão</th>
                      <th className="py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.commissions.map((c) => (
                      <tr key={c.id} className="border-b border-white/5">
                        <td className="py-2 pr-2 text-white/60">
                          {new Date(c.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-2 pr-2 uppercase">{c.plan ?? "—"}</td>
                        <td className="py-2 pr-2 text-right font-mono text-white/60">
                          {brl(c.base_cents)}
                        </td>
                        <td className="py-2 pr-2 text-right font-mono text-[#00E676]">
                          {brl(c.amount_cents)}
                        </td>
                        <td className="py-2 text-right">
                          <span
                            className={
                              c.status === "pago"
                                ? "rounded bg-[#00E676]/15 px-2 py-0.5 text-xs text-[#00E676]"
                                : "rounded bg-[#FF6B35]/15 px-2 py-0.5 text-xs text-[#FF6B35]"
                            }
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs text-white/40">
              Os pagamentos são feitos manualmente via PIX pela equipe Pitch AI após a confirmação
              do pagamento do indicado.
            </p>
          </section>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-page min-h-dvh">
      <SiteNav />
      <main className="desktop-rail-narrow space-y-6 py-8">{children}</main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="marketing-panel rounded-xl px-4 py-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className="font-mono text-xl font-bold">{value}</div>
    </div>
  );
}

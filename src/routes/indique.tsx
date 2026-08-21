import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";
import { activateReferralProgram, getMyReferralSummary } from "@/lib/referrals.functions";
import { SitePageFrame } from "@/components/live/SitePageFrame";
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

function sourceLabel(source: string) {
  if (source === "seller_code") return "Código digitado";
  if (source === "checkout") return "Checkout";
  if (source === "link") return "Link compartilhado";
  return "Origem antiga";
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
  const activateProgram = useServerFn(activateReferralProgram);
  const query = useQuery({
    queryKey: ["referrals", "summary"],
    queryFn: () => fetchSummary({}),
    enabled: authed === true,
  });
  const { data, isLoading, error } = query;
  const activation = useMutation({
    mutationFn: () => activateProgram({}),
    onSuccess: () => {
      void query.refetch();
      toast.success("Programa de afiliados ativado!");
    },
    onError: () => toast.error("Não foi possível ativar agora. Tente novamente."),
  });
  const [filter, setFilter] = useState<"todas" | "pendente" | "pago" | "cancelado">("todas");
  const [termsAccepted, setTermsAccepted] = useState(false);

  if (authed === false) {
    return (
      <Shell>
        <div className="card rf-signin">
          <p>Entre na sua conta para pegar seu link de indicação.</p>
          <Link to="/entrar" search={{ next: "/indique" }} className="btn btn-primary">
            Entrar na minha conta
          </Link>
        </div>
      </Shell>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = data ? `${origin}/?seller=${data.code}` : "";

  return (
    <Shell>
      <header className="sec-head">
        <div className="badge">
          <b>60%</b>
          <span>por renovação</span>
        </div>
        <h1>
          Programa de <em className="h1-serif">afiliados</em>
        </h1>
        <p>
          Compartilhe seu link. Quando alguém assinar o Pitch AI por ele, você recebe{" "}
          <b>60% do valor pago</b> — a cada ciclo, enquanto a assinatura estiver ativa.
        </p>
      </header>

      {isLoading && <p className="site-page-note">Carregando…</p>}
      {error && (
        <p className="site-page-note">Não foi possível carregar seu link. Recarregue a página.</p>
      )}

      {data && !data.active && (
        <div className="card hi rf-activate">
          <h3>Quer participar do programa?</h3>
          <p>
            Ative seu cadastro para liberar seu link exclusivo e começar a receber 60% das
            assinaturas indicadas.
          </p>
          <label className="rf-terms">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.currentTarget.checked)}
            />
            <span>
              Aceito participar do Programa de Afiliados e receber comissões conforme as regras do
              Pitch AI.
            </span>
          </label>
          <button
            type="button"
            onClick={() => activation.mutate()}
            disabled={activation.isPending || !termsAccepted}
            className="btn btn-primary rf-activate-btn"
          >
            {activation.isPending ? "Ativando…" : "Quero participar"}
          </button>
        </div>
      )}

      {data?.active && (
        <div className="card rf-link-card">
          <h3>Seu link e código de vendedor</h3>
          <div className="rf-actions">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="rf-link"
              aria-label="Seu link de indicação"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const copied = await copyToClipboard(link);
                if (copied) toast.success("Link copiado!");
                else toast.error("Não consegui copiar — selecione o link e copie manualmente");
              }}
            >
              Copiar link
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={async () => {
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: "Pitch AI",
                      text: "Conheça o Pitch AI",
                      url: link,
                    });
                  } catch {
                    // O usuário pode fechar o diálogo nativo sem erro visível.
                  }
                } else {
                  const copied = await copyToClipboard(link);
                  if (copied) toast.success("Link copiado!");
                }
              }}
            >
              Compartilhar
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Automatize sua live do TikTok Shop com IA: ${link}`)}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-outline"
            >
              WhatsApp
            </a>
          </div>
          <p className="rf-code">
            Código promocional do vendedor: <b>{data.code}</b>
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="stats-grid">
            <Stat label="Indicados" value={String(data.totalIndicados)} />
            <Stat label="Viraram assinantes" value={String(data.totalAssinantes)} />
            <Stat
              label="Conversão"
              value={`${data.conversionRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
            />
            <Stat label="A receber" value={brl(data.totalPendenteCents)} />
            <Stat label="Já pago" value={brl(data.totalPagoCents)} />
            <Stat label="Cancelado" value={brl(data.totalCanceladoCents)} />
          </div>

          <section className="card rf-table-card">
            <div className="rf-head">
              <div>
                <h2>Funil das indicações</h2>
                <p className="site-page-note">
                  Veja como cada pessoa chegou e se já virou assinante. Os dados pessoais do
                  indicado permanecem protegidos.
                </p>
              </div>
            </div>
            {data.leads.length === 0 ? (
              <p className="site-page-note">Nenhuma indicação vinculada ainda.</p>
            ) : (
              <div className="rf-scroll">
                <table className="rf-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Origem</th>
                      <th>Código</th>
                      <th className="num">Etapa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.leads.slice(0, 100).map((lead) => (
                      <tr key={lead.id}>
                        <td>
                          {lead.created_at
                            ? new Date(lead.created_at).toLocaleDateString("pt-BR")
                            : "—"}
                        </td>
                        <td>{sourceLabel(lead.source)}</td>
                        <td className="rf-plan">{lead.code}</td>
                        <td className="num">
                          <span
                            className={`rf-status${lead.status === "assinante" ? " is-pago" : ""}`}
                          >
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card rf-table-card">
            <div className="rf-head">
              <h2>Minhas comissões</h2>
              <div className="rf-filters">
                {(["todas", "pendente", "pago", "cancelado"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rf-filter${filter === value ? " is-on" : ""}`}
                  >
                    {value === "todas" ? "Todas" : value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {data.commissions.length === 0 ? (
              <p className="site-page-note">
                Nenhuma comissão ainda. Compartilhe seu link para começar.
              </p>
            ) : (
              <div className="rf-scroll">
                <table className="rf-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Plano</th>
                      <th className="num">Base</th>
                      <th className="num">Comissão</th>
                      <th className="num">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.commissions
                      .filter((c) => filter === "todas" || c.status === filter)
                      .map((c) => (
                        <tr key={c.id}>
                          <td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                          <td className="rf-plan">{c.plan ?? "—"}</td>
                          <td className="num">{brl(c.base_cents)}</td>
                          <td className="num rf-comm">{brl(c.amount_cents)}</td>
                          <td className="num">
                            <span className={`rf-status${c.status === "pago" ? " is-pago" : ""}`}>
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.commissions.length > 0 &&
              data.commissions.filter((c) => filter === "todas" || c.status === filter).length ===
                0 && <p className="site-page-note">Nenhuma comissão neste filtro.</p>}

            <p className="rf-foot">
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
    /* a tabela de comissões pede fundo limpo: sem quadriculado */
    <SitePageFrame grid={false}>
      <div className="wrap rf-stack">{children}</div>
    </SitePageFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-n">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

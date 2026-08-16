import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";
import {
  checkIsAdmin,
  deleteAllRankedProducts,
  deleteRankedProduct,
  fetchCommissions,
  fetchCommissionsPage,
  fetchCosts,
  fetchPlans,
  fetchRanking,
  fetchStripeAdminSnapshot,
  insertRankedProducts,
  parseRankingCSV,
  setCommissionStatus,
  updateCosts,
  updateRankedProduct,
  type AdminCommission,
  type Costs,
  type RankedProduct,
  type StripeAdminSnapshot,
} from "@/lib/live/admin";
import { UsuariosTab } from "@/components/live/AdminUsuariosTab";
import { AdminFirestoreUsageTab } from "@/components/live/AdminFirestoreUsageTab";

export const Route = createFileRoute("/admin")({
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [{ title: "Admin · Pitch AI" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

type Tab =
  "overview" | "ranking" | "indicacoes" | "usuarios" | "usage_firestore" | "planos" | "custos";

function AdminPage() {
  const [status, setStatus] = useState<"loading" | "signed-out" | "not-admin" | "ok">("loading");
  const [email, setEmail] = useState<string>("");

  async function evaluate() {
    const fbAuth = getFirebaseAuth();
    const user = fbAuth.currentUser;
    if (!user) {
      setStatus("signed-out");
      return;
    }
    setEmail(user.email ?? "");
    try {
      const admin = await checkIsAdmin();
      setStatus(admin ? "ok" : "not-admin");
    } catch (error) {
      console.error("Falha ao validar acesso administrativo:", error);
      setStatus(getFirebaseAuth().currentUser ? "not-admin" : "signed-out");
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), () => evaluate());
    return () => unsub();
  }, []);

  async function logout() {
    await firebaseSignOut(getFirebaseAuth());
    setStatus("signed-out");
  }

  if (status === "loading") {
    return (
      <div className="marketing-page min-h-dvh grid place-items-center text-white/60">
        Carregando…
      </div>
    );
  }
  if (status === "signed-out") return <SessionExpired />;
  if (status === "not-admin") return <NotAdmin email={email} onLogout={logout} />;
  return <Dashboard email={email} onLogout={logout} />;
}

function SessionExpired() {
  return (
    <div className="marketing-page min-h-dvh grid place-items-center px-4">
      <div className="marketing-panel w-full max-w-sm rounded-2xl p-6 text-center space-y-4 backdrop-blur">
        <h1 className="marketing-title text-2xl">Sessão encerrada</h1>
        <p className="text-sm text-white/60">
          Entre novamente para acessar o painel administrativo.
        </p>
        <a
          href="/entrar?next=/admin"
          className="block rounded-lg bg-[#7C3AED] px-4 py-2 font-semibold text-white"
        >
          Entrar novamente
        </a>
      </div>
    </div>
  );
}

function NotAdmin({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="marketing-page min-h-dvh grid place-items-center px-4">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="text-white/60 text-sm">
          A conta <b>{email}</b> não tem o papel <code>admin</code>.
        </p>
        <button
          onClick={onLogout}
          className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="marketing-page min-h-dvh">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur sticky top-0 z-10">
        <div className="desktop-rail flex items-center justify-between py-3">
          <span className="text-lg font-bold">
            Pitch AI <span className="text-[#FF6B35]">Admin</span>
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/60 hidden sm:inline">{email}</span>
            <button onClick={onLogout} className="text-white/70 hover:text-white underline">
              Sair
            </button>
          </div>
        </div>
        <nav className="desktop-rail flex gap-1 overflow-x-auto">
          {(
            [
              "overview",
              "ranking",
              "indicacoes",
              "usuarios",
              "usage_firestore",
              "planos",
              "custos",
            ] as Tab[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                tab === t
                  ? "border-[#7C3AED] text-white"
                  : "border-transparent text-white/60 hover:text-white"
              }`}
            >
              {t === "overview" && "Visão geral"}
              {t === "ranking" && "Ranking de produtos"}
              {t === "indicacoes" && "Indicações"}
              {t === "usuarios" && "Usuários, Custos & Cotas"}
              {t === "usage_firestore" && "⚡ Uso IA Real-Time (Firestore)"}
              {t === "planos" && "Planos & receita"}
              {t === "custos" && "Custos Globais de IA"}
            </button>
          ))}
        </nav>
      </header>
      <main className="desktop-rail py-6">
        {tab === "overview" && <OverviewTab onNavigate={setTab} />}
        {tab === "ranking" && <RankingTab />}
        {tab === "indicacoes" && <IndicacoesTab />}
        {tab === "usuarios" && <UsuariosTab />}
        {tab === "usage_firestore" && <AdminFirestoreUsageTab />}
        {tab === "planos" && <PlanosTab />}
        {tab === "custos" && <CustosTab />}
      </main>
    </div>
  );
}

/* ---------- Visão geral ---------- */
function OverviewTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: fetchPlans });
  const costs = useQuery({ queryKey: ["admin", "costs"], queryFn: fetchCosts });
  const commissions = useQuery({ queryKey: ["admin", "commissions"], queryFn: fetchCommissions });
  const ranking = useQuery({ queryKey: ["admin", "ranking"], queryFn: fetchRanking });
  const loading = plans.isLoading || costs.isLoading || commissions.isLoading || ranking.isLoading;
  const failedSources = [
    plans.error ? "planos e assinaturas" : null,
    costs.error ? "custos" : null,
    commissions.error ? "comissões" : null,
    ranking.error ? "ranking" : null,
  ].filter((source): source is string => Boolean(source));
  const planRows = plans.data ?? [];
  const activePlans = planRows.filter((plan) => plan.assinantes > 0);
  const monthlyRevenue = planRows.reduce(
    (sum, plan) => sum + Number(plan.preco_mensal) * plan.assinantes,
    0,
  );
  const pendingCommissions = (commissions.data ?? []).filter((item) => item.status === "pendente");
  const commissionTotal =
    pendingCommissions.reduce((sum, item) => sum + item.amount_cents, 0) / 100;
  const costData = costs.data;
  const costTotal = costData
    ? ((costData.tokens_in_mes / 1000) * costData.chat_per_1k_in +
        (costData.tokens_out_mes / 1000) * costData.chat_per_1k_out +
        costData.minutos_tts_mes * costData.tts_per_min) *
      costData.usd_brl
    : 0;
  const retryAll = () => {
    void Promise.all([plans.refetch(), costs.refetch(), commissions.refetch(), ranking.refetch()]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#A78BFA]">
            Centro de comando
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Visão geral do negócio</h1>
          <p className="mt-1 text-sm text-white/50">
            Indicadores operacionais para decidir o próximo movimento.
          </p>
        </div>
        <p className="text-xs text-white/40">Atualizado sob demanda</p>
      </div>
      {failedSources.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            Não foi possível atualizar: {failedSources.join(", ")}. Os demais indicadores continuam
            disponíveis.
          </span>
          <button
            type="button"
            onClick={retryAll}
            className="shrink-0 rounded-lg border border-amber-300/25 bg-amber-200/10 px-3 py-1.5 text-xs font-semibold transition hover:bg-amber-200/20"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center text-sm text-white/50">
          Carregando indicadores reais…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ExecutiveStat
              label="Receita configurada"
              value={plans.error ? "Indisponível" : brl(monthlyRevenue)}
              detail={
                plans.error
                  ? "Falha ao consultar assinaturas"
                  : `${activePlans.length} planos ativos`
              }
              tone="violet"
            />
            <ExecutiveStat
              label="Custo registrado"
              value={costs.error ? "Indisponível" : brl(costTotal)}
              detail={costs.error ? "Falha ao consultar custos" : "Custos cadastrados no painel"}
              tone="orange"
            />
            <ExecutiveStat
              label="Comissões pendentes"
              value={commissions.error ? "Indisponível" : brl(commissionTotal)}
              detail={
                commissions.error
                  ? "Falha ao consultar comissões"
                  : `${pendingCommissions.length} pagamentos aguardando`
              }
              tone="rose"
            />
            <ExecutiveStat
              label="Produtos ranqueados"
              value={ranking.error ? "Indisponível" : String((ranking.data ?? []).length)}
              detail={ranking.error ? "Falha ao consultar ranking" : "Catálogo operacional"}
              tone="green"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Leitura rápida" hint="Sinais para acompanhar nesta sessão.">
              <div className="space-y-3">
                <Insight
                  label="Planos ativos"
                  value={plans.error ? "Dados indisponíveis" : `${activePlans.length}`}
                  tone={plans.error ? "warning" : "positive"}
                />
                <Insight
                  label="Comissões a pagar"
                  value={
                    commissions.error
                      ? "Dados indisponíveis"
                      : commissionTotal > 0
                        ? brl(commissionTotal)
                        : "Nenhuma pendência"
                  }
                  tone={commissions.error || commissionTotal > 0 ? "warning" : "positive"}
                />
                <Insight
                  label="Cobertura de custos"
                  value={
                    plans.error || costs.error
                      ? "Dados indisponíveis"
                      : monthlyRevenue > costTotal
                        ? "Receita acima dos custos"
                        : "Revisar margem"
                  }
                  tone={
                    !plans.error && !costs.error && monthlyRevenue > costTotal
                      ? "positive"
                      : "warning"
                  }
                />
              </div>
            </Card>
            <Card title="Atalhos operacionais" hint="Acesse os detalhes sem perder o contexto.">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <QuickLink
                  label="Usuários, custos e cotas"
                  hint="Acompanhar operação"
                  onClick={() => onNavigate("usuarios")}
                />
                <QuickLink
                  label="Planos e receita"
                  hint="Revisar assinaturas"
                  onClick={() => onNavigate("planos")}
                />
                <QuickLink
                  label="Uso IA Real-Time"
                  hint="Ver consumo Firestore"
                  onClick={() => onNavigate("usage_firestore")}
                />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function ExecutiveStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "violet" | "orange" | "rose" | "green";
}) {
  const colors = {
    violet: "text-[#C4B5FD]",
    orange: "text-[#FDBA74]",
    rose: "text-[#FDA4AF]",
    green: "text-[#86EFAC]",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${colors[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-white/40">{detail}</p>
    </div>
  );
}

function Insight({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "warning";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-white/60">{label}</span>
      <span
        className={`text-sm font-medium ${tone === "positive" ? "text-[#86EFAC]" : "text-[#FDBA74]"}`}
      >
        {value}
      </span>
    </div>
  );
}

function QuickLink({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-white/8 bg-black/15 px-3 py-2.5 text-left transition hover:border-[#7C3AED]/50 hover:bg-white/[0.06]"
    >
      <span className="text-sm text-white/80">{label}</span>
      <span className="text-[11px] text-white/40">{hint}</span>
    </button>
  );
}

function readableAdminError(error: unknown): string {
  const fallback = "Não foi possível carregar os dados. Atualize a página e tente novamente.";
  const message = error instanceof Error ? error.message : String(error ?? "");

  // O transporte das server functions pode devolver a página HTML de erro da
  // aplicação. Nunca exibimos esse documento bruto dentro do painel.
  if (
    !message.trim() ||
    /<(?:!doctype|html|head|body)\b/i.test(message) ||
    /unexpected token\s+['"]?</i.test(message)
  ) {
    return fallback;
  }

  return message;
}

function ErrorState({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200"
    >
      {readableAdminError(error)}
    </div>
  );
}

/* ---------- Indicações ---------- */
function IndicacoesTab() {
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendente" | "pago" | "cancelado">(
    "todos",
  );
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["admin", "commissions", "pages"],
    queryFn: ({ pageParam }) => fetchCommissionsPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const { isLoading, error } = query;
  const statusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pendente" | "pago" | "cancelado" }) =>
      setCommissionStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "commissions"] }),
  });

  const visibleItems = items.filter((c) => statusFilter === "todos" || c.status === statusFilter);
  const pend = items.filter((c) => c.status === "pendente");
  const pago = items.filter((c) => c.status === "pago");
  const sum = (arr: AdminCommission[]) => arr.reduce((s, c) => s + c.amount_cents, 0) / 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Comissões" value={items.length.toString()} />
        <Stat label="A pagar" value={brl(sum(pend))} />
        <Stat label="Já pago" value={brl(sum(pago))} />
        <Stat label="Taxa nível 1" value="60%" />
      </div>

      <Card
        title="Programa de afiliados · comissões"
        hint="Marque como pago depois de enviar o PIX ao indicador."
      >
        {error ? (
          <ErrorState error={error} />
        ) : isLoading ? (
          <p className="text-white/50 text-sm py-6 text-center">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-white/50 text-sm py-6 text-center">
            Nenhuma comissão registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="mb-3 flex gap-1 rounded-lg bg-black/20 p-1 text-xs w-fit">
              {(["todos", "pendente", "pago", "cancelado"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded px-2 py-1 ${statusFilter === value ? "bg-[#7C3AED] text-white" : "text-white/50 hover:text-white"}`}
                >
                  {value === "todos" ? "Todos" : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 text-left border-b border-white/10">
                  <th className="py-2 pr-2">Data</th>
                  <th className="py-2 pr-2">Indicador</th>
                  <th className="py-2 pr-2">Indicado</th>
                  <th className="py-2 pr-2">Plano</th>
                  <th className="py-2 pr-2 text-right">Base</th>
                  <th className="py-2 pr-2 text-right">Comissão</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((c) => (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className="py-2 pr-2 text-white/60">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs">{c.referrer_id.slice(0, 8)}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{c.referred_id.slice(0, 8)}</td>
                    <td className="py-2 pr-2 uppercase">{c.plan ?? "—"}</td>
                    <td className="py-2 pr-2 text-right font-mono text-white/60">
                      {brl(c.base_cents / 100)}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-[#00E676]">
                      {brl(c.amount_cents / 100)}
                    </td>
                    <td className="py-2 pr-2">{c.status}</td>
                    <td className="py-2 text-right space-x-2 whitespace-nowrap">
                      {c.status !== "pago" && (
                        <button
                          onClick={() => statusM.mutate({ id: c.id, status: "pago" })}
                          className="rounded bg-[#00E676]/15 text-[#00E676] px-2 py-1 text-xs"
                        >
                          Marcar pago
                        </button>
                      )}
                      {c.status !== "cancelado" && (
                        <button
                          onClick={() => statusM.mutate({ id: c.id, status: "cancelado" })}
                          className="rounded bg-white/5 px-2 py-1 text-xs text-white/60"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleItems.length === 0 && (
              <p className="py-6 text-center text-sm text-white/50">
                Nenhuma comissão neste filtro.
              </p>
            )}
          </div>
        )}
        {query.hasNextPage && (
          <button
            type="button"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="mt-4 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Carregando…" : "Carregar mais comissões"}
          </button>
        )}
      </Card>
      {statusM.error && <ErrorState error={statusM.error} />}
    </div>
  );
}

/* ---------- Ranking ---------- */
function RankingTab() {
  const qc = useQueryClient();
  const {
    data: items = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "ranking"],
    queryFn: fetchRanking,
  });
  const [raw, setRaw] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "ranking"] });

  const importM = useMutation({
    mutationFn: async (r: string) => {
      const parsed = parseRankingCSV(r);
      await insertRankedProducts(parsed);
    },
    onSuccess: () => {
      setRaw("");
      invalidate();
    },
  });
  const patchM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RankedProduct> }) =>
      updateRankedProduct(id, patch),
    onSuccess: invalidate,
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteRankedProduct(id),
    onSuccess: invalidate,
  });
  const resetM = useMutation({
    mutationFn: () => deleteAllRankedProducts(),
    onSuccess: invalidate,
  });

  const totalVendas = items.reduce((s, p) => s + p.vendas, 0);
  const totalReceita = items.reduce((s, p) => s + Number(p.receita), 0);
  const destaques = items.filter((p) => p.destaque);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Produtos" value={items.length.toString()} />
        <Stat label="Destaques" value={destaques.length.toString()} />
        <Stat label="Vendas totais" value={totalVendas.toLocaleString("pt-BR")} />
        <Stat label="Receita" value={brl(totalReceita)} />
      </div>

      <Card
        title="Importar do TikTok Shop"
        hint="Cole no formato: nome,vendas,receita (uma linha por produto). Separador , ; ou tab."
      >
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder={`Camiseta preta,320,9600\nCaneca personalizada,210,4200\n...`}
          className="w-full rounded-lg bg-black/40 border border-white/10 p-3 text-sm font-mono text-white outline-none focus:border-[#7C3AED]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => importM.mutate(raw)}
            disabled={!raw.trim() || importM.isPending}
            className="rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 px-4 py-2 text-sm font-semibold"
          >
            {importM.isPending ? "Importando…" : "Importar"}
          </button>
          <button
            onClick={() => {
              if (confirm("Apagar todo o ranking?")) resetM.mutate();
            }}
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm"
          >
            Limpar tudo
          </button>
        </div>
        {importM.error && (
          <p className="text-sm text-red-400">{(importM.error as Error).message}</p>
        )}
        {(patchM.error || delM.error || resetM.error) && (
          <ErrorState error={patchM.error || delM.error || resetM.error} />
        )}
      </Card>

      <ProdutoPorLinkCard onDone={invalidate} />

      <Card title="Ranking" hint="Marque a estrela para destacar os melhores produtos.">
        {error ? (
          <ErrorState error={error} />
        ) : isLoading ? (
          <p className="text-white/50 text-sm py-6 text-center">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-white/50 text-sm py-6 text-center">
            Sem produtos ainda. Importe acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 text-left border-b border-white/10">
                  <th className="py-2 pr-2 w-10">#</th>
                  <th className="py-2 pr-2 w-10">★</th>
                  <th className="py-2 pr-2">Produto</th>
                  <th className="py-2 pr-2 text-right">Vendas</th>
                  <th className="py-2 pr-2 text-right">Receita</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-2 pr-2 text-white/40 font-mono">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <button
                        onClick={() =>
                          patchM.mutate({ id: p.id, patch: { destaque: !p.destaque } })
                        }
                        className={`text-lg leading-none ${p.destaque ? "text-[#FF6B35]" : "text-white/20 hover:text-white/60"}`}
                        title={p.destaque ? "Remover destaque" : "Destacar"}
                      >
                        ★
                      </button>
                    </td>
                    <td className="py-2 pr-2">{p.nome}</td>
                    <td className="py-2 pr-2 text-right font-mono">
                      {p.vendas.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">{brl(Number(p.receita))}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => delM.mutate(p.id)}
                        className="text-white/40 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Planos ---------- */
function PlanosTab() {
  const {
    data: plans = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: fetchPlans,
  });
  const stripe = useQuery({
    queryKey: ["admin", "stripe"],
    queryFn: fetchStripeAdminSnapshot,
    refetchInterval: 30_000,
  });

  const mrr = plans.reduce((s, p) => s + Number(p.preco_mensal) * p.assinantes, 0);
  const arr = mrr * 12;
  const totalUsers = plans.reduce((s, p) => s + p.assinantes, 0);
  const arpu = totalUsers > 0 ? mrr / totalUsers : 0;

  return (
    <div className="space-y-6">
      <StripeOverview
        data={stripe.data}
        loading={stripe.isLoading}
        error={stripe.error}
        onRefresh={() => stripe.refetch()}
        refreshing={stripe.isFetching}
      />

      <h2 className="text-sm font-semibold text-white/70">Projeção interna do Firestore</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="MRR" value={brl(mrr)} />
        <Stat label="ARR" value={brl(arr)} />
        <Stat label="Assinantes" value={totalUsers.toString()} />
        <Stat label="ARPU" value={brl(arpu)} />
      </div>

      <Card
        title="Planos"
        hint="Preços do catálogo oficial e assinaturas ativas confirmadas pelo backend."
      >
        {error ? (
          <ErrorState error={error} />
        ) : isLoading ? (
          <p className="text-white/50 text-sm py-4">Carregando…</p>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_150px_120px_150px] gap-3 items-center bg-black/30 border border-white/10 rounded-lg p-3"
              >
                <div>
                  <div className="font-medium">{p.nome}</div>
                  <div className="text-xs font-mono text-white/40">{p.slug}</div>
                </div>
                <div>
                  <div className="text-xs text-white/40">Cobrança por ciclo</div>
                  <div className="font-mono">
                    {brl(p.amount_cents / 100)} / {p.months} {p.months === 1 ? "mês" : "meses"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-white/40">Assinantes ativos</div>
                  <div className="font-mono text-lg">{p.assinantes}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/40">MRR equivalente</div>
                  <div className="font-mono text-[#00E676]">
                    {brl(Number(p.preco_mensal) * p.assinantes)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StripeOverview({
  data,
  loading,
  error,
  onRefresh,
  refreshing,
}: {
  data?: StripeAdminSnapshot;
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const statusClass = (status: string) => {
    if (["active", "paid"].includes(status)) return "text-[#00E676] bg-[#00E676]/10";
    if (["past_due", "unpaid", "incomplete", "open"].includes(status))
      return "text-amber-300 bg-amber-400/10";
    return "text-white/60 bg-white/5";
  };

  if (error) {
    return (
      <Card title="Stripe" hint="Dados financeiros consultados diretamente no Stripe.">
        <ErrorState error={error} />
      </Card>
    );
  }
  if (loading || !data) {
    return (
      <Card title="Stripe" hint="Dados financeiros consultados diretamente no Stripe.">
        <p className="text-white/50 text-sm py-4">Consultando Stripe…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Stripe</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                data.environment === "live"
                  ? "bg-[#00E676]/15 text-[#00E676]"
                  : "bg-amber-400/15 text-amber-300"
              }`}
            >
              {data.environment === "live" ? "Produção" : "Modo teste"}
            </span>
          </div>
          <p className="text-xs text-white/45">
            Atualizado em {new Date(data.fetchedAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing ? "Atualizando…" : "Atualizar Stripe"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="MRR no Stripe" value={brl(data.mrrCents / 100)} />
        <Stat label="Recebido em 30 dias" value={brl(data.paidLast30DaysCents / 100)} />
        <Stat label="Saldo disponível" value={brl(data.availableBalanceCents / 100)} />
        <Stat label="Saldo pendente" value={brl(data.pendingBalanceCents / 100)} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat label="Ativas" value={String(data.active)} />
        <Stat label="Em teste" value={String(data.trialing)} />
        <Stat label="Com problema" value={String(data.pastDue)} />
        <Stat label="Canceladas" value={String(data.canceled)} />
        <Stat label="Não sincronizadas" value={String(data.unsynced)} />
      </div>

      {data.unsynced > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
          Há {data.unsynced} assinatura(s) ativa(s) no Stripe sem o mesmo ID no Firestore. Verifique
          o webhook antes de liberar acesso manualmente.
        </div>
      )}

      <Card
        title="Assinaturas no Stripe"
        hint="Fonte financeira real; atualizada a cada 30 segundos."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-xs text-left">
            <thead className="border-b border-white/10 text-white/45">
              <tr>
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Plano</th>
                <th className="py-2 pr-3">Valor/ciclo</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Próxima renovação</th>
                <th className="py-2 pr-3">Firestore</th>
                <th className="py-2 text-right">Stripe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-5 text-center text-white/45">
                    Nenhuma assinatura.
                  </td>
                </tr>
              ) : (
                data.subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="py-2.5 pr-3">
                      <div className="text-white">{sub.email || "Sem e-mail"}</div>
                      <div className="font-mono text-[10px] text-white/35">{sub.id}</div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono">{sub.plan}</td>
                    <td className="py-2.5 pr-3">{brl(sub.amountCents / 100)}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-full px-2 py-1 font-semibold ${statusClass(sub.status)}`}
                      >
                        {sub.status}
                        {sub.cancelAtPeriodEnd ? " · cancela no fim" : ""}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      {sub.currentPeriodEnd
                        ? new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td
                      className={`py-2.5 pr-3 ${sub.firestoreSynced ? "text-[#00E676]" : "text-amber-300"}`}
                    >
                      {sub.firestoreSynced ? "Sincronizado" : "Divergente"}
                    </td>
                    <td className="py-2.5 text-right">
                      <a
                        href={sub.dashboardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-300 hover:underline"
                      >
                        Abrir ↗
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Faturas recentes"
        hint="Pagamentos, faturas abertas e falhas dos últimos 30 dias."
      >
        <div className="space-y-2">
          {data.recentInvoices.length === 0 ? (
            <p className="py-3 text-sm text-white/45">Nenhuma fatura nos últimos 30 dias.</p>
          ) : (
            data.recentInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="grid gap-2 rounded-lg border border-white/5 bg-black/25 p-3 sm:grid-cols-[1fr_120px_100px_110px] sm:items-center"
              >
                <div>
                  <div className="text-sm">{invoice.email || "Cliente sem e-mail"}</div>
                  <div className="font-mono text-[10px] text-white/35">{invoice.id}</div>
                </div>
                <div className="font-mono">{brl(invoice.amountCents / 100)}</div>
                <span
                  className={`w-fit rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(invoice.status)}`}
                >
                  {invoice.status}
                </span>
                <div className="text-right text-white/55">
                  {invoice.hostedUrl ? (
                    <a
                      href={invoice.hostedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-300 hover:underline"
                    >
                      Ver fatura ↗
                    </a>
                  ) : (
                    new Date(invoice.createdAt).toLocaleDateString("pt-BR")
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Custos ---------- */
function CustosTab() {
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({
    queryKey: ["admin", "costs"],
    queryFn: fetchCosts,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: fetchPlans,
  });
  const patchM = useMutation({
    mutationFn: (patch: Partial<Costs>) => updateCosts(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "costs"] }),
  });

  const custoChatUsd = useMemo(() => {
    if (!c) return 0;
    return (
      (Number(c.tokens_in_mes) / 1000) * Number(c.chat_per_1k_in) +
      (Number(c.tokens_out_mes) / 1000) * Number(c.chat_per_1k_out)
    );
  }, [c]);
  const custoTtsUsd = useMemo(
    () => (c ? Number(c.minutos_tts_mes) * Number(c.tts_per_min) : 0),
    [c],
  );
  const totalUsd = custoChatUsd + custoTtsUsd;
  const totalBrl = totalUsd * (c ? Number(c.usd_brl) : 0);
  const mrr = plans.reduce((s, p) => s + Number(p.preco_mensal) * p.assinantes, 0);
  const margem = mrr > 0 ? ((mrr - totalBrl) / mrr) * 100 : 0;

  if (isLoading || !c) return <p className="text-white/50 text-sm">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Custo Chat" value={`$${custoChatUsd.toFixed(2)}`} />
        <Stat label="Custo TTS" value={`$${custoTtsUsd.toFixed(2)}`} />
        <Stat label="Total mês" value={brl(totalBrl)} sub={`$${totalUsd.toFixed(2)}`} />
        <Stat label="Margem vs MRR" value={`${margem.toFixed(1)}%`} sub={brl(mrr - totalBrl)} />
      </div>

      <Card title="Preços do provedor (USD)">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumField
            label="Chat / 1k tokens IN"
            value={Number(c.chat_per_1k_in)}
            step={0.01}
            onChange={(v) => patchM.mutate({ chat_per_1k_in: v })}
          />
          <NumField
            label="Chat / 1k tokens OUT"
            value={Number(c.chat_per_1k_out)}
            step={0.01}
            onChange={(v) => patchM.mutate({ chat_per_1k_out: v })}
          />
          <NumField
            label="TTS / minuto"
            value={Number(c.tts_per_min)}
            step={0.001}
            onChange={(v) => patchM.mutate({ tts_per_min: v })}
          />
        </div>
      </Card>

      <Card title="Uso mensal estimado">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <NumField
            label="Tokens IN / mês"
            value={Number(c.tokens_in_mes)}
            step={1000}
            onChange={(v) => patchM.mutate({ tokens_in_mes: v })}
          />
          <NumField
            label="Tokens OUT / mês"
            value={Number(c.tokens_out_mes)}
            step={1000}
            onChange={(v) => patchM.mutate({ tokens_out_mes: v })}
          />
          <NumField
            label="Minutos TTS / mês"
            value={Number(c.minutos_tts_mes)}
            step={10}
            onChange={(v) => patchM.mutate({ minutos_tts_mes: v })}
          />
        </div>
      </Card>

      <Card title="Câmbio">
        <NumField
          label="USD → BRL"
          value={Number(c.usd_brl)}
          step={0.01}
          onChange={(v) => patchM.mutate({ usd_brl: v })}
        />
      </Card>
    </div>
  );
}

/* ---------- UI helpers ---------- */
function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-white/50 mt-1">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {sub && <div className="text-xs text-white/40 font-mono">{sub}</div>}
    </div>
  );
}
function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <label className="flex flex-col text-xs text-white/60">
      {label}
      <input
        type="number"
        value={draft}
        step={step ?? 1}
        min={0}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = +draft || 0;
          setDraft(String(v));
          if (v !== value) onChange(v);
        }}
        className="mt-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
      />
    </label>
  );
}
function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ---------- Produto por link (manual) ---------- */
function ProdutoPorLinkCard({ onDone }: { onDone: () => void }) {
  const empty = {
    nome: "",
    link: "",
    imagem_url: "",
    categoria: "",
    preco: 0,
    comissao_pct: 0,
    vendas: 0,
    destaque: false,
  };
  const [form, setForm] = useState(empty);

  const addM = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do produto.");
      await insertRankedProducts([
        {
          nome: form.nome.trim(),
          link: form.link.trim() || null,
          imagem_url: form.imagem_url.trim() || null,
          categoria: form.categoria.trim() || null,
          preco: Number(form.preco) || 0,
          comissao_pct: Number(form.comissao_pct) || 0,
          vendas: Number(form.vendas) || 0,
          receita: (Number(form.preco) || 0) * (Number(form.vendas) || 0),
          destaque: form.destaque,
        },
      ]);
    },
    onSuccess: () => {
      setForm(empty);
      onDone();
    },
  });

  const field =
    "mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-[#7C3AED]";

  return (
    <Card
      title="Adicionar produto pelo link"
      hint="Cole o link do produto e preencha os dados manualmente. Aparece na página pública /quentes."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/60">
        <label className="sm:col-span-2">
          Nome do produto
          <input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className={field}
            placeholder="Kit skincare vitamina C"
          />
        </label>
        <label className="sm:col-span-2">
          Link do produto
          <input
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
            className={field}
            placeholder="https://shop.tiktok.com/..."
          />
        </label>
        <label className="sm:col-span-2">
          URL da imagem
          <input
            value={form.imagem_url}
            onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
            className={field}
            placeholder="https://..."
          />
        </label>
        <label>
          Categoria
          <input
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className={field}
            placeholder="Beleza"
          />
        </label>
        <label>
          Preço (R$)
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.preco}
            onChange={(e) => setForm({ ...form, preco: +e.target.value || 0 })}
            className={`${field} font-mono`}
          />
        </label>
        <label>
          Comissão (%)
          <input
            type="number"
            min={0}
            step={1}
            value={form.comissao_pct}
            onChange={(e) => setForm({ ...form, comissao_pct: +e.target.value || 0 })}
            className={`${field} font-mono`}
          />
        </label>
        <label>
          Vendas
          <input
            type="number"
            min={0}
            value={form.vendas}
            onChange={(e) => setForm({ ...form, vendas: +e.target.value || 0 })}
            className={`${field} font-mono`}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={form.destaque}
          onChange={(e) => setForm({ ...form, destaque: e.target.checked })}
        />
        Marcar como destaque 🔥
      </label>

      {addM.error && <p className="text-sm text-red-400">{(addM.error as Error).message}</p>}
      <button
        onClick={() => addM.mutate()}
        disabled={addM.isPending}
        className="rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 px-4 py-2 text-sm font-semibold"
      >
        {addM.isPending ? "Salvando…" : "Adicionar ao ranking"}
      </button>
    </Card>
  );
}

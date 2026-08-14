import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompedAccess } from "@/lib/live/comped.functions";
import { getFirebaseAuth } from "@/lib/firebase";
import { PITCHAI_PLANS } from "@/lib/live/plans";
import {
  calculateUserCost,
  DEFAULT_PLAN_QUOTAS,
  fetchCosts,
  fetchPlanQuotas,
  fetchUsersWithUsage,
  resetUserUsageAdmin,
  savePlanQuotas,
  setUserBlocked,
  type AdminUserUsage,
  type Costs,
  type PlanQuota,
} from "@/lib/live/admin";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

type SubTab = "custos" | "calculadora" | "cotas" | "cortesia";

const PLAN_PRICES: Record<string, number> = {
  gratuito: 0,
  ...Object.fromEntries(
    PITCHAI_PLANS.map((plan) => [plan.priceId, plan.amountCents / 100 / plan.months]),
  ),
  // Compatibilidade de leitura para assinaturas legadas.
  pro: 27.9,
  starter: 27.9,
  studio: 27.9,
};

const PAID_PLAN_IDS = PITCHAI_PLANS.map((plan) => plan.priceId);

function escapeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function readableServerError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    !message.trim() ||
    /<(?:!doctype|html|head|body)\b/i.test(message) ||
    /unexpected token\s+['"]?</i.test(message)
  ) {
    return fallback;
  }
  return message || fallback;
}

async function courtesyRequest<T>(method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sua sessão terminou. Entre novamente.");
  const token = await user.getIdToken();
  const response = await fetch("/api/admin/courtesy", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `Falha no servidor (${response.status}).`);
  return payload as T;
}

/** Gestão avançada de usuários, cotas e verificação de custos de IA. */
export function UsuariosTab() {
  const qc = useQueryClient();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("custos");

  // Dados de preços da API do provedor
  const { data: costs } = useQuery({
    queryKey: ["admin", "costs"],
    queryFn: fetchCosts,
  });

  const providerPrices: Costs = useMemo(
    () =>
      costs || {
        chat_per_1k_in: 0.0001,
        chat_per_1k_out: 0.0004,
        tts_per_min: 0.015,
        tokens_in_mes: 5000000,
        tokens_out_mes: 1500000,
        minutos_tts_mes: 500,
        usd_brl: 5.6,
      },
    [costs],
  );

  // Busca usuários reais do Firestore (ai_usage_stats + subscription)
  const {
    data: usersList = [],
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: ["admin", "users-with-usage"],
    queryFn: fetchUsersWithUsage,
  });
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [marginFilter, setMarginFilter] = useState<string>("all");

  // Cortesia State
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(365);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const {
    data: compedItems = [],
    isLoading: compedLoading,
    error: compedError,
  } = useQuery({
    queryKey: ["admin", "comped"],
    queryFn: async () => (await courtesyRequest<{ items: CompedAccess[] }>("GET")).items,
  });

  const grantM = useMutation({
    mutationFn: () => courtesyRequest<{ ok: true }>("POST", { email, days, note }),
    onSuccess: (res: any) => {
      if (res?.error) return setMsg({ kind: "err", text: res.error });
      setMsg({ kind: "ok", text: `Acesso liberado com sucesso para ${email}` });
      setEmail("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "comped"] });
    },
    onError: (e: unknown) =>
      setMsg({ kind: "err", text: readableServerError(e, "Falha ao liberar") }),
  });

  const revokeM = useMutation({
    mutationFn: (userId: string) => courtesyRequest<{ ok: true }>("DELETE", { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "comped"] }),
    onError: (e: unknown) =>
      setMsg({ kind: "err", text: readableServerError(e, "Falha ao revogar") }),
  });

  // Cotas State — carrega do servidor, fallback para defaults
  const [quotas, setQuotas] = useState<Record<string, PlanQuota>>(DEFAULT_PLAN_QUOTAS);
  const { data: serverQuotas } = useQuery({
    queryKey: ["admin", "plan-quotas"],
    queryFn: fetchPlanQuotas,
  });
  useEffect(() => {
    if (serverQuotas) setQuotas(serverQuotas);
  }, [serverQuotas]);

  const saveQuotasM = useMutation({
    mutationFn: (q: Record<string, PlanQuota>) => savePlanQuotas(q),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plan-quotas"] }),
  });

  // Profiler Calculator State
  const [simPlan, setSimPlan] = useState("pitchai_mensal");
  const [simLives, setSimLives] = useState(15);
  const [simDuration, setSimDuration] = useState(60); // minutos por live
  const [simPromptsPerLive, setSimPromptsPerLive] = useState(25);
  const [simTtsMinutesPerLive, setSimTtsMinutesPerLive] = useState(6);
  const [simModel, setSimModel] = useState<"flash" | "pro">("flash");

  // Cálculo da Calculadora Individual
  const profilerCalc = useMemo(() => {
    // Estimativa de tokens por prompt (entrada e saída)
    const tokensInPerPrompt = simModel === "flash" ? 1200 : 2500;
    const tokensOutPerPrompt = simModel === "flash" ? 350 : 600;

    const totalPrompts = simLives * simPromptsPerLive;
    const totalTokensIn = totalPrompts * tokensInPerPrompt;
    const totalTokensOut = totalPrompts * tokensOutPerPrompt;
    const totalTtsMin = simLives * simTtsMinutesPerLive;

    const planPrice = PLAN_PRICES[simPlan] || PLAN_PRICES.pitchai_mensal;

    const costDetails = calculateUserCost(
      totalTokensIn,
      totalTokensOut,
      totalTtsMin,
      providerPrices,
      planPrice,
    );

    const costPerLiveBrl = simLives > 0 ? costDetails.totalBrl / simLives : 0;
    const maxLivesBreakEven = costPerLiveBrl > 0 ? Math.floor(planPrice / costPerLiveBrl) : 999;

    return {
      totalTokensIn,
      totalTokensOut,
      totalTtsMin,
      planPrice,
      costPerLiveBrl,
      totalCostUsd: costDetails.totalUsd,
      totalCostBrl: costDetails.totalBrl,
      netMarginBrl: costDetails.netMarginBrl,
      marginPct: costDetails.marginPct,
      maxLivesBreakEven,
    };
  }, [simPlan, simLives, simPromptsPerLive, simTtsMinutesPerLive, simModel, providerPrices]);

  // Processamento e enriquecimento dos usuários com cálculo de custos
  const enrichedUsers = useMemo(() => {
    return usersList.map((u) => {
      const planPrice = u.isComped ? 0 : PLAN_PRICES[u.plan] || 0;
      const cost = calculateUserCost(
        u.tokensInput,
        u.tokensOutput,
        u.ttsMinutes,
        providerPrices,
        planPrice,
      );

      const quota = quotas[u.plan] || DEFAULT_PLAN_QUOTAS.gratuito;
      const isOverTokenQuota = u.tokensInput + u.tokensOutput > quota.monthlyTokenLimit;
      const isOverTtsQuota = u.ttsMinutes > quota.ttsMinutesLimit;
      const isOverQuota = isOverTokenQuota || isOverTtsQuota;

      return {
        ...u,
        id: u.userId,
        tokensIn: u.tokensInput,
        tokensOut: u.tokensOutput,
        livesCount: u.apiCallCount,
        lastActive: u.lastApiCallAt ? new Date(u.lastApiCallAt).toLocaleString("pt-BR") : "—",
        costBrl: cost.totalBrl,
        costUsd: cost.totalUsd,
        planPrice,
        netMarginBrl: cost.netMarginBrl,
        marginPct: cost.marginPct,
        isOverQuota,
      };
    });
  }, [usersList, providerPrices, quotas]);

  // Filtragem da lista
  const filteredUsers = useMemo(() => {
    return enrichedUsers.filter((u) => {
      const matchesSearch =
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.id.toLowerCase().includes(search.toLowerCase());
      const matchesPlan = planFilter === "all" || u.plan === planFilter;

      let matchesMargin = true;
      if (marginFilter === "deficit") matchesMargin = u.netMarginBrl < 0;
      if (marginFilter === "profitable") matchesMargin = u.netMarginBrl > 0;
      if (marginFilter === "over_quota") matchesMargin = u.isOverQuota;
      if (marginFilter === "comped") matchesMargin = u.isComped;

      return matchesSearch && matchesPlan && matchesMargin;
    });
  }, [enrichedUsers, search, planFilter, marginFilter]);

  // Métricas agregadas
  const metrics = useMemo(() => {
    const totalUsersCount = enrichedUsers.length;
    const totalCostBrl = enrichedUsers.reduce((s, u) => s + u.costBrl, 0);
    const totalRevenueBrl = enrichedUsers.reduce((s, u) => s + u.planPrice, 0);
    const deficitUsersCount = enrichedUsers.filter((u) => u.netMarginBrl < 0).length;
    const overQuotaCount = enrichedUsers.filter((u) => u.isOverQuota).length;

    return {
      totalUsersCount,
      totalCostBrl,
      totalRevenueBrl,
      netProfitBrl: totalRevenueBrl - totalCostBrl,
      deficitUsersCount,
      overQuotaCount,
    };
  }, [enrichedUsers]);

  // Ações individuais — chamam server functions reais que persistem no Firestore
  const blockM = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) =>
      setUserBlocked(userId, blocked),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users-with-usage"] }),
  });

  const resetM = useMutation({
    mutationFn: (userId: string) => resetUserUsageAdmin(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users-with-usage"] }),
  });

  const exportCSV = () => {
    const headers = [
      "ID",
      "Email",
      "Plano",
      "Cortesia",
      "Bloqueado",
      "Tokens In",
      "Tokens Out",
      "Minutos TTS",
      "Lives",
      "Custo (R$)",
      "Receita (R$)",
      "Margem (R$)",
      "Margem (%)",
      "Cota Excedida",
    ];

    const rows = filteredUsers.map((u) => [
      u.id,
      u.email,
      u.plan,
      u.isComped ? "Sim" : "Não",
      u.isBlocked ? "Sim" : "Não",
      u.tokensIn,
      u.tokensOut,
      u.ttsMinutes,
      u.livesCount,
      u.costBrl.toFixed(2),
      u.planPrice.toFixed(2),
      u.netMarginBrl.toFixed(2),
      u.marginPct.toFixed(1) + "%",
      u.isOverQuota ? "Sim" : "Não",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\r\n");
    const blobUrl = URL.createObjectURL(
      new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.setAttribute("href", blobUrl);
    link.setAttribute(
      "download",
      `relatorio-custos-usuarios-pitchai-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div className="space-y-6">
      {/* Menu Superior Interno da Aba Usuários & Custos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab("custos")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "custos"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Verificação de Custos
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("calculadora")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "calculadora"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Simulador / Profiler de Custo
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("cotas")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "cotas"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Cotas & Limites por Plano
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("cortesia")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "cortesia"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Acesso Free / Cortesia ({compedItems.length})
          </button>
        </div>

        {activeSubTab === "custos" && (
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-medium text-white transition"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV de Custos
          </button>
        )}
      </div>

      {/* SUB-ABA 1: VERIFICAÇÃO DE CUSTOS POR USUÁRIO */}
      {activeSubTab === "custos" && (
        <div className="space-y-6">
          {/* Dashboard de métricas financeiras por usuário */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/50 flex items-center justify-between">
                <span>Custo Total de IA</span>
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-xl font-bold font-mono mt-1 text-red-400">
                R$ {metrics.totalCostBrl.toFixed(2)}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">Custo de Gemini + TTS</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/50 flex items-center justify-between">
                <span>Receita Bruta</span>
                <TrendingUp className="w-4 h-4 text-[#00E676]" />
              </div>
              <div className="text-xl font-bold font-mono mt-1 text-[#00E676]">
                R$ {metrics.totalRevenueBrl.toFixed(2)}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">Planos dos usuários listados</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/50 flex items-center justify-between">
                <span>Lucro Líquido</span>
                <CheckCircle2 className="w-4 h-4 text-[#7C3AED]" />
              </div>
              <div
                className={`text-xl font-bold font-mono mt-1 ${
                  metrics.netProfitBrl >= 0 ? "text-white" : "text-red-400"
                }`}
              >
                R$ {metrics.netProfitBrl.toFixed(2)}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">Margem geral do lote</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-white/50 flex items-center justify-between">
                <span>Usuários em Alerta</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold font-mono mt-1 text-amber-400">
                {metrics.deficitUsersCount + metrics.overQuotaCount}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">
                {metrics.deficitUsersCount} com prejuízo · {metrics.overQuotaCount} cota estourada
              </div>
            </div>
          </div>

          {/* Filtros e Busca */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por e-mail ou ID…"
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-[#7C3AED]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto text-xs">
                <span className="text-white/40 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" />
                  Filtrar:
                </span>
                <select
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-white outline-none focus:border-[#7C3AED]"
                >
                  <option value="all">Todos os Planos</option>
                  <option value="gratuito">Gratuito</option>
                  {PITCHAI_PLANS.map((plan) => (
                    <option key={plan.priceId} value={plan.priceId}>
                      {plan.name} (
                      {(plan.amountCents / 100).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                      )
                    </option>
                  ))}
                </select>

                <select
                  value={marginFilter}
                  onChange={(e) => setMarginFilter(e.target.value)}
                  className="rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-white outline-none focus:border-[#7C3AED]"
                >
                  <option value="all">Todos os Status Financeiros</option>
                  <option value="deficit">⚠️ Com Prejuízo (Custo &gt; Receita)</option>
                  <option value="profitable">✅ Lucrativos</option>
                  <option value="over_quota">🛑 Cota Excedida</option>
                  <option value="comped">🎁 Cortesia / Free</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabela de Verificação Detalhada */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-sm">
                  Relatório e Auditoria de Custos por Usuário
                </h2>
                <p className="text-xs text-white/50">
                  Acompanhe exatamente quanto cada usuário consome de tokens de Gemini, minutos de
                  voz TTS e o resultado financeiro líquido.
                </p>
              </div>
              <span className="text-xs text-white/40 font-mono">
                {filteredUsers.length} de {usersList.length} usuários
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-white/50 border-b border-white/10">
                    <th className="py-2.5 pr-3">Usuário / E-mail</th>
                    <th className="py-2.5 pr-3">Plano</th>
                    <th className="py-2.5 pr-3 text-right">Tokens Chat (In/Out)</th>
                    <th className="py-2.5 pr-3 text-right">Min. TTS</th>
                    <th className="py-2.5 pr-3 text-right">Lives</th>
                    <th className="py-2.5 pr-3 text-right">Custo IA (R$)</th>
                    <th className="py-2.5 pr-3 text-right">Receita (R$)</th>
                    <th className="py-2.5 pr-3 text-right">Margem Líquida</th>
                    <th className="py-2.5 pr-3 text-center">Status</th>
                    <th className="py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {usersError ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-red-300 font-sans">
                        {readableServerError(
                          usersError,
                          "Falha ao carregar usuários. Atualize a página e tente novamente.",
                        )}
                      </td>
                    </tr>
                  ) : usersLoading ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-white/40 font-sans">
                        Carregando usuários…
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-white/40 font-sans">
                        Nenhum usuário encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const totalTokens = u.tokensIn + u.tokensOut;
                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-white/[0.02] transition ${
                            u.netMarginBrl < 0 ? "bg-red-500/5" : ""
                          }`}
                        >
                          <td className="py-3 pr-3 font-sans">
                            <div className="font-medium text-white flex items-center gap-1.5">
                              {u.email}
                              {u.isComped && (
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] px-1.5 py-0.2 rounded font-sans">
                                  Cortesia
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-white/40 font-mono mt-0.5">
                              ID: {u.id} · Ativo: {u.lastActive}
                            </div>
                          </td>

                          <td className="py-3 pr-3 font-sans uppercase text-white/70">
                            <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px]">
                              {u.plan}
                            </span>
                          </td>

                          <td className="py-3 pr-3 text-right">
                            <div className="text-white">{totalTokens.toLocaleString("pt-BR")}</div>
                            <div className="text-[10px] text-white/40">
                              {(u.tokensIn / 1000).toFixed(0)}k in /{" "}
                              {(u.tokensOut / 1000).toFixed(0)}k out
                            </div>
                          </td>

                          <td className="py-3 pr-3 text-right text-white">{u.ttsMinutes} min</td>

                          <td className="py-3 pr-3 text-right text-white font-sans">
                            {u.livesCount}
                          </td>

                          <td className="py-3 pr-3 text-right text-red-400 font-bold">
                            R$ {u.costBrl.toFixed(2)}
                          </td>

                          <td className="py-3 pr-3 text-right text-[#00E676]">
                            R$ {u.planPrice.toFixed(2)}
                          </td>

                          <td className="py-3 pr-3 text-right">
                            <div
                              className={`font-bold ${
                                u.netMarginBrl >= 0 ? "text-[#00E676]" : "text-red-400"
                              }`}
                            >
                              R$ {u.netMarginBrl.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-white/40">
                              {u.marginPct > 0
                                ? `+${u.marginPct.toFixed(0)}%`
                                : `${u.marginPct.toFixed(0)}%`}
                            </div>
                          </td>

                          <td className="py-3 pr-3 text-center font-sans">
                            {u.isBlocked ? (
                              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] border border-red-500/30">
                                Bloqueado
                              </span>
                            ) : u.isOverQuota ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] border border-amber-500/30">
                                Cota Excedida
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-[#00E676]/15 text-[#00E676] text-[10px]">
                                Normal
                              </span>
                            )}
                          </td>

                          <td className="py-3 text-right font-sans space-x-1.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                blockM.mutate({ userId: u.userId, blocked: !u.isBlocked })
                              }
                              disabled={blockM.isPending}
                              title={u.isBlocked ? "Desbloquear uso de IA" : "Bloquear uso de IA"}
                              className={`p-1.5 rounded transition ${
                                u.isBlocked
                                  ? "bg-[#00E676]/15 text-[#00E676] hover:bg-[#00E676]/25"
                                  : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                              }`}
                            >
                              {u.isBlocked ? (
                                <UserCheck className="w-3.5 h-3.5" />
                              ) : (
                                <UserX className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => resetM.mutate(u.userId)}
                              disabled={resetM.isPending}
                              title="Zerar contador de tokens e TTS do mês"
                              className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 2: SIMULADOR / PROFILER DE CUSTOS DE USUÁRIO */}
      {activeSubTab === "calculadora" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#7C3AED]" />
                Simulador de Custo do Usuário por Perfil de Uso
              </h2>
              <p className="text-xs text-white/50 mt-1">
                Calcule a margem de lucro exata por usuário com base no número de lives, prompts por
                live e minutos de narração por voz TTS.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <label className="flex flex-col text-white/70">
                Plano do Usuário
                <select
                  value={simPlan}
                  onChange={(e) => setSimPlan(e.target.value)}
                  className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-medium outline-none focus:border-[#7C3AED]"
                >
                  {PAID_PLAN_IDS.map((planId) => {
                    const plan = PITCHAI_PLANS.find((item) => item.priceId === planId)!;
                    return (
                      <option key={planId} value={planId}>
                        {plan.name} —{" "}
                        {PLAN_PRICES[planId].toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                        /mês equivalente
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="flex flex-col text-white/70">
                Frequência de Lives no Mês
                <div className="flex items-center gap-3 mt-1.5">
                  <input
                    type="range"
                    min={1}
                    max={60}
                    value={simLives}
                    onChange={(e) => setSimLives(Number(e.target.value))}
                    className="w-full accent-[#7C3AED]"
                  />
                  <span className="font-mono font-bold text-white text-sm w-12 text-right">
                    {simLives}x
                  </span>
                </div>
              </label>

              <label className="flex flex-col text-white/70">
                Duração Média por Live (minutos)
                <div className="flex items-center gap-3 mt-1.5">
                  <input
                    type="range"
                    min={15}
                    max={240}
                    step={15}
                    value={simDuration}
                    onChange={(e) => setSimDuration(Number(e.target.value))}
                    className="w-full accent-[#7C3AED]"
                  />
                  <span className="font-mono font-bold text-white text-sm w-12 text-right">
                    {simDuration}m
                  </span>
                </div>
              </label>

              <label className="flex flex-col text-white/70">
                Prompts de IA Gerados por Live
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={simPromptsPerLive}
                  onChange={(e) => setSimPromptsPerLive(Number(e.target.value) || 1)}
                  className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-mono outline-none focus:border-[#7C3AED]"
                />
              </label>

              <label className="flex flex-col text-white/70">
                Minutos de Narração TTS por Live
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={simTtsMinutesPerLive}
                  onChange={(e) => setSimTtsMinutesPerLive(Number(e.target.value) || 0)}
                  className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-mono outline-none focus:border-[#7C3AED]"
                />
              </label>

              <label className="flex flex-col text-white/70">
                Modelo de IA Utilizado
                <select
                  value={simModel}
                  onChange={(e) => setSimModel(e.target.value as any)}
                  className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-medium outline-none focus:border-[#7C3AED]"
                >
                  <option value="flash">Gemini 2.5 Flash (Ultrarrápido & Econômico)</option>
                  <option value="pro">Gemini 2.5 Pro (Raciocínio Avançado)</option>
                </select>
              </label>
            </div>

            {/* Resultado da Simulação */}
            <div className="pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/50 font-sans">Custo por Live</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  R$ {profilerCalc.costPerLiveBrl.toFixed(2)}
                </div>
                <div className="text-[10px] text-white/40 font-sans">
                  ~{(profilerCalc.totalTokensIn / simLives / 1000).toFixed(1)}k tokens/live
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/50 font-sans">Custo IA Total / Mês</div>
                <div className="text-lg font-bold text-red-400 mt-0.5">
                  R$ {profilerCalc.totalCostBrl.toFixed(2)}
                </div>
                <div className="text-[10px] text-white/40 font-sans">
                  USD ${profilerCalc.totalCostUsd.toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/50 font-sans">Lucro Líquido / Usuário</div>
                <div
                  className={`text-lg font-bold mt-0.5 ${
                    profilerCalc.netMarginBrl >= 0 ? "text-[#00E676]" : "text-red-400"
                  }`}
                >
                  R$ {profilerCalc.netMarginBrl.toFixed(2)}
                </div>
                <div className="text-[10px] text-white/40 font-sans">
                  Margem: {profilerCalc.marginPct.toFixed(1)}%
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[11px] text-white/50 font-sans">Ponto de Equilíbrio</div>
                <div className="text-lg font-bold text-amber-300 mt-0.5">
                  {profilerCalc.maxLivesBreakEven} lives/mês
                </div>
                <div className="text-[10px] text-white/40 font-sans">Limite antes do prejuízo</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 3: COTAS & LIMITES POR PLANO */}
      {activeSubTab === "cotas" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#7C3AED]" />
                Configuração de Cotas e Limites de Consumo de IA
              </h2>
              <p className="text-xs text-white/50 mt-1">
                Defina o teto máximo diário e mensal para evitar prejuízo em assinantes de alta
                demanda.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(quotas).map(([key, q]) => (
                <div
                  key={key}
                  className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="font-bold text-sm text-white">{q.planName}</span>
                    <span className="text-xs font-mono text-[#00E676]">
                      {PLAN_PRICES[key] ? `R$ ${PLAN_PRICES[key]}/mês` : "Gratuito"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <label className="flex flex-col text-white/60">
                      Limite Diário (Tokens)
                      <input
                        type="number"
                        step={5000}
                        value={q.dailyTokenLimit}
                        onChange={(e) =>
                          setQuotas({
                            ...quotas,
                            [key]: { ...q, dailyTokenLimit: Number(e.target.value) || 0 },
                          })
                        }
                        className="mt-1 rounded bg-black/60 border border-white/10 px-2.5 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
                      />
                    </label>

                    <label className="flex flex-col text-white/60">
                      Limite Mensal (Tokens)
                      <input
                        type="number"
                        step={50000}
                        value={q.monthlyTokenLimit}
                        onChange={(e) =>
                          setQuotas({
                            ...quotas,
                            [key]: { ...q, monthlyTokenLimit: Number(e.target.value) || 0 },
                          })
                        }
                        className="mt-1 rounded bg-black/60 border border-white/10 px-2.5 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
                      />
                    </label>

                    <label className="flex flex-col text-white/60">
                      Limite TTS (Minutos/Mês)
                      <input
                        type="number"
                        step={5}
                        value={q.ttsMinutesLimit}
                        onChange={(e) =>
                          setQuotas({
                            ...quotas,
                            [key]: { ...q, ttsMinutesLimit: Number(e.target.value) || 0 },
                          })
                        }
                        className="mt-1 rounded bg-black/60 border border-white/10 px-2.5 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
                      />
                    </label>

                    <label className="flex flex-col text-white/60">
                      Ação ao Estourar
                      <select
                        value={q.overLimitAction}
                        onChange={(e) =>
                          setQuotas({
                            ...quotas,
                            [key]: { ...q, overLimitAction: e.target.value as any },
                          })
                        }
                        className="mt-1 rounded bg-black/60 border border-white/10 px-2 py-1.5 text-white font-sans outline-none focus:border-[#7C3AED]"
                      >
                        <option value="block">Bloquear IA</option>
                        <option value="throttle">Filas de Espera</option>
                        <option value="alert">Enviar Apenas Alerta</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => saveQuotasM.mutate(quotas)}
                disabled={saveQuotasM.isPending}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white text-xs font-semibold shadow transition"
              >
                {saveQuotasM.isPending
                  ? "Salvando…"
                  : saveQuotasM.isSuccess
                    ? "Salvo! ✓"
                    : "Salvar Regras de Cotas"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-ABA 4: CORTESIA & ACESSO GRATUITO (MANTIDO E MELHORADO) */}
      {activeSubTab === "cortesia" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#7C3AED]" />
                Liberar Acesso Gratuito (Cortesia Admin)
              </h2>
              <p className="text-xs text-white/50 mt-1">
                Conceda plano Pro sem cobrança por um período determinado para parceiros ou testes
                de clientes.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_auto]">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@cliente.com"
                className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[#7C3AED]"
              />
              <input
                type="number"
                min={1}
                max={3650}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white font-mono outline-none focus:border-[#7C3AED]"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Motivo (opcional, ex: Parceiro TikTok)"
                className="rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[#7C3AED]"
              />
              <button
                type="button"
                disabled={!email || grantM.isPending}
                onClick={() => {
                  setMsg(null);
                  grantM.mutate();
                }}
                className="rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] px-4 py-2 text-xs font-semibold disabled:opacity-50 transition"
              >
                {grantM.isPending ? "Liberando…" : "Liberar Cortesia"}
              </button>
            </div>
            {msg && (
              <p className={`text-xs ${msg.kind === "ok" ? "text-[#00E676]" : "text-red-400"}`}>
                {msg.text}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <h2 className="font-semibold text-sm">Acessos Ativos por Cortesia</h2>
            {compedError && (
              <p className="text-xs text-red-400">
                {readableServerError(compedError, "Falha ao carregar as cortesias.")}
              </p>
            )}
            {compedLoading ? (
              <p className="text-xs text-white/50">Carregando acessos…</p>
            ) : compedItems.length === 0 ? (
              <p className="text-xs text-white/50">Nenhum acesso gratuito concedido ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-white/50 border-b border-white/10">
                    <tr>
                      <th className="py-2.5 pr-4">E-mail</th>
                      <th className="py-2.5 pr-4">Plano</th>
                      <th className="py-2.5 pr-4">Válido Até</th>
                      <th className="py-2.5 pr-4">Motivo / Observação</th>
                      <th className="py-2.5 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {compedItems.map((u: CompedAccess) => (
                      <tr key={u.userId}>
                        <td className="py-2.5 pr-4 font-sans text-white">{u.email}</td>
                        <td className="py-2.5 pr-4 uppercase text-[#00E676] font-bold">{u.plan}</td>
                        <td className="py-2.5 pr-4 text-white/70">
                          {u.grantedUntil
                            ? new Date(u.grantedUntil).toLocaleDateString("pt-BR")
                            : "Indeterminado"}
                        </td>
                        <td className="py-2.5 pr-4 text-white/60 font-sans">{u.note ?? "—"}</td>
                        <td className="py-2.5 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => revokeM.mutate(u.userId)}
                            className="text-red-400 hover:text-red-300 underline font-medium"
                          >
                            Revogar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

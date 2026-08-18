import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserX,
} from "lucide-react";
import { PITCHAI_PLANS } from "@/lib/live/plans";
import { resolvePlanQuota } from "@/lib/live/quotas";
import {
  calculateUserCost,
  DEFAULT_PLAN_QUOTAS,
  fetchCosts,
  fetchPlanQuotas,
  fetchUsersWithUsage,
  resetUserUsageAdmin,
  setUserBlocked,
  type Costs,
} from "@/lib/live/admin";
import { escapeCsvCell, readableServerError, PLAN_PRICES } from "./utils";

export function CustosTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [marginFilter, setMarginFilter] = useState<string>("all");

  const { data: costs } = useQuery({ queryKey: ["admin", "costs"], queryFn: fetchCosts });

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

  const {
    data: usersList = [],
    isLoading: usersLoading,
    error: usersError,
  } = useQuery({ queryKey: ["admin", "users-with-usage"], queryFn: fetchUsersWithUsage });

  const { data: quotas = DEFAULT_PLAN_QUOTAS } = useQuery({
    queryKey: ["admin", "plan-quotas"],
    queryFn: fetchPlanQuotas,
  });

  const blockM = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) =>
      setUserBlocked(userId, blocked),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users-with-usage"] }),
  });

  const resetM = useMutation({
    mutationFn: (userId: string) => resetUserUsageAdmin(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users-with-usage"] }),
  });

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
      const quota = resolvePlanQuota(u.plan, quotas);
      const isOverTokenQuota = u.tokensInput + u.tokensOutput >= quota.monthlyTokenLimit;
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

  const metrics = useMemo(() => {
    const totalCostBrl = enrichedUsers.reduce((s, u) => s + u.costBrl, 0);
    const totalRevenueBrl = enrichedUsers.reduce((s, u) => s + u.planPrice, 0);
    const deficitUsersCount = enrichedUsers.filter((u) => u.netMarginBrl < 0).length;
    const overQuotaCount = enrichedUsers.filter((u) => u.isOverQuota).length;

    return {
      totalCostBrl,
      totalRevenueBrl,
      netProfitBrl: totalRevenueBrl - totalCostBrl,
      deficitUsersCount,
      overQuotaCount,
    };
  }, [enrichedUsers]);

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

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Relatório e Auditoria de Custos por Usuário</h2>
            <p className="text-xs text-white/50">
              Acompanhe exatamente quanto cada usuário consome de tokens de Gemini, minutos de voz
              TTS e o resultado financeiro líquido.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 font-mono">
              {filteredUsers.length} de {usersList.length} usuários
            </span>
            <button
              type="button"
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-medium text-white transition"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV de Custos
            </button>
          </div>
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
                          {(u.tokensIn / 1000).toFixed(0)}k in / {(u.tokensOut / 1000).toFixed(0)}k
                          out
                        </div>
                      </td>

                      <td className="py-3 pr-3 text-right text-white">{u.ttsMinutes} min</td>

                      <td className="py-3 pr-3 text-right text-white font-sans">{u.livesCount}</td>

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
                          onClick={() => blockM.mutate({ userId: u.userId, blocked: !u.isBlocked })}
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
  );
}

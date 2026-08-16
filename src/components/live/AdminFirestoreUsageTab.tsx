import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  subscribeToUserUsageStats,
  testFirestoreConnection,
  type UserAiUsageStat,
} from "@/lib/live/firestore-usage";
import { fetchCosts, resetUserUsageAdmin } from "@/lib/live/admin";
import {
  Activity,
  Cpu,
  Database,
  Filter,
  Flame,
  Globe,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

export function AdminFirestoreUsageTab() {
  const [stats, setStats] = useState<UserAiUsageStat[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionAttempted, setConnectionAttempted] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: costs } = useQuery({ queryKey: ["admin", "costs"], queryFn: fetchCosts });
  const usdBrlRate = Number(costs?.usd_brl ?? 0);
  const estimatedCostUsd = useCallback(
    (item: UserAiUsageStat) =>
      (item.tokensInput / 1000) * Number(costs?.chat_per_1k_in ?? 0.0001) +
      (item.tokensOutput / 1000) * Number(costs?.chat_per_1k_out ?? 0.0004),
    [costs?.chat_per_1k_in, costs?.chat_per_1k_out],
  );
  const availableModels = useMemo(
    () => Array.from(new Set(stats.map((item) => item.activeModel))).sort(),
    [stats],
  );

  // Initialize Firestore listeners
  useEffect(() => {
    testFirestoreConnection().finally(() => setConnectionAttempted(true));

    // Subscribe to usage stats
    const unsubscribeStats = subscribeToUserUsageStats(
      (data) => {
        setIsConnected(true);
        setConnectionAttempted(true);
        setStats(data);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setIsConnected(false);
        setConnectionAttempted(true);
      },
    );

    return () => {
      unsubscribeStats();
    };
  }, []);

  // Filtered statistics
  const filteredStats = useMemo(() => {
    return stats.filter((u) => {
      const matchesSearch =
        u.userEmail.toLowerCase().includes(search.toLowerCase()) ||
        u.userId.toLowerCase().includes(search.toLowerCase());
      const matchesModel = modelFilter === "all" || u.activeModel === modelFilter;
      const matchesStatus = statusFilter === "all" || u.status === statusFilter;

      return matchesSearch && matchesModel && matchesStatus;
    });
  }, [stats, search, modelFilter, statusFilter]);

  // Calculated Aggregate Metrics
  const metrics = useMemo(() => {
    const totalUsers = stats.length;
    const totalTokensIn = stats.reduce((s, u) => s + (u.tokensInput || 0), 0);
    const totalTokensOut = stats.reduce((s, u) => s + (u.tokensOutput || 0), 0);
    const totalTokens = totalTokensIn + totalTokensOut;
    const totalApiCalls = stats.reduce((s, u) => s + (u.apiCallCount || 0), 0);
    const avgCallFrequency =
      totalUsers > 0
        ? Math.round(stats.reduce((s, u) => s + (u.callFrequencyPerMin || 0), 0) / totalUsers)
        : 0;

    const totalCostUsd = stats.reduce((sum, item) => sum + estimatedCostUsd(item), 0);
    const totalCostBrl = usdBrlRate > 0 ? totalCostUsd * usdBrlRate : null;

    const quotaAlerts = stats.filter(
      (u) => u.status === "quota_alert" || u.status === "throttled",
    ).length;

    return {
      totalUsers,
      totalTokensIn,
      totalTokensOut,
      totalTokens,
      totalApiCalls,
      avgCallFrequency,
      totalCostUsd,
      totalCostBrl,
      quotaAlerts,
    };
  }, [stats, usdBrlRate, estimatedCostUsd]);

  const handleResetUser = async (userId: string) => {
    if (!window.confirm("Zerar definitivamente as estatísticas deste usuário?")) return;
    setActionError(null);
    try {
      await resetUserUsageAdmin(userId);
    } catch (e) {
      console.error("Reset error:", e);
      setActionError(e instanceof Error ? e.message : "Falha ao zerar estatísticas.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Status Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#7C3AED]">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">
                Monitoramento de IA em Tempo Real (Firestore)
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                  isConnected
                    ? "bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30"
                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? "bg-[#00E676] animate-pulse" : "bg-red-500"
                  }`}
                />
                {isConnected
                  ? "Firestore conectado (onSnapshot)"
                  : connectionAttempted
                    ? "Falha na conexão"
                    : "Conectando…"}
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Estatísticas ao vivo de consumo de tokens Gemini e frequência de chamadas API por
              usuário.
            </p>
          </div>
        </div>

        <div className="text-xs text-white/45">Somente dados reais registrados pelo backend</div>
      </div>
      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200"
        >
          {actionError}
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Usuários Ativos</span>
            <Activity className="w-4 h-4 text-[#7C3AED]" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">{metrics.totalUsers}</div>
          <div className="text-[10px] text-white/40 mt-0.5">Monitorados no Firestore</div>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Total Chamadas API</span>
            <Globe className="w-4 h-4 text-[#00E676]" />
          </div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            {metrics.totalApiCalls.toLocaleString("pt-BR")}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            Média ~{metrics.avgCallFrequency} req/min
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Tokens Consumidos</span>
            <Cpu className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold font-mono text-sky-400 mt-1">
            {(metrics.totalTokens / 1000000).toFixed(2)}M
          </div>
          <div className="text-[10px] text-white/40 mt-0.5 font-mono">
            {(metrics.totalTokensIn / 1000).toFixed(0)}k in /{" "}
            {(metrics.totalTokensOut / 1000).toFixed(0)}k out
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Frequência Média</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-400 mt-1">
            {metrics.avgCallFrequency} req/min
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">Taxa de uso do sistema</div>
        </div>

        <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Custo Estimado IA</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold font-mono text-purple-300 mt-1">
            {metrics.totalCostBrl == null
              ? "Câmbio não configurado"
              : `R$ ${metrics.totalCostBrl.toFixed(2)}`}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5 font-mono">
            USD ${metrics.totalCostUsd.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário no Firestore…"
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-[#7C3AED]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto text-xs">
          <span className="text-white/40 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Filtros:
          </span>
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-white outline-none focus:border-[#7C3AED]"
          >
            <option value="all">Todos os Modelos</option>
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-white outline-none focus:border-[#7C3AED]"
          >
            <option value="all">Todos os Status</option>
            <option value="active">🟢 Ativo</option>
            <option value="quota_alert">⚠️ Alerta de Cota</option>
            <option value="throttled">🛑 Throttled / Limitado</option>
            <option value="blocked">⛔ Bloqueado</option>
          </select>
        </div>
      </div>

      {/* Real-Time User Usage Table */}
      <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.03] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-white">
              Estatísticas de Consumo de IA por Usuário (Real-time Firestore)
            </h3>
            <p className="text-xs text-white/50">
              Dados sincronizados em tempo real do Firestore (`/ai_usage_stats`).
            </p>
          </div>
          <span className="text-xs font-mono text-white/40">
            {filteredStats.length} registro(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-white/50 border-b border-white/10 font-medium">
                <th className="py-2.5 pr-3">Usuário / ID</th>
                <th className="py-2.5 pr-3 text-right">Frequência API</th>
                <th className="py-2.5 pr-3 text-right">Total Chamadas</th>
                <th className="py-2.5 pr-3 text-right">Tokens (Entrada / Saída)</th>
                <th className="py-2.5 pr-3 text-center">Modelo Ativo</th>
                <th className="py-2.5 pr-3 text-right">Custo USD (BRL)</th>
                <th className="py-2.5 pr-3 text-center">Status</th>
                <th className="py-2.5 text-right">Ações Live</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {filteredStats.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-white/40 font-sans">
                    Nenhum registro de uso encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredStats.map((u) => {
                  const inputRatio = u.totalTokens > 0 ? (u.tokensInput / u.totalTokens) * 100 : 50;
                  const itemCostUsd = estimatedCostUsd(u);

                  return (
                    <tr key={u.userId} className="hover:bg-white/[0.02] transition">
                      <td className="py-3 pr-3 font-sans">
                        <div className="font-medium text-white">{u.userEmail}</div>
                        <div className="text-[10px] font-mono text-white/40 mt-0.5">
                          ID: {u.userId}
                        </div>
                      </td>

                      <td className="py-3 pr-3 text-right">
                        <div className="flex items-center justify-end gap-1 font-bold text-amber-400">
                          <Flame className="w-3 h-3" />
                          {u.callFrequencyPerMin} req/min
                        </div>
                        <div className="text-[10px] text-white/40 font-sans">
                          Última: {new Date(u.lastApiCallAt).toLocaleTimeString("pt-BR")}
                        </div>
                      </td>

                      <td className="py-3 pr-3 text-right text-white font-sans font-medium">
                        {u.apiCallCount.toLocaleString("pt-BR")}
                      </td>

                      <td className="py-3 pr-3 text-right">
                        <div className="text-sky-300 font-bold">
                          {u.totalTokens.toLocaleString("pt-BR")}
                        </div>
                        <div className="w-24 ml-auto h-1.5 rounded-full bg-white/10 overflow-hidden my-1 flex">
                          <div className="bg-sky-400 h-full" style={{ width: `${inputRatio}%` }} />
                          <div
                            className="bg-purple-400 h-full"
                            style={{ width: `${100 - inputRatio}%` }}
                          />
                        </div>
                        <div className="text-[9px] text-white/40">
                          {(u.tokensInput / 1000).toFixed(0)}k in /{" "}
                          {(u.tokensOutput / 1000).toFixed(0)}k out
                        </div>
                      </td>

                      <td className="py-3 pr-3 text-center font-sans">
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-white/80">
                          {u.activeModel}
                        </span>
                      </td>

                      <td className="py-3 pr-3 text-right">
                        <div className="text-purple-300 font-bold">${itemCostUsd.toFixed(3)}</div>
                        <div className="text-[10px] text-white/40">
                          {usdBrlRate > 0 ? `R$ ${(itemCostUsd * usdBrlRate).toFixed(2)}` : "—"}
                        </div>
                      </td>

                      <td className="py-3 pr-3 text-center font-sans">
                        {u.status === "active" && (
                          <span className="px-2 py-0.5 rounded bg-[#00E676]/15 text-[#00E676] text-[10px] border border-[#00E676]/30">
                            Ativo
                          </span>
                        )}
                        {u.status === "quota_alert" && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] border border-amber-500/30">
                            Alerta Cota
                          </span>
                        )}
                        {u.status === "throttled" && (
                          <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 text-[10px] border border-orange-500/30">
                            Throttled
                          </span>
                        )}
                        {u.status === "blocked" && (
                          <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 text-[10px] border border-red-500/30">
                            Bloqueado
                          </span>
                        )}
                      </td>

                      <td className="py-3 text-right font-sans space-x-1 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleResetUser(u.userId)}
                          title="Zerar estatísticas no Firestore"
                          className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition"
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

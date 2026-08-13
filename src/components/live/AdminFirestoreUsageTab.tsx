import { useEffect, useMemo, useRef, useState } from "react";
import {
  recordAiUsageForUserInFirestore,
  resetUserUsageStatsInFirestore,
  seedSampleUsageDataInFirestore,
  subscribeToRecentApiLogs,
  subscribeToUserUsageStats,
  testFirestoreConnection,
  type AiApiLog,
  type UserAiUsageStat,
} from "@/lib/live/firestore-usage";
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
  Zap,
} from "lucide-react";

const USD_BRL_RATE = 5.6;

export function AdminFirestoreUsageTab() {
  const [stats, setStats] = useState<UserAiUsageStat[]>([]);
  const [logs, setLogs] = useState<AiApiLog[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedCount, setSimulatedCount] = useState(0);
  const hasSeededRef = useRef(false);

  // Initialize Firestore listeners
  useEffect(() => {
    testFirestoreConnection();

    // Subscribe to usage stats
    const unsubscribeStats = subscribeToUserUsageStats(
      (data) => {
        setIsConnected(true);
        setStats(data);
        // Seed initial sample data only once if the collection is completely empty,
        // otherwise this callback re-fires after seeding and loops forever.
        if (data.length === 0 && !hasSeededRef.current) {
          hasSeededRef.current = true;
          seedSampleUsageDataInFirestore();
        } else if (data.length > 0) {
          hasSeededRef.current = true;
        }
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setIsConnected(false);
      },
    );

    // Subscribe to live logs feed
    const unsubscribeLogs = subscribeToRecentApiLogs(
      (logsData) => {
        setLogs(logsData);
      },
      (err) => console.error("Firestore logs error:", err),
      15,
    );

    return () => {
      unsubscribeStats();
      unsubscribeLogs();
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

    const totalCostUsd = stats.reduce((s, u) => s + (u.costEstimateUsd || 0), 0);
    const totalCostBrl = totalCostUsd * USD_BRL_RATE;

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
  }, [stats]);

  // Trigger real-time simulation call to Firestore
  const handleSimulateCall = async (targetUserId?: string, targetEmail?: string) => {
    setIsSimulating(true);
    try {
      const selectedUserId = targetUserId || "usr_carla_vendas";
      const selectedEmail = targetEmail || "carla.vendas@gmail.com";

      const endpoints = ["/api/live/chat", "/api/live/script", "/api/live/tts", "/api/live/preset"];
      const models = ["gemini-2.5-flash", "gemini-2.5-pro"];

      const chosenEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const chosenModel = models[Math.floor(Math.random() * models.length)];

      const promptTokens = Math.floor(Math.random() * 2500) + 800;
      const completionTokens = Math.floor(Math.random() * 800) + 200;

      await recordAiUsageForUserInFirestore(
        selectedUserId,
        selectedEmail,
        promptTokens,
        completionTokens,
        chosenModel,
        chosenEndpoint,
      );

      setSimulatedCount((prev) => prev + 1);
    } catch (e) {
      console.error("Simulation error:", e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetUser = async (userId: string) => {
    try {
      await resetUserUsageStatsInFirestore(userId);
    } catch (e) {
      console.error("Reset error:", e);
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
                {isConnected ? "Firestore Live Stream (onSnapshot)" : "Reconectando..."}
              </span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">
              Estatísticas ao vivo de consumo de tokens Gemini e frequência de chamadas API por
              usuário.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleSimulateCall()}
            disabled={isSimulating}
            className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-semibold shadow-lg transition disabled:opacity-50 w-full sm:w-auto"
          >
            <Zap className={`w-3.5 h-3.5 ${isSimulating ? "animate-spin" : ""}`} />
            {isSimulating ? "Registrando Chamada..." : "Simular Chamada IA Live"}
          </button>

          <button
            type="button"
            onClick={() => seedSampleUsageDataInFirestore()}
            title="Recarregar dados de exemplo no Firestore"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

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
            R$ {metrics.totalCostBrl.toFixed(2)}
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
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
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
                        <div className="text-purple-300 font-bold">
                          ${u.costEstimateUsd.toFixed(3)}
                        </div>
                        <div className="text-[10px] text-white/40">
                          R$ {(u.costEstimateUsd * USD_BRL_RATE).toFixed(2)}
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
                          onClick={() => handleSimulateCall(u.userId, u.userEmail)}
                          title="Simular chamada de IA para este usuário"
                          className="px-2 py-1 rounded bg-[#7C3AED]/20 hover:bg-[#7C3AED]/40 text-[#7C3AED] hover:text-white text-[11px] font-medium transition"
                        >
                          +1 Req
                        </button>
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

      {/* Real-time Stream Log Feed */}
      <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.03] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00E676]" />
            <h3 className="font-semibold text-sm text-white">
              Feed de Execução de Chamadas de IA em Tempo Real (`ai_api_logs`)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-white/40">
            Sincronização instantânea Firestore
          </span>
        </div>

        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
          {logs.length === 0 ? (
            <div className="p-4 text-center text-xs text-white/40">
              Nenhuma chamada gravada nos logs recentes do Firestore. Clique em "Simular Chamada IA
              Live" acima para testar.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id || `${log.userId}-${log.timestamp}`}
                className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 font-mono hover:bg-white/[0.02] transition"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-[#00E676]" />
                  <div>
                    <span className="text-white font-medium">{log.userEmail}</span>
                    <span className="text-white/40 ml-2 font-sans text-[11px]">{log.endpoint}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-white/60">
                  <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/80">
                    {log.model}
                  </span>
                  <span className="text-sky-300">
                    {log.promptTokens + log.completionTokens} tokens
                  </span>
                  <span className="text-amber-400">{log.latencyMs}ms</span>
                  <span className="text-white/40 text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

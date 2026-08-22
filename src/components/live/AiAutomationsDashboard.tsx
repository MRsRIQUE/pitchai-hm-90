import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Lightbulb,
  MessageSquare,
  MousePointerClick,
  RefreshCw,
  ShoppingBag,
  Target,
  Users,
  WalletCards,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listMySessions, type LiveSessionRow } from "@/lib/live/sync";
import { analyzeLivePerformance } from "@/lib/live/performance-analysis";

type Timeframe = "live" | "today" | "24h" | "7d";

function thresholdFor(timeframe: Timeframe) {
  const now = new Date();
  if (timeframe === "today")
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timeframe === "24h") return now.getTime() - 86_400_000;
  if (timeframe === "7d") return now.getTime() - 7 * 86_400_000;
  return 0;
}

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const shown = (value?: string) => (value?.trim() ? value : "—");
const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);
const brl = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const duration = (seconds: number | null) => {
  if (seconds === null) return "—";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes ? `${minutes}min ${rest}s` : `${rest}s`;
};

export function AiAutomationsDashboard() {
  const [timeframe, setTimeframe] = useState<Timeframe>("live");
  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setSessions(await listMySessions(100));
      setError("");
    } catch {
      setError("Não foi possível sincronizar os dados agora.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Sessões antigas de demonstração não tinham telemetria da página. Exigi-la
  // evita misturar simulações históricas com dados confirmados do TikTok.
  const verifiedSessions = useMemo(
    () => sessions.filter((row) => Boolean(row.live_metrics?.captured_at)),
    [sessions],
  );

  const selected = useMemo(() => {
    if (timeframe === "live") return verifiedSessions.length ? [verifiedSessions[0]] : [];
    const threshold = thresholdFor(timeframe);
    return verifiedSessions.filter((row) => Date.parse(row.started_at) >= threshold);
  }, [verifiedSessions, timeframe]);

  const metrics = selected[0]?.live_metrics;
  const analysis = useMemo(() => analyzeLivePerformance(selected), [selected]);
  const active = Boolean(verifiedSessions[0] && !verifiedSessions[0].ended_at);
  const capturedAt = metrics?.captured_at ? new Date(metrics.captured_at) : null;

  const activity = useMemo(
    () =>
      selected
        .flatMap((row) => [
          ...asArray(row.sales_snapshot).map((sale, index) => ({
            id: `${row.id}-sale-${index}`,
            at: sale?.at || row.started_at,
            title: "Pedido detectado",
            text: String(sale?.text || "Pedido identificado na LIVE"),
          })),
          ...asArray(row.products_pitched).map((product, index) => ({
            id: `${row.id}-product-${index}`,
            at: product?.at || row.started_at,
            title: "Produto apresentado",
            text: String(product?.name || "Produto sem nome"),
          })),
        ])
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, 12),
    [selected],
  );

  const cards = [
    { label: "GMV confirmado", value: brl(analysis.gmv), icon: WalletCards },
    {
      label: timeframe === "live" ? "Espectadores atuais" : "Pico de espectadores",
      value: analysis.viewersPeak === null ? "—" : String(Math.round(analysis.viewersPeak)),
      icon: Users,
    },
    {
      label: "Pedidos detectados",
      value: selected.length ? String(analysis.orders) : "—",
      icon: ShoppingBag,
    },
    {
      label: "Mensagens respondidas",
      value: selected.length ? String(analysis.answered) : "—",
      icon: MessageSquare,
    },
  ];

  return (
    <div className="my-4 space-y-5">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-bold">Dados reais da LIVE</h2>
            <Badge
              variant="outline"
              className={
                active ? "border-emerald-500/30 text-emerald-400" : "text-muted-foreground"
              }
            >
              {active ? "Sincronizando" : "Sem LIVE ativa"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Valores lidos diretamente do Gerenciador de LIVE. Dados não detectados aparecem como
            “—”.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/80 bg-card/80 p-1 text-xs">
            {(["live", "today", "24h", "7d"] as Timeframe[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTimeframe(item)}
                className={`rounded-md px-2.5 py-1 font-medium ${timeframe === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {{ live: "Esta Live", today: "Hoje", "24h": "24 horas", "7d": "7 dias" }[item]}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="desktop-card-grid">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{label}</span>
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 font-display text-2xl font-bold">{loading ? "…" : value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> Diagnóstico da operação
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Indicadores calculados apenas quando existe base real suficiente.
              </p>
            </div>
            <Badge variant="outline">{analysis.dataCoverage}% dos dados</Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <Metric
              label="Conversão clique → pedido"
              value={pct(analysis.conversionRate)}
              icon={Target}
            />
            <Metric
              label="Cliques por espectador"
              value={pct(analysis.clickRate)}
              icon={MousePointerClick}
            />
            <Metric
              label="Cobertura do chat"
              value={pct(analysis.responseRate)}
              icon={MessageSquare}
            />
            <Metric
              label="Duração média assistida"
              value={duration(analysis.avgWatchSeconds)}
              icon={Clock3}
            />
            <Metric label="Ticket médio" value={brl(analysis.averageTicket)} icon={WalletCards} />
            <Metric
              label="Vendas por hora"
              value={analysis.salesPerHour === null ? "—" : analysis.salesPerHour.toFixed(1)}
              icon={ShoppingBag}
            />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-amber-400" /> Recomendações para a próxima ação
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Priorizadas pelas métricas e eventos confirmados deste período.
              </p>
            </div>
            <Badge variant="outline">{analysis.recommendations.length} análise(s)</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {analysis.recommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                className="rounded-lg border border-border/60 bg-background/30 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {recommendation.priority === "alta" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  ) : (
                    <Target className="h-3.5 w-3.5 text-primary" />
                  )}
                  <strong className="text-xs">{recommendation.title}</strong>
                  <Badge variant="secondary" className="text-[9px] uppercase">
                    {recommendation.priority}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{recommendation.detail}</p>
                <p className="mt-1.5 text-[10px] text-muted-foreground/80">
                  Base: {recommendation.evidence}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <Card className="p-4">
          <h3 className="text-sm font-semibold">Leitura do Gerenciador</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <span className="block text-muted-foreground">Itens vendidos</span>
              <strong>{shown(metrics?.items_sold)}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Duração média</span>
              <strong>{shown(metrics?.avg_watch)}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Cliques no produto</span>
              <strong>{shown(metrics?.product_clicks)}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Visitantes</span>
              <strong>{shown(metrics?.visitor_percent)}</strong>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs sm:grid-cols-4">
            <div>
              <span className="block text-muted-foreground">Entradas percebidas</span>
              <strong>{analysis.audienceJoins || "—"}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Novos follows</span>
              <strong>{analysis.audienceFollows || "—"}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Mensagens recebidas</span>
              <strong>{analysis.messagesReceived || "—"}</strong>
            </div>
            <div>
              <span className="block text-muted-foreground">Pitches falados</span>
              <strong>{analysis.pitchesSpoken || "—"}</strong>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            {capturedAt
              ? `Última leitura: ${capturedAt.toLocaleString("pt-BR")}`
              : "A extensão ainda não enviou uma leitura desta LIVE."}
          </p>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold">Atividade confirmada</h3>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {!activity.length && (
              <p className="text-xs text-muted-foreground">
                Nenhum pedido ou produto confirmado neste período.
              </p>
            )}
            {activity.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/60 p-2 text-xs">
                <div className="flex justify-between gap-2">
                  <strong>{item.title}</strong>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" /> {label}
      </span>
      <strong className="mt-1 block font-display text-lg">{value}</strong>
    </div>
  );
}

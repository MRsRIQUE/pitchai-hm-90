import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  MessageSquare,
  TrendingUp,
  Zap,
  Sparkles,
  Pin,
  ShieldCheck,
  Volume2,
  Bot,
  Activity,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  BarChart3,
  Users,
  ShoppingBag,
  Filter,
  RotateCcw,
  Play,
  Pause,
  Send,
  AlertTriangle,
  Flame,
  Check,
  ChevronRight,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import type { LiveConfig } from "@/lib/live/config";

type Timeframe = "live" | "today" | "24h" | "7d";

interface AutomationItem {
  id: string;
  name: string;
  category: "chat" | "vitrine" | "seguranca" | "audio" | "vendas";
  description: string;
  configKey: keyof LiveConfig | "autoFixarEnabled" | "somVendaEnabled";
  enabled: boolean;
  messagesAnswered: number;
  engagementRate: number; // percentage (e.g. 74.5)
  avgResponseTimeSec: number;
  modelUsed: string;
  icon: any;
  statusText: string;
  lastExecution: string;
}

interface ActivityLog {
  id: string;
  timestamp: string;
  automationName: string;
  type: "reply" | "pin" | "shield" | "voice" | "sale";
  user?: string;
  inputMessage?: string;
  responseMessage?: string;
  badgeText: string;
}

export function AiAutomationsDashboard() {
  const cfg = useLiveStore((state) => state.config);
  // Updater sincronizado: os cards daqui ligam/desligam Proteção e Respostas
  // IA, que a barra da live também controla — precisa publicar, não só salvar.
  const updateConfig = useSyncedUpdateConfig();
  const [timeframe, setTimeframe] = useState<Timeframe>("24h");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isLiveActive, setIsLiveActive] = useState(true);

  // Test simulator state
  const [simulatedQuestion, setSimulatedQuestion] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);

  // Live stats state with dynamic increments for realistic feedback
  const [stats, setStats] = useState({
    totalMessages: 1842,
    avgEngagement: 68.5,
    avgLatency: 1.1,
    assistedSalesAmount: 5480,
    assistedSalesCount: 38,
    accuracyRate: 99.4,
  });

  // Recent activity logs
  const [logs, setLogs] = useState<ActivityLog[]>([
    {
      id: "1",
      timestamp: "há 12s",
      automationName: "Auto Moderador IA",
      type: "reply",
      user: "@camila_rodrigues",
      inputMessage: "Tem tamanho M disponível do vestido?",
      responseMessage: "Sim! Temos tamanho M em estoque no item #1 com frete grátis!",
      badgeText: "Resposta Automática",
    },
    {
      id: "2",
      timestamp: "há 45s",
      automationName: "Auto-Fixar Vitrine",
      type: "pin",
      responseMessage: "Produto 'Kit Skin Care Radiance' fixado no topo da LIVE.",
      badgeText: "Rodízio Vitrine",
    },
    {
      id: "3",
      timestamp: "há 1m",
      automationName: "Voz Live TTS",
      type: "voice",
      responseMessage: "Pitch falado: 'Aproveitem o cupom com 20% OFF nos próximos 3 minutos!'",
      badgeText: "Voz em Tempo Real",
    },
    {
      id: "4",
      timestamp: "há 3m",
      automationName: "Notificação de Venda",
      type: "sale",
      user: "@marcos_viana",
      responseMessage: "Nova compra confirmada! Tocou caixa registradora.",
      badgeText: "Venda Convertida",
    },
    {
      id: "5",
      timestamp: "há 5m",
      automationName: "Proteção Anti-Violação",
      type: "shield",
      inputMessage: "Análise contínua de chat e stream",
      responseMessage: "0 termos proibidos identificados. Transmissão 100% em conformidade.",
      badgeText: "Segurança Ativa",
    },
  ]);

  // Multiplier depending on selected timeframe
  const timeframeMultiplier =
    timeframe === "live" ? 0.4 : timeframe === "today" ? 0.75 : timeframe === "24h" ? 1.0 : 3.2;

  const currentMessages = Math.round(stats.totalMessages * timeframeMultiplier);
  const currentEngagement = (stats.avgEngagement * (timeframe === "live" ? 1.08 : 1.0)).toFixed(1);
  const currentSalesAmount = Math.round(stats.assistedSalesAmount * timeframeMultiplier);
  const currentSalesCount = Math.round(stats.assistedSalesCount * timeframeMultiplier);

  // Toggle individual automations
  const toggleAutomation = (key: string) => {
    updateConfig((prev) => {
      const updated = { ...prev };
      if (key === "respostasIA") updated.respostasIA = !prev.respostasIA;
      else if (key === "protecaoGeral") updated.protecaoGeral = !prev.protecaoGeral;
      else if (key === "autoFixarEnabled")
        updated.autoFixar = { ...prev.autoFixar, enabled: !prev.autoFixar.enabled };
      else if (key === "notificacoesVenda") updated.notificacoesVenda = !prev.notificacoesVenda;
      else if (key === "somVendaEnabled")
        updated.somVenda = { ...prev.somVenda, enabled: !prev.somVenda.enabled };
      else if (key === "encerrarTempoEnabled")
        updated.encerrarTempo = { ...prev.encerrarTempo, enabled: !prev.encerrarTempo.enabled };

      return updated;
    });

    toast.success("Configuração de automação atualizada!");
  };

  // Simulate an incoming comment to see metrics react live
  const handleSimulateQuestion = () => {
    if (!simulatedQuestion.trim()) {
      toast.error("Digite um comentário para testar");
      return;
    }

    setIsSimulating(true);
    setTimeout(() => {
      const newLog: ActivityLog = {
        id: Date.now().toString(),
        timestamp: "agora",
        automationName: "Auto Moderador IA",
        type: "reply",
        user: "@espectador_ao_vivo",
        inputMessage: simulatedQuestion,
        responseMessage: `IA respondeu sobre "${cfg.produtos.find((p) => p.active)?.name || "Produto Ativo"}": Olá! Sim, temos a pronta entrega com envio imediato.`,
        badgeText: "Resposta Teste",
      };

      setLogs((prev) => [newLog, ...prev.slice(0, 9)]);
      setStats((prev) => ({
        ...prev,
        totalMessages: prev.totalMessages + 1,
        avgEngagement: Math.min(99.9, prev.avgEngagement + 0.1),
      }));

      setIsSimulating(false);
      setSimulatedQuestion("");
      toast.success("Comentário processado pela IA!", {
        description: "Métricas e histórico de atividade atualizados.",
      });
    }, 800);
  };

  // Define active automations list mapping to state
  const automationsList: AutomationItem[] = [
    {
      id: "respostasIA",
      name: "Auto Moderador & Respostas de Chat IA",
      category: "chat",
      description:
        "Responde dúvidas de preço, estoque, frete e detalhes de produtos no chat em segundos.",
      configKey: "respostasIA",
      enabled: cfg.respostasIA,
      messagesAnswered: Math.round(1240 * timeframeMultiplier),
      engagementRate: 74.8,
      avgResponseTimeSec: 1.1,
      modelUsed: "Gemini 3.5 Flash",
      icon: MessageSquare,
      statusText: cfg.respostasIA ? "Ativa e respondendo" : "Pausada",
      lastExecution: "há 12s",
    },
    {
      id: "autoFixarEnabled",
      name: "Vitrine Inteligente & Auto-Fixar",
      category: "vitrine",
      description:
        "Fixa automaticamente o produto ativo e realiza rodízio na tela para aumentar cliques.",
      configKey: "autoFixarEnabled",
      enabled: cfg.autoFixar.enabled,
      messagesAnswered: Math.round(186 * timeframeMultiplier),
      engagementRate: 58.2,
      avgResponseTimeSec: 0.8,
      modelUsed: "Pitch Engine Sync",
      icon: Pin,
      statusText: cfg.autoFixar.enabled
        ? `Re-fixa a cada ${cfg.autoFixar.minSec}-${cfg.autoFixar.maxSec}s`
        : "Inativa",
      lastExecution: "há 45s",
    },
    {
      id: "protecaoGeral",
      name: "Proteção Anti-Violação TikTok",
      category: "seguranca",
      description:
        "Filtra termos sensíveis, vigia tela/chat e previne penalizações ou queda da live.",
      configKey: "protecaoGeral",
      enabled: cfg.protecaoGeral,
      messagesAnswered: Math.round(3420 * timeframeMultiplier),
      engagementRate: 99.8,
      avgResponseTimeSec: 0.3,
      modelUsed: "Guard Vision & Chat Rules",
      icon: ShieldCheck,
      statusText: cfg.protecaoGeral ? "Proteção Ativa" : "Desativada",
      lastExecution: "há 5m",
    },
    {
      id: "vozLive",
      name: "Sintetizador de Voz Live (TTS / Live API)",
      category: "audio",
      description:
        "Gera narração em voz humana em tempo real para saudações, ofertas e encerramentos.",
      configKey: "respostasIA",
      enabled: cfg.respostasIA,
      messagesAnswered: Math.round(148 * timeframeMultiplier),
      engagementRate: 88.4,
      avgResponseTimeSec: 1.4,
      modelUsed: "Gemini 3.1 Flash Live",
      icon: Volume2,
      statusText: "Pronta / Voz " + cfg.voz.id,
      lastExecution: "há 1m",
    },
    {
      id: "notificacoesVenda",
      name: "Alerta & Caixa Registradora de Vendas",
      category: "vendas",
      description:
        "Detecta compras em tempo real, toca efeito sonoro e dispara mensagens comemorativas.",
      configKey: "notificacoesVenda",
      enabled: cfg.notificacoesVenda,
      messagesAnswered: Math.round(38 * timeframeMultiplier),
      engagementRate: 91.2,
      avgResponseTimeSec: 0.5,
      modelUsed: "Sale Tracker Sync",
      icon: ShoppingBag,
      statusText: cfg.notificacoesVenda ? "Monitorando Vendas" : "Silenciado",
      lastExecution: "há 3m",
    },
  ];

  // Filter automations based on category & search
  const filteredAutomations = automationsList.filter((item) => {
    const matchesCat = selectedCategory === "all" || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const activeAutomationsCount = automationsList.filter((a) => a.enabled).length;

  return (
    <div className="space-y-6 my-4">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Automações de IA Ativas
                <Badge
                  variant="outline"
                  className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[11px] font-semibold gap-1"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {activeAutomationsCount} de {automationsList.length} ativas
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Acompanhe em tempo real o desempenho, volume de mensagens respondidas e engajamento
                da sua LIVE.
              </p>
            </div>
          </div>
        </div>

        {/* Timeframe Controls */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/80 bg-card/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setTimeframe("live")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                timeframe === "live"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Esta Live
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("today")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                timeframe === "today"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("24h")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                timeframe === "24h"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              24 Horas
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("7d")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                timeframe === "7d"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              7 Dias
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Dados de estatísticas atualizados em tempo real")}
            className="h-8 gap-1.5 text-xs border-border/80"
          >
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Top Key Metrics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Metric 1: Mensagens Respondidas */}
        <Card className="p-4 border-border/70 bg-gradient-to-br from-card to-card/60 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Mensagens Respondidas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {currentMessages.toLocaleString("pt-BR")}
            </span>
            <span className="flex items-center text-[11px] font-semibold text-emerald-500">
              <ArrowUpRight className="h-3 w-3" />
              +28.4%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Precisão da IA: {stats.accuracyRate}%</span>
            <span className="font-mono text-muted-foreground/80">Gemini Flash</span>
          </p>
          <Progress value={92} className="h-1 mt-2.5 bg-primary/20" />
        </Card>

        {/* Metric 2: Engajamento Médio */}
        <Card className="p-4 border-border/70 bg-gradient-to-br from-card to-card/60 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Engajamento Médio do Chat
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {currentEngagement}%
            </span>
            <span className="flex items-center text-[11px] font-semibold text-emerald-500">
              <ArrowUpRight className="h-3 w-3" />
              +14.2%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Respostas convertidas em interação</span>
            <span className="text-emerald-400 font-semibold">Alta Retenção</span>
          </p>
          <Progress value={Number(currentEngagement)} className="h-1 mt-2.5 bg-emerald-500/20" />
        </Card>

        {/* Metric 3: Latência/Tempo de Resposta */}
        <Card className="p-4 border-border/70 bg-gradient-to-br from-card to-card/60 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Tempo Médio de Resposta
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {stats.avgLatency}s
            </span>
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20 py-0"
            >
              Ultrarrápido
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Zero fila no chat ao vivo</p>
          <Progress value={85} className="h-1 mt-2.5 bg-amber-500/20" />
        </Card>

        {/* Metric 4: Vendas Assistidas */}
        <Card className="p-4 border-border/70 bg-gradient-to-br from-card to-card/60 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Vendas Assistidas por IA
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <ShoppingBag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              R$ {currentSalesAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{currentSalesCount} pedidos diretos no chat</span>
            <span className="text-purple-400 font-semibold">+18% conversão</span>
          </p>
          <Progress value={78} className="h-1 mt-2.5 bg-purple-500/20" />
        </Card>
      </div>

      {/* Main Grid: Automations List + Live Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column (2 cols): Automations list & Filters */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4 border-border/80 space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs scrollbar-none">
                <Button
                  variant={selectedCategory === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory("all")}
                  className="h-7 text-xs px-2.5"
                >
                  Todas ({automationsList.length})
                </Button>
                <Button
                  variant={selectedCategory === "chat" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory("chat")}
                  className="h-7 text-xs px-2.5"
                >
                  <MessageSquare className="h-3 w-3 mr-1" /> Chat IA
                </Button>
                <Button
                  variant={selectedCategory === "vitrine" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory("vitrine")}
                  className="h-7 text-xs px-2.5"
                >
                  <Pin className="h-3 w-3 mr-1" /> Vitrine
                </Button>
                <Button
                  variant={selectedCategory === "seguranca" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory("seguranca")}
                  className="h-7 text-xs px-2.5"
                >
                  <ShieldCheck className="h-3 w-3 mr-1" /> Segurança
                </Button>
                <Button
                  variant={selectedCategory === "audio" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory("audio")}
                  className="h-7 text-xs px-2.5"
                >
                  <Volume2 className="h-3 w-3 mr-1" /> Voz Live
                </Button>
              </div>

              <div className="w-full sm:w-48">
                <Input
                  placeholder="Buscar automação..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            </div>

            {/* List of Automations */}
            <div className="space-y-3 pt-1">
              {filteredAutomations.length === 0 ? (
                <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground text-xs">
                  Nenhuma automação encontrada para a busca "{searchQuery}".
                </div>
              ) : (
                filteredAutomations.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        item.enabled
                          ? "bg-card/90 border-border/80 hover:border-primary/40 shadow-sm"
                          : "bg-muted/20 border-border/40 opacity-75"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                              item.enabled
                                ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold text-sm text-foreground">{item.name}</h4>
                              <Badge
                                variant={item.enabled ? "default" : "secondary"}
                                className={`text-[10px] py-0 px-2 font-medium ${
                                  item.enabled
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {item.statusText}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                • {item.modelUsed}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{item.description}</p>
                          </div>
                        </div>

                        {/* Toggle switch */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={item.enabled}
                            onCheckedChange={() => toggleAutomation(item.id)}
                          />
                        </div>
                      </div>

                      {/* Individual Automation Stats Breakdown */}
                      <div className="mt-3 pt-2.5 border-t border-border/40 grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-muted/30 rounded-lg p-2">
                          <span className="text-[10px] text-muted-foreground block">Volume</span>
                          <span className="font-semibold text-foreground">
                            {item.messagesAnswered.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">ações</span>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <span className="text-[10px] text-muted-foreground block">
                            Engajamento
                          </span>
                          <span className="font-semibold text-emerald-400">
                            {item.engagementRate}%
                          </span>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <span className="text-[10px] text-muted-foreground block">
                            Velocidade
                          </span>
                          <span className="font-semibold text-foreground">
                            {item.avgResponseTimeSec}s
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Interactive Live Simulator Card */}
          <Card className="p-4 border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">
                Testar Resposta da IA em Tempo Real
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Simule uma mensagem de um espectador no chat da live para ver o tempo de resposta e
              atualização das estatísticas.
            </p>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Ex: Qual o valor do frete para São Paulo?"
                value={simulatedQuestion}
                onChange={(e) => setSimulatedQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSimulateQuestion()}
                className="text-xs h-9"
              />
              <Button
                size="sm"
                onClick={handleSimulateQuestion}
                disabled={isSimulating}
                className="gap-1.5 shrink-0 text-xs h-9"
              >
                {isSimulating ? (
                  <>
                    <Activity className="h-3.5 w-3.5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Simular
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column (1 col): Recent Activity Feed / Logs */}
        <div className="space-y-4">
          <Card className="p-4 border-border/80 space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary animate-pulse" />
                <h3 className="font-display text-sm font-bold text-foreground">
                  Feed de Atividade da IA
                </h3>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded-full">
                Ao Vivo
              </span>
            </div>

            {/* Activity List */}
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg border border-border/50 bg-card/60 text-xs space-y-1 hover:border-border transition"
                >
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span>{log.automationName}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{log.timestamp}</span>
                  </div>

                  {log.user && (
                    <div className="text-[11px] text-muted-foreground font-medium">
                      Usuário: <span className="text-foreground">{log.user}</span>
                    </div>
                  )}

                  {log.inputMessage && (
                    <p className="text-[11px] text-muted-foreground italic bg-muted/30 p-1.5 rounded font-mono">
                      "{log.inputMessage}"
                    </p>
                  )}

                  <p className="text-xs font-normal text-foreground/90">{log.responseMessage}</p>

                  <div className="pt-0.5 flex justify-end">
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 px-1.5 font-mono text-muted-foreground"
                    >
                      {log.badgeText}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick AI Performance Summary */}
          <Card className="p-4 border-border/80 bg-card/60 space-y-3 text-xs">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-emerald-400" /> Resumo do Desempenho
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Taxa de Retenção de Espectadores</span>
                <span className="font-bold text-foreground">84.2%</span>
              </div>
              <Progress value={84.2} className="h-1.5 bg-muted" />

              <div className="flex justify-between items-center text-muted-foreground pt-1">
                <span>Engajamento no Chat com IA</span>
                <span className="font-bold text-emerald-400">72.1%</span>
              </div>
              <Progress value={72.1} className="h-1.5 bg-emerald-500/20" />

              <div className="flex justify-between items-center text-muted-foreground pt-1">
                <span>Conformidade & Segurança</span>
                <span className="font-bold text-blue-400">100%</span>
              </div>
              <Progress value={100} className="h-1.5 bg-blue-500/20" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

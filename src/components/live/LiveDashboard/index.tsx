/**
 * LiveDashboard - Componente principal do painel de controle
 * Agrega todos os sub-componentes
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Pin,
  Timer,
  Sparkles,
  ShoppingBag,
  Volume2,
  Plus,
  Trash2,
  Mic,
  AudioLines,
  Play,
  Save,
  Download,
  Upload,
  Zap,
  Bell,
  Brain,
  FileText,
  Copy,
  Loader2,
  HelpCircle,
  History,
  Lock,
  ShieldCheck,
  Video,
  ArrowRight,
  Bot,
  CheckCircle2,
  Flame,
  Sun,
  Moon,
  Tv,
  Download as DownloadIcon,
} from "lucide-react";

import { aiHeaders } from "@/lib/live/ai-headers";
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  newProduct,
  type LiveConfig,
} from "@/lib/live/config";
import { VOICES, type VoiceId } from "@/lib/live/voices";
import { playSaleSound, unlockSaleSound } from "@/lib/live/sale-sound";
import { pullVitrine, pollSalesCount } from "@/lib/live/sync";

import { MobileBottomNav } from "../MobileBottomNav";
import { LiveStudioCard } from "../LiveStudioCard";
import { DemoModeCard } from "../DemoModeCard";
import { SetupWizard } from "../SetupWizard";
import { SimpleModeCard } from "../SimpleModeCard";
import { PresetPicker } from "../PresetPicker";
import { APP_VERSION } from "@/lib/live/version";
import { SyncTokenCard } from "../SyncTokenCard";
import { GeminiFeaturesPanel } from "../GeminiFeaturesPanel";
import { AiAutomationsDashboard } from "../AiAutomationsDashboard";
import {
  HelpCircle as HelpIcon,
  History as HistoryIcon,
  ShieldCheck as ShieldIcon,
} from "lucide-react";
import { QuickStartModal } from "../QuickStartModal";
import { useUserSubscription } from "@/hooks/useUserSubscription";
import { PaymentGuardOverlay } from "../PaymentGuardModal";
import { getFirebaseAuth } from "@/lib/firebase";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { ProductsSection } from "./ProductsSection";
import { AiConfigSection } from "./AiConfigSection";
import { VoiceSettings } from "./VoiceSettings";
import { useVitrineSync } from "@/hooks/live/useVitrineSync";
import { useSyncToken } from "@/hooks/useSyncToken";

type ThemeStyle = "dark-modern" | "clean-light" | "vibrant-tech";

const THEME_OPTIONS: { id: ThemeStyle; name: string; tag: string; icon: any; color: string }[] = [
  {
    id: "dark-modern",
    name: "Dark Modern & Sofisticado",
    tag: "Briefing 1",
    icon: Moon,
    color: "bg-[#1E0033] border-[#3A0066] text-white",
  },
  {
    id: "clean-light",
    name: "Clean Light & Intuitivo",
    tag: "Briefing 2",
    icon: Sun,
    color: "bg-[#FDFDFD] border-[#F0E6FF] text-[#4A0080]",
  },
  {
    id: "vibrant-tech",
    name: "Vibrant Tech & Dinâmico",
    tag: "Briefing 3",
    icon: Sparkles,
    color: "bg-[#330066] border-[#CC00FF] text-white",
  },
];

export function LiveDashboard() {
  const { isPaidActive, loading, refetch } = useUserSubscription();

  if (loading) {
    return (
      <main className="marketing-page grid min-h-screen place-items-center px-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Verificando sua licença...
        </div>
      </main>
    );
  }

  if (!isPaidActive) {
    return (
      <main className="marketing-page min-h-screen px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <PaymentGuardOverlay
            userEmail={getFirebaseAuth().currentUser?.email ?? undefined}
            onActivated={refetch}
          />
        </div>
      </main>
    );
  }

  return <LiveDashboardContent />;
}

function LiveDashboardContent() {
  // Usando a store global
  const { config, loading, errors, updateConfig, setLoading, setError } = useLiveStore(
    useShallow((state) => ({
      config: state.config,
      loading: state.loading,
      errors: state.errors,
      updateConfig: state.actions.updateConfig,
      setLoading: state.actions.setLoading,
      setError: state.actions.setError,
    })),
  );

  // Sync token da extensão (users/{uid}.syncToken)
  const syncToken = useSyncToken();

  // Hook de sincronização da vitrine
  const { syncVitrine } = useVitrineSync({
    autoSync: true,
    syncInterval: 20000,
    onError: (error) => {
      setError("vitrine", error);
      toast.error(`Erro ao sincronizar vitrine: ${error}`);
    },
  });

  // Estados locais (não persistidos na store global)
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [scriptObjetivo, setScriptObjetivo] = useState("pitch do produto ativo");
  const [scriptDuracao, setScriptDuracao] = useState(3);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [audioPermGranted, setAudioPermGranted] = useState(false);
  const [testingRoute, setTestingRoute] = useState(false);
  const [vuLevel, setVuLevel] = useState(0);
  const [pttActive, setPttActive] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const routeCtxRef = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    gain: GainNode;
    analyser: AnalyserNode;
    dest: MediaStreamAudioDestinationNode;
    audioEl: HTMLAudioElement;
    raf: number;
  } | null>(null);

  // Carrega configuração inicial
  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      updateConfig(() => cfg);
    }
  }, [updateConfig]);

  // Salva configuração sempre que mudar
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // Atualiza dispositivos de áudio
  const refreshAudioOutputs = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setAudioOutputs(devs.filter((d) => d.kind === "audiooutput"));
    } catch {
      // Ignora erro
    }
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    refreshAudioOutputs();
    const onChange = () => refreshAudioOutputs();
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", onChange);
  }, []);

  // Solicita permissão de áudio
  const requestAudioPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setAudioPermGranted(true);
      await refreshAudioOutputs();
      toast.success("Dispositivos liberados");
    } catch {
      toast.error("Permissão negada. Libere o microfone nas configurações do navegador.");
    }
  };

  // Funções de atualização
  const update = <K extends keyof LiveConfig>(k: K, v: LiveConfig[K]) => {
    updateConfig((c) => ({ ...c, [k]: v }));
  };

  const updateContext = <K extends keyof LiveConfig["aiContext"]>(
    k: K,
    v: LiveConfig["aiContext"][K],
  ) => {
    updateConfig((c) => ({ ...c, aiContext: { ...c.aiContext, [k]: v } }));
  };

  // Modo simples/avançado
  const simple = config.uiMode !== "avancado";
  const setMode = (m: "simples" | "avancado") => updateConfig((c) => ({ ...c, uiMode: m }));

  // Importa vitrine
  const importVitrine = async (opts: { silent?: boolean } = {}) => {
    const silent = opts.silent ?? false;
    if (!silent) setLoading("vitrine", true);

    try {
      await syncVitrine();
      if (!silent) {
        toast.success("Vitrine sincronizada");
      }
    } catch (e) {
      if (!silent) {
        toast.error("Falha ao sincronizar vitrine", {
          description: e instanceof Error ? e.message : "Erro desconhecido",
        });
      }
    } finally {
      if (!silent) setLoading("vitrine", false);
    }
  };

  // Gera script
  const generateScript = async () => {
    setGeneratingScript(true);
    setLoading("script", true);
    try {
      const res = await fetch("/api/script/generate", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({
          config,
          objetivo: scriptObjetivo,
          duracaoMin: scriptDuracao,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { script } = (await res.json()) as { script: string };
      updateConfig((c) => ({ ...c, ultimoRoteiro: script }));
      toast.success("Roteiro gerado");
    } catch (e) {
      toast.error("Falha ao gerar roteiro", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setGeneratingScript(false);
      setLoading("script", false);
    }
  };

  // Gera scripts para todos os produtos
  const generateAllProductScripts = async () => {
    const alvos = config.produtos;
    if (alvos.length === 0) {
      toast.error("Nenhum produto no catálogo");
      return;
    }
    setBulkProgress({ done: 0, total: alvos.length });
    const novos: Record<string, string> = { ...config.roteirosPorProduto };

    try {
      for (let i = 0; i < alvos.length; i++) {
        const p = alvos[i];
        const res = await fetch("/api/script/generate", {
          method: "POST",
          headers: await aiHeaders(),
          body: JSON.stringify({
            config,
            objetivo: `pitch focado no produto "${p.name}"`,
            duracaoMin: scriptDuracao,
            productId: p.id,
          }),
        });
        if (res.ok) {
          const { script } = (await res.json()) as { script: string };
          novos[p.id] = script;
          updateConfig((c) => ({ ...c, roteirosPorProduto: { ...novos } }));
        }
        setBulkProgress({ done: i + 1, total: alvos.length });
      }
      toast.success(`${alvos.length} roteiro(s) gerado(s)`);
    } catch (e) {
      toast.error("Falha ao gerar em lote", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setBulkProgress(null);
    }
  };

  // Funções de teste de roteamento
  const stopRouteTest = () => {
    const r = routeCtxRef.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    try {
      r.osc.stop();
    } catch {
      /* noop */
    }
    try {
      r.audioEl.pause();
    } catch {
      /* noop */
    }
    try {
      r.ctx.close();
    } catch {
      /* noop */
    }
    routeCtxRef.current = null;
    setTestingRoute(false);
    setVuLevel(0);
  };

  const startRouteTest = async () => {
    if (testingRoute) {
      stopRouteTest();
      return;
    }
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, config.voz.gain)) * 0.25;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(analyser);
      analyser.connect(dest);

      const audioEl = new Audio();
      audioEl.srcObject = dest.stream;
      const sinkId = config.voz.outputDeviceId;
      const withSink = audioEl as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (sinkId && typeof withSink.setSinkId === "function") {
        try {
          await withSink.setSinkId(sinkId);
        } catch {
          /* noop */
        }
      }
      await audioEl.play();
      osc.start();

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setVuLevel(Math.min(1, rms * 2.5));
        routeCtxRef.current!.raf = requestAnimationFrame(tick);
      };
      routeCtxRef.current = { ctx, osc, gain, analyser, dest, audioEl, raf: 0 };
      routeCtxRef.current.raf = requestAnimationFrame(tick);
      setTestingRoute(true);
      toast.success("Tocando 440Hz — confira o VU meter da live");
    } catch (e) {
      toast.error("Falha ao iniciar teste de roteamento", {
        description: e instanceof Error ? e.message : "Erro",
      });
    }
  };

  // Push-to-talk
  useEffect(() => {
    if (!config.voz.pushToTalk.enabled) return;
    const key = config.voz.pushToTalk.key || "Space";
    const audioEl = audioRef.current;
    const setMuted = (m: boolean) => {
      setPttActive(m);
      if (audioEl) audioEl.muted = m;
      window.dispatchEvent(new CustomEvent("pitchai:ptt", { detail: { muted: m } }));
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!pttActive) setMuted(true);
      if (key === "Space") e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== key) return;
      setMuted(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      if (audioEl) audioEl.muted = false;
    };
  }, [config.voz.pushToTalk.enabled, config.voz.pushToTalk.key, pttActive]);

  // Cleanup do teste de roteamento
  useEffect(() => () => stopRouteTest(), []);

  // Sincronização de vendas
  const salesRef = useRef<number | null>(null);
  useEffect(() => {
    if (!config) return;
    let cancelled = false;

    const run = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const n = await pollSalesCount();
      if (cancelled || n === null) return;
      const prev = salesRef.current;
      salesRef.current = n;
      if (prev === null || n <= prev) return;
      if (config.somVenda.enabled) void playSaleSound(config.somVenda.volume);
      if (config.notificacoesVenda) {
        toast.success(n - prev > 1 ? `${n - prev} novas vendas!` : "Saiu venda! 🛒");
      }
    };

    void run();
    const id = window.setInterval(() => void run(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [config?.somVenda.enabled, config?.somVenda.volume, config?.notificacoesVenda]);

  // Exporta backup
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pitchai-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Backup exportado");
  };

  // Importa backup
  const importBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        updateConfig(() => ({ ...DEFAULT_CONFIG, ...parsed }));
        toast.success("Backup importado");
      } catch {
        toast.error("Arquivo inválido");
      }
    };
    input.click();
  };

  const activeProduct = config.produtos.find((p) => p.active) ?? null;

  return (
    <div className="marketing-page min-h-screen bg-background pb-28 text-foreground lg:pb-0">
      <MobileBottomNav />
      <audio ref={audioRef} hidden />

      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground shadow-[0_4px_14px_-2px_rgba(124,58,237,0.55)] ring-1 ring-white/10">
              <Zap className="h-4 w-4" strokeWidth={2.5} fill="currentColor" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold tracking-tight">Pitch AI</span>
                <span className="font-mono text-[10px] text-muted-foreground">v{APP_VERSION}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-400">
                  <ShieldIcon className="h-3 w-3" />
                  <span>Licença Ativa</span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border border-border/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("simples")}
                className={`rounded-full px-3 py-1 font-medium transition ${simple ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Simples
              </button>
              <button
                type="button"
                onClick={() => setMode("avancado")}
                className={`rounded-full px-3 py-1 font-medium transition ${!simple ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Avançado
              </button>
            </div>
            {!simple && (
              <>
                <Button variant="outline" size="sm" onClick={exportBackup}>
                  <DownloadIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Exportar</span>
                </Button>
                <Button variant="outline" size="sm" onClick={importBackup}>
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Importar</span>
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickStartOpen(true)}
              className="border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 text-xs gap-1.5 font-bold"
            >
              <HelpIcon className="h-3.5 w-3.5 text-purple-400" />
              <span className="hidden sm:inline">Guia Rápido</span>
            </Button>
            <Button size="sm" onClick={() => toast.success("Configurações salvas")}>
              <Save className="h-3.5 w-3.5" />
              Salvar
            </Button>
          </div>
        </div>
      </div>

      <QuickStartModal
        open={quickStartOpen}
        onOpenChange={setQuickStartOpen}
        syncToken={syncToken ?? undefined}
      />

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="space-y-4">
          {!config.onboardingDone && (
            <SetupWizard
              cfg={config}
              setCfg={updateConfig}
              importing={loading.vitrine}
              onImportVitrine={() => importVitrine()}
              onFinish={() => updateConfig((c) => ({ ...c, onboardingDone: true }))}
              syncToken={syncToken ?? undefined}
            />
          )}

          {/* Navegação rápida */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              to="/indique"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 font-medium text-primary hover:bg-primary/20"
            >
              💸 Indique e ganhe 60%
            </Link>
            <Link
              to="/quentes"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-2 font-medium hover:bg-card"
            >
              🔥 Produtos quentes
            </Link>
            <Link
              to="/planos"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-2 font-medium hover:bg-card"
            >
              ⚡ Planos
            </Link>
            <Link
              to="/download"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-2 font-medium hover:bg-card"
            >
              ⬇️ Extensão
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/60 px-3 py-2 font-medium hover:bg-card"
            >
              🏠 Início
            </Link>
          </div>

          {/* Modo simples */}
          {simple && (
            <SimpleModeCard
              cfg={config}
              setCfg={updateConfig}
              onAdvanced={() => setMode("avancado")}
              syncToken={syncToken ?? undefined}
            />
          )}

          {/* Componentes de configuração */}
          <AiAutomationsDashboard />
          <LiveStudioCard compact={simple} />
          <GeminiFeaturesPanel />

          {!simple && <DemoModeCard cfg={config} setCfg={updateConfig} />}

          {/* Seções de configuração detalhada */}
          {!simple && (
            <>
              {/* Proteção geral */}
              <Card id="sec-protecao" className="scroll-mt-24 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Switch
                      checked={config.protecaoGeral}
                      onCheckedChange={(v) => update("protecaoGeral", v)}
                      className="mt-1"
                    />
                    <div>
                      <h3 className="font-display text-base font-bold">Proteção geral</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Pode ligar a PROTEÇÃO agora. A IA entra sozinha quando os campos do chat
                        forem detectados.
                      </p>
                    </div>
                  </div>
                  <ul className="hidden shrink-0 space-y-1.5 text-xs text-muted-foreground sm:block">
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      Violação — vigia a tela e encerra a live
                    </li>
                    <li className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      Auto Moderador IA — responde os comentários
                    </li>
                  </ul>
                </div>
              </Card>

              {/* Chaves da live */}
              <div id="sec-chaves" className="scroll-mt-24 pt-2">
                <h4 className="mb-3 font-display text-sm font-semibold">
                  Chaves da live
                  <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                    cada uma liga uma automação
                  </span>
                </h4>

                <div className="space-y-3">
                  {/* Auto-fixar */}
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                        <Pin className="h-[18px] w-[18px]" strokeWidth={2.2} fill="currentColor" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-semibold">Auto-fixar produto</h4>
                          <Switch
                            checked={config.autoFixar.enabled}
                            onCheckedChange={(v) =>
                              update("autoFixar", { ...config.autoFixar, enabled: v })
                            }
                          />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Adicione produtos e clique em "Buscar produtos".
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Input
                            placeholder="Buscar produto por nome ou nº"
                            value={config.autoFixar.query}
                            onChange={(e) =>
                              update("autoFixar", {
                                ...config.autoFixar,
                                query: e.target.value,
                              })
                            }
                            className="max-w-xs"
                          />
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="uppercase tracking-wide">Re-fixa a cada</span>
                            <Input
                              type="number"
                              value={config.autoFixar.minSec}
                              onChange={(e) =>
                                update("autoFixar", {
                                  ...config.autoFixar,
                                  minSec: +e.target.value,
                                })
                              }
                              className="w-16"
                            />
                            <span>—</span>
                            <Input
                              type="number"
                              value={config.autoFixar.maxSec}
                              onChange={(e) =>
                                update("autoFixar", {
                                  ...config.autoFixar,
                                  maxSec: +e.target.value,
                                })
                              }
                              className="w-16"
                            />
                            <span>seg</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* Encerrar por tempo */}
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary ring-1 ring-inset ring-secondary/25">
                        <Timer className="h-[18px] w-[18px]" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-semibold">Encerrar por tempo</h4>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={config.encerrarTempo.minutes}
                              onChange={(e) =>
                                update("encerrarTempo", {
                                  ...config.encerrarTempo,
                                  minutes: +e.target.value,
                                })
                              }
                              className="w-20"
                            />
                            <span className="text-xs text-muted-foreground">MIN</span>
                            <Switch
                              checked={config.encerrarTempo.enabled}
                              onCheckedChange={(v) =>
                                update("encerrarTempo", {
                                  ...config.encerrarTempo,
                                  enabled: v,
                                })
                              }
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Encerra a live sozinho ao atingir o tempo definido — contado pelo
                          cronômetro real, a partir do início da live.
                        </p>
                      </div>
                    </div>
                  </Card>

                  {/* Respostas IA */}
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                        <Sparkles className="h-[18px] w-[18px]" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-semibold">Respostas automáticas da IA</h4>
                          <Switch
                            checked={config.respostasIA}
                            onCheckedChange={(v) => update("respostasIA", v)}
                          />
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Responde os comentários pelo{" "}
                          <span className="font-semibold text-foreground">produto ativo</span>
                          {activeProduct
                            ? ` (${activeProduct.name})`
                            : " — nenhum produto marcado como ativo"}
                          .
                        </p>
                      </div>
                    </div>
                  </Card>

                  {/* Notificações venda */}
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success ring-1 ring-inset ring-success/25">
                        <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-semibold">Notificações de venda</h4>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                await unlockSaleSound();
                                await playSaleSound(config.somVenda.volume);
                                toast.success("Som de venda liberado neste navegador");
                              }}
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                              Testar som
                            </Button>
                            <Switch
                              checked={config.notificacoesVenda}
                              onCheckedChange={(v) => update("notificacoesVenda", v)}
                            />
                          </div>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Toca o som de caixa registradora a cada venda detectada pela extensão no
                          Gerenciador de LIVE.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch
                              checked={config.somVenda.enabled}
                              onCheckedChange={(v) =>
                                update("somVenda", { ...config.somVenda, enabled: v })
                              }
                            />
                            Som de caixa registradora
                          </label>
                          <div className="flex min-w-[180px] flex-1 items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                              Volume
                            </span>
                            <Slider
                              value={[Math.round(config.somVenda.volume * 100)]}
                              min={0}
                              max={100}
                              step={5}
                              onValueChange={([v]) =>
                                update("somVenda", {
                                  ...config.somVenda,
                                  volume: (v ?? 80) / 100,
                                })
                              }
                            />
                            <span className="w-10 text-right font-mono text-xs">
                              {Math.round(config.somVenda.volume * 100)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Produtos */}
              <ProductsSection />

              {/* Contexto da IA */}
              <AiConfigSection />

              {/* Gerador de Roteiro */}
              <div id="sec-roteiro" className="scroll-mt-24 pt-2">
                <h4 className="mb-3 font-display text-sm font-semibold">
                  Gerador de roteiro
                  <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                    script pronto pra você narrar ao vivo
                  </span>
                </h4>
                <Card className="p-4">
                  <div className="mb-4 flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/15 text-secondary ring-1 ring-inset ring-secondary/25">
                      <FileText className="h-[18px] w-[18px]" strokeWidth={2.2} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Usa o contexto da marca + produto ATIVO para montar o script.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                        Objetivo do bloco
                      </label>
                      <Input
                        value={scriptObjetivo}
                        onChange={(e) => setScriptObjetivo(e.target.value)}
                        placeholder="Ex: abertura, pitch, fechar venda, reengajar"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                        Duração (min)
                      </label>
                      <Input
                        type="number"
                        min={1}
                        max={15}
                        value={scriptDuracao}
                        onChange={(e) => setScriptDuracao(+e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={generateScript}
                        disabled={generatingScript || loading.script}
                        className="w-full sm:w-auto"
                      >
                        {generatingScript || loading.script ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {generatingScript || loading.script ? "Gerando..." : "Gerar roteiro"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Gerar roteiro para cada produto</p>
                      <p className="text-xs text-muted-foreground">
                        Cria um pitch dedicado por item do catálogo ({config.produtos.length}{" "}
                        produto
                        {config.produtos.length === 1 ? "" : "s"}).
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={generateAllProductScripts}
                      disabled={bulkProgress !== null || config.produtos.length === 0}
                    >
                      {bulkProgress ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {bulkProgress.done}/{bulkProgress.total}
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Gerar todos
                        </>
                      )}
                    </Button>
                  </div>

                  {Object.keys(config.roteirosPorProduto).length > 0 && (
                    <div className="mt-4 space-y-2">
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        Roteiros por produto
                      </span>
                      {config.produtos
                        .filter((p) => config.roteirosPorProduto[p.id])
                        .map((p) => (
                          <details
                            key={p.id}
                            className="group rounded-lg border border-border/60 bg-card/50"
                          >
                            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
                              <span className="flex items-center gap-2 truncate">
                                <FileText className="h-3.5 w-3.5 text-secondary" />
                                <span className="truncate font-semibold">{p.name}</span>
                                {p.price && (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {p.price}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground group-open:hidden">
                                abrir
                              </span>
                            </summary>
                            <div className="border-t border-border/60 p-3">
                              <div className="mb-2 flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(config.roteirosPorProduto[p.id]);
                                    toast.success("Roteiro copiado");
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  Copiar
                                </Button>
                              </div>
                              <Textarea
                                value={config.roteirosPorProduto[p.id]}
                                onChange={(e) =>
                                  updateConfig((c) => ({
                                    ...c,
                                    roteirosPorProduto: {
                                      ...c.roteirosPorProduto,
                                      [p.id]: e.target.value,
                                    },
                                  }))
                                }
                                rows={12}
                                className="font-mono text-xs leading-relaxed"
                              />
                            </div>
                          </details>
                        ))}
                    </div>
                  )}

                  {config.ultimoRoteiro && (
                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Último roteiro
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(config.ultimoRoteiro);
                            toast.success("Roteiro copiado");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar
                        </Button>
                      </div>
                      <Textarea
                        value={config.ultimoRoteiro}
                        onChange={(e) =>
                          updateConfig((c) => ({ ...c, ultimoRoteiro: e.target.value }))
                        }
                        rows={14}
                        className="font-mono text-xs leading-relaxed"
                      />
                    </div>
                  )}
                </Card>
              </div>

              {/* Voz da IA */}
              <VoiceSettings
                audioOutputs={audioOutputs}
                audioPermGranted={audioPermGranted}
                onRequestAudioPermission={requestAudioPermission}
              />

              {/* Guia de transmissão */}
              <div id="sec-guia" className="scroll-mt-24 pt-2">
                <h4 className="mb-3 font-display text-sm font-semibold">
                  Como transmitir a voz da IA na live
                  <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
                    mini tutorial
                  </span>
                </h4>
                <Card className="space-y-4 p-4 text-sm">
                  <div>
                    <div className="mb-1 font-semibold text-primary">
                      0. Instalar a extensão do Pitch AI (Chrome/Edge/Brave)
                    </div>
                    <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                      <li>
                        Baixe o pacote da extensão:{" "}
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-1 h-7"
                          onClick={() => {
                            fetch("/pitchai-extension.zip")
                              .then((r) => {
                                if (!r.ok) throw new Error("Falha ao baixar");
                                return r.blob();
                              })
                              .then((blob) => {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = "pitchai-extension.zip";
                                a.click();
                                URL.revokeObjectURL(url);
                              })
                              .catch((e) => alert(e.message));
                          }}
                        >
                          <DownloadIcon className="h-3.5 w-3.5" />
                          Baixar extensão
                        </Button>
                      </li>
                      <li>
                        Descompacte o arquivo <b>pitchai-extension.zip</b> em uma pasta fixa (não
                        apague depois).
                      </li>
                      <li>
                        Abra <b>chrome://extensions</b> no navegador e ative o{" "}
                        <b>Modo do desenvolvedor</b> (canto superior direito).
                      </li>
                      <li>
                        Clique em <b>Carregar sem compactação</b> e selecione a pasta descompactada.
                      </li>
                      <li>
                        Acesse{" "}
                        <a
                          href="https://shop.tiktok.com/streamer/live/product/dashboard"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          shop.tiktok.com/streamer
                        </a>{" "}
                        — o botão flutuante do Pitch AI aparece na tela da live.
                      </li>
                    </ol>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3">
                    <DownloadIcon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1 text-xs">
                      Instale o cabo virtual (Windows). Um clique baixa o instalador oficial da
                      VB-Audio.
                    </span>
                    <Button size="sm" asChild>
                      <a
                        href="https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <DownloadIcon className="h-3.5 w-3.5" />
                        Instalar VB-Cable
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href="https://existential.audio/blackhole/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        BlackHole (Mac)
                      </a>
                    </Button>
                  </div>

                  <div>
                    <div className="mb-1 font-semibold text-primary">
                      Windows — VB-Cable (grátis)
                    </div>
                    <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                      <li>
                        Use o botão <b>Instalar VB-Cable</b> acima (ou baixe em{" "}
                        <a
                          href="https://vb-audio.com/Cable/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          vb-audio.com/Cable
                        </a>
                        ). Extraia o ZIP e rode <b>VBCABLE_Setup_x64.exe</b> como administrador.
                        Reinicie o PC.
                      </li>
                      <li>
                        Acima, em <b>Saída de áudio</b>, escolha{" "}
                        <b>CABLE Input (VB-Audio Virtual Cable)</b>.
                      </li>
                      <li>
                        No TikTok Live Studio / OBS / navegador da live, defina o microfone como{" "}
                        <b>CABLE Output (VB-Audio Virtual Cable)</b>.
                      </li>
                      <li>
                        Quer misturar sua voz + IA? Use{" "}
                        <a
                          href="https://vb-audio.com/Voicemeeter/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          VoiceMeeter Banana
                        </a>
                        .
                      </li>
                    </ol>
                  </div>

                  <div>
                    <div className="mb-1 font-semibold text-primary">Mac — BlackHole (grátis)</div>
                    <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">
                      <li>
                        Baixe em{" "}
                        <a
                          href="https://existential.audio/blackhole/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          existential.audio/blackhole
                        </a>{" "}
                        (versão 2ch).
                      </li>
                      <li>
                        Abra <b>Configuração de Áudio MIDI</b> → crie um <b>Dispositivo Agregado</b>{" "}
                        com BlackHole + suas caixas (para ouvir também).
                      </li>
                      <li>
                        Acima, em <b>Saída de áudio</b>, escolha <b>BlackHole 2ch</b>.
                      </li>
                      <li>
                        No app da live, selecione o microfone <b>BlackHole 2ch</b>.
                      </li>
                    </ol>
                  </div>

                  <div>
                    <div className="mb-1 font-semibold text-primary">Celular (Android/iOS)</div>
                    <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                      <li>
                        Não é possível rotear áudio interno para o mic da câmera nativa sem cabo.
                      </li>
                      <li>Solução simples: transmita do PC e deixe o celular só como monitor.</li>
                      <li>
                        Alternativa: cabo <b>TRRS</b> ligando saída de fone do PC → entrada de mic
                        do celular (adaptador Lightning/USB-C se precisar) + app{" "}
                        <b>Larix Broadcaster</b>.
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                    <b className="text-foreground">Dica:</b> abra o TikTok Live Studio →
                    Configurações → Áudio → selecione o cabo virtual como microfone. Fale por 5s e
                    confirme que o VU meter mexe. Depois clique em <b>Testar voz</b> aqui e confirme
                    que o meter mexe também.
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-3">
          <SyncTokenCard />
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary/15 text-secondary ring-1 ring-inset ring-secondary/25">
                <Bell className="h-3.5 w-3.5" strokeWidth={2.4} />
              </div>
              <h4 className="font-display text-sm font-bold">Novidades</h4>
              <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-secondary" />
            </div>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-[10px] font-mono uppercase text-muted-foreground">
                  Hoje · v{APP_VERSION}
                </div>
                <div className="mt-1 font-semibold">⭐ MVP público lançado</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Painel completo com Proteção, Auto-fixar, Encerrar por tempo, Respostas IA,
                  Notificações de venda, gerenciamento de produtos e voz da IA em tempo real.
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-3">
                <div className="text-[10px] font-mono uppercase text-muted-foreground">
                  Em breve
                </div>
                <div className="mt-1 font-semibold">Login + Planos</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sincronização de configuração entre dispositivos e planos pagos com uso maior de
                  IA.
                </p>
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <div className="mx-auto max-w-6xl border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        Pitch AI v{APP_VERSION} · salva sozinho a cada alteração
      </div>
    </div>
  );
}

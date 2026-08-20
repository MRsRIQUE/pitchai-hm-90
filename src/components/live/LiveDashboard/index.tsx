/**
 * LiveDashboard — painel do usuário (/app).
 *
 * O componente aqui é só a casca: guarda de assinatura, estado global, os
 * ciclos que precisam viver acima de qualquer tela (push-to-talk, vendas,
 * sincronização da vitrine) e a navegação. Cada seção da sidebar mora em
 * `./sections` e recebe apenas o que não consegue ler sozinha da store.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Download,
  HelpCircle,
  Home,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";

import { AppShell, type AppSection, type AppShortcut } from "@/components/app/AppShell";
import { loadConfig, saveConfig } from "@/lib/live/config";
import { playSaleSound } from "@/lib/live/sale-sound";
import { pollSalesCount } from "@/lib/live/sync";
import { APP_VERSION } from "@/lib/live/version";

import { QuickStartModal } from "../QuickStartModal";
import { SetupWizard } from "../SetupWizard";
import { QuentesDoTime } from "../QuentesDoTime";
import { useUserSubscription } from "@/hooks/useUserSubscription";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { PaymentGuardOverlay } from "../PaymentGuardModal";
import { LogoutButton } from "../LogoutButton";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useVitrineSync } from "@/hooks/live/useVitrineSync";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { useSyncToken } from "@/hooks/useSyncToken";

import { AutomacoesSection } from "./sections/AutomacoesSection";
import { ContaSection } from "./sections/ContaSection";
import { DesempenhoSection } from "./sections/DesempenhoSection";
import { IaSection } from "./sections/IaSection";
import { InicioSection } from "./sections/InicioSection";
import { LiveSection } from "./sections/LiveSection";
import { ProdutosSection } from "./sections/ProdutosSection";
import { ProtecaoSection } from "./sections/ProtecaoSection";
import { VozSection } from "./sections/VozSection";
import { sectionDisponivel, sectionsDoModo, type SectionId } from "./sections/sections";
import { useExtensionInstalled } from "./sections/useExtensionInstalled";

/**
 * As ações da topbar têm largura fixa (`.app-topbar-actions` é `flex: none` no
 * shell), então elas não encolhem: com três itens por extenso, abaixo de ~350px
 * elas estouram a barra e espremem o título até zero. Aqui a decisão volta para
 * o JS, no mesmo 560px em que o `dashboard.css` já encolhe a topbar — assim os
 * dois ajustes acontecem no mesmo ponto.
 */
function useTopbarCompacta(): boolean {
  const [compacta, setCompacta] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 560px)");
    const sync = () => setCompacta(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return compacta;
}

const SHORTCUTS: AppShortcut[] = [
  { to: "/planos", label: "Planos", icon: Wallet },
  { to: "/indique", label: "Indique e ganhe", icon: Sparkles },
  { to: "/quentes", label: "Produtos quentes", icon: Zap },
  { to: "/download", label: "Baixar extensão", icon: Download },
  { to: "/", label: "Início do site", icon: Home },
];

export function LiveDashboard() {
  const { isPaidActive, loading } = useUserSubscription();

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
          {/* Quem chega aqui ainda não tem plano — precisa conseguir sair da conta. */}
          <div className="mb-4 flex justify-end">
            <LogoutButton label="Sair da conta" alwaysShowLabel />
          </div>
          <PaymentGuardOverlay />
        </div>
      </main>
    );
  }

  return <LiveDashboardContent />;
}

function LiveDashboardContent() {
  // Atalho para o painel administrativo, só para quem é admin. Não é controle
  // de acesso — o `/admin` é barrado no servidor; aqui é só não mostrar a porta
  // para quem não pode abri-la.
  const isAdmin = useIsAdmin();
  const shortcuts = useMemo<AppShortcut[]>(
    () =>
      isAdmin
        ? [{ to: "/admin", label: "Painel admin", icon: ShieldCheck }, ...SHORTCUTS]
        : SHORTCUTS,
    [isAdmin],
  );

  const { config, loadingState, updateConfigRaw, setLoading, setError } = useLiveStore(
    useShallow((state) => ({
      config: state.config,
      loadingState: state.loading,
      updateConfigRaw: state.actions.updateConfig,
      setLoading: state.actions.setLoading,
      setError: state.actions.setError,
    })),
  );

  // Tudo que o usuário clica passa por aqui: salva local E publica no doc
  // compartilhado as chaves que a barra da live também controla. O
  // `updateConfigRaw` fica só para carregar do localStorage — se ele publicasse,
  // o estado velho do painel sobrescreveria o que a extensão acabou de ligar.
  const updateConfig = useSyncedUpdateConfig();

  const syncToken = useSyncToken();
  const extensaoInstalada = useExtensionInstalled();

  const { syncVitrine } = useVitrineSync({
    autoSync: true,
    syncInterval: 20000,
    // Sem toast aqui: este ciclo roda sozinho a cada 20s e um erro persistente
    // (usuário sem extensão pareada, por exemplo) viraria um pop-up a cada 20s
    // por cima de um painel que está mostrando os produtos normalmente.
    onError: (error) => {
      setError("vitrine", error);
      console.warn("[LiveDashboard] auto-sync da vitrine falhou:", error);
    },
  });

  const [active, setActive] = useState<SectionId>("inicio");
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [audioPermGranted, setAudioPermGranted] = useState(false);
  const [pttActive, setPttActive] = useState(false);
  const [vendas, setVendas] = useState<number | null>(null);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const simples = config.uiMode !== "avancado";
  const compacta = useTopbarCompacta();

  /*
   * ORDEM IMPORTA: este efeito precisa vir antes do que hidrata do localStorage.
   * Ele guarda o retrato da config a cada mudança; se rodasse depois, a própria
   * hidratação apareceria como uma edição e a topbar diria "salvo agora" sem o
   * usuário ter tocado em nada.
   */
  const ultimoSerial = useRef<string | null>(null);
  useEffect(() => {
    const serial = JSON.stringify(config);
    saveConfig(config);
    if (ultimoSerial.current !== null && ultimoSerial.current !== serial) {
      setSalvoEm(new Date());
    }
    ultimoSerial.current = serial;
  }, [config]);

  useEffect(() => {
    const cfg = loadConfig();
    if (cfg) {
      // Carimba o retrato antes de aplicar: a hidratação não é uma edição.
      ultimoSerial.current = JSON.stringify(cfg);
      updateConfigRaw(() => cfg);
    }
  }, [updateConfigRaw]);

  // A extensão manda o vendedor para /app?desvincular=1 quando recusa o
  // navegador. Sem abrir a seção Conta aqui, ele cai no Início e não vê nada: o
  // efeito que lê esse parâmetro mora dentro do DeviceBindingPanel, que só
  // existe sob ContaSection. O botão da extensão apontava para uma porta fechada.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("desvincular") === "1") {
      setActive("conta");
    }
  }, []);

  // Volta para o Início se o modo Simples esconder a seção aberta.
  useEffect(() => {
    if (!sectionDisponivel(active, simples)) setActive("inicio");
  }, [active, simples]);

  const refreshAudioOutputs = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setAudioOutputs(devs.filter((d) => d.kind === "audiooutput"));
    } catch {
      // Sem permissão o navegador devolve a lista sem rótulos; o botão de
      // liberar dispositivos na seção Voz é o caminho de saída.
    }
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    void refreshAudioOutputs();
    const onChange = () => void refreshAudioOutputs();
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", onChange);
  }, []);

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

  // Push-to-talk vive no container, não na seção Voz: o usuário segura a tecla
  // enquanto olha qualquer tela, e desmontar o listener ao navegar deixaria a
  // IA falando por cima dele.
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

  // Vendas: o mesmo ciclo alimenta o número do Início e dispara som/toast.
  const salesRef = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      const n = await pollSalesCount();
      if (cancelled || n === null) return;
      setVendas(n);
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
  }, [config.somVenda.enabled, config.somVenda.volume, config.notificacoesVenda]);

  const importVitrine = async () => {
    setLoading("vitrine", true);
    try {
      // `syncVitrine` relata pelo retorno, nunca rejeita — sem checar o
      // `outcome` o painel anunciava "Vitrine sincronizada" mesmo quando a
      // sincronização tinha falhado.
      const outcome = await syncVitrine();
      if (outcome.ok) {
        toast.success(
          outcome.importedCount > 0
            ? `Vitrine sincronizada — ${outcome.importedCount} produto(s) adicionado(s)`
            : outcome.items.length > 0
              ? "Vitrine sincronizada — produtos já estavam na lista"
              : "Vitrine sincronizada, mas nenhum produto veio do TikTok",
        );
      } else if (outcome.busy) {
        toast.info("Já estava sincronizando — aguarde alguns segundos");
      } else {
        toast.error("Falha ao sincronizar vitrine", { description: outcome.error });
      }
    } finally {
      setLoading("vitrine", false);
    }
  };

  const sections: AppSection[] = sectionsDoModo(simples).map((s) => {
    if (s.id === "produtos" && config.produtos.length > 0) {
      return { ...s, badge: { text: String(config.produtos.length) } };
    }
    if (s.id === "protecao" && !config.protecaoGeral) {
      return { ...s, badge: { text: "!", tone: "warn" as const } };
    }
    return s;
  });

  return (
    <>
      <audio ref={audioRef} hidden />

      <QuickStartModal
        open={quickStartOpen}
        onOpenChange={setQuickStartOpen}
        syncToken={syncToken ?? undefined}
      />

      <AppShell
        sections={sections}
        active={active}
        onSelect={(id) => setActive(id as SectionId)}
        shortcuts={shortcuts}
        actions={
          <>
            {/* Não existe botão de salvar: a store grava a cada alteração. O
                indicador é o que conta isso para quem procura o botão. Some no
                celular enquanto ainda não há hora para mostrar — ali ele seria
                só uma frase ocupando a largura que o título precisa. */}
            {compacta && !salvoEm ? null : (
              <span className="app-tag" data-tone={salvoEm ? "ok" : undefined}>
                {salvoEm ? <Check aria-hidden="true" /> : null}
                {salvoEm
                  ? `${compacta ? "" : "Salvo às "}${salvoEm.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Salva automaticamente"}
              </span>
            )}
            <button
              type="button"
              className="app-btn app-btn--sm"
              onClick={() => setQuickStartOpen(true)}
              aria-label="Guia rápido"
              title="Guia rápido"
            >
              <HelpCircle aria-hidden="true" />
              {compacta ? null : "Guia rápido"}
            </button>
            <LogoutButton label="Sair" />
          </>
        }
        footer={
          <div style={{ display: "grid", gap: 10 }}>
            <div className="app-segment" style={{ width: "100%" }}>
              <button
                type="button"
                aria-pressed={simples}
                style={{ flex: 1 }}
                onClick={() => updateConfig((c) => ({ ...c, uiMode: "simples" }))}
              >
                Simples
              </button>
              <button
                type="button"
                aria-pressed={!simples}
                style={{ flex: 1 }}
                onClick={() => updateConfig((c) => ({ ...c, uiMode: "avancado" }))}
              >
                Avançado
              </button>
            </div>
            <span>Pitch AI v{APP_VERSION}</span>
          </div>
        }
      >
        {active === "inicio" && !config.onboardingDone ? (
          <div className="app-section">
            <SetupWizard
              cfg={config}
              setCfg={updateConfig}
              importing={loadingState.vitrine}
              onImportVitrine={() => void importVitrine()}
              onFinish={() => updateConfig((c) => ({ ...c, onboardingDone: true }))}
              syncToken={syncToken ?? undefined}
            />
          </div>
        ) : null}

        {active === "inicio" ? (
          <InicioSection
            extensaoInstalada={extensaoInstalada}
            syncToken={syncToken}
            vendas={vendas}
            onSelect={setActive}
          />
        ) : null}

        {/* A Live nunca desmonta: o Studio segura a stream da câmera/tela e a
            gravação em curso, e trocar de seção derrubaria a transmissão. */}
        <div style={{ display: active === "live" ? undefined : "none" }}>
          <LiveSection ativa={active === "live"} simples={simples} />
        </div>

        {active === "desempenho" ? <DesempenhoSection /> : null}
        {active === "produtos" ? <ProdutosSection /> : null}
        {active === "produtos" ? <QuentesDoTime /> : null}
        {active === "ia" ? <IaSection /> : null}
        {active === "voz" ? (
          <VozSection
            audioOutputs={audioOutputs}
            audioPermGranted={audioPermGranted}
            onRequestAudioPermission={requestAudioPermission}
          />
        ) : null}
        {active === "protecao" ? <ProtecaoSection /> : null}
        {active === "automacoes" ? <AutomacoesSection /> : null}
        {active === "conta" ? <ContaSection /> : null}
      </AppShell>
    </>
  );
}

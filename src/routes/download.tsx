import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Globe,
  ShieldCheck,
  FolderArchive,
  Copy,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { motion, type Variants } from "motion/react";
import { toast } from "sonner";
import { SitePageFrame } from "@/components/live/SitePageFrame";
import { ExtensionStatusBanner } from "@/components/live/ExtensionStatusBanner";
import { SplitReveal } from "@/components/live/SplitReveal";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";
import { APP_VERSION } from "@/lib/live/version";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadExtensionZip } from "@/lib/live/download-extension";
import "@/styles/landing-download.css";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Extensão · Pitch AI" },
      {
        name: "description",
        content:
          "Baixe a extensão oficial do Pitch AI para Chrome e Chromium. Instale em menos de 2 minutos de forma super simples.",
      },
      { property: "og:title", content: "Download Extensão · Pitch AI" },
      {
        property: "og:description",
        content: "Baixe a extensão oficial do Pitch AI para Chrome.",
      },
    ],
  }),
  component: DownloadPage,
});

/* ============================================================
   OS QUATRO WIDGETS DA GRADE

   Na referência cada bloco da grade carrega um Lottie abstrato; aqui o
   desenho é SVG e o que ele mostra é o próprio passo da instalação — o
   arquivo caindo, a janela do Chrome, a chave virando, a pasta recebendo a
   extensão. Traço fino em `currentColor`, laço curto e lento: quem olha
   entende o passo antes de ler o título.
   ============================================================ */

/** expo.out — o mesmo easing com que a referência abre os widgets */
const EXPO_OUT: [number, number, number, number] = [0.19, 1, 0.22, 1];

/* `view-item="from-center"`: o widget entra crescendo de 0.6 em 2s.
   Sob movimento reduzido a animação continua existindo e só perde a duração —
   trocar a prop por `undefined` deixaria no DOM o `opacity: 0` que o Motion
   já escreveu no primeiro render. */
const fromCenter = (reduce: boolean): Variants => ({
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: reduce
      ? { duration: 0 }
      : { scale: { duration: 2, ease: EXPO_OUT }, opacity: { duration: 0.2 } },
  },
});

/** giro contínuo dos aros de fundo */
function Spin({ dur, still, children }: { dur: number; still: boolean; children: ReactNode }) {
  return (
    <motion.g
      style={{ transformOrigin: "center", transformBox: "fill-box" }}
      animate={{ rotate: still ? 0 : 360 }}
      transition={still ? { duration: 0 } : { duration: dur, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.g>
  );
}

const loop = (dur: number, still: boolean) =>
  still ? { duration: 0 } : { duration: dur, repeat: Infinity, ease: "easeInOut" as const };

/** 1 — o arquivo desce para a bandeja de downloads */
function WidgetDownload({ still }: { still: boolean }) {
  return (
    <svg viewBox="0 0 200 180" fill="none" aria-hidden="true">
      <Spin dur={44} still={still}>
        <circle
          cx="100"
          cy="90"
          r="74"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 11"
          opacity="0.22"
        />
      </Spin>
      <rect
        x="62"
        y="16"
        width="76"
        height="74"
        rx="14"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.6"
      />
      <path
        d="M80 42h40M80 60h26"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.4"
      />
      <motion.g animate={{ y: still ? 0 : [0, 9, 0] }} transition={loop(2.4, still)}>
        <path d="M100 98v30" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M88 118l12 12 12-12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.g>
      <path
        d="M54 142v14a12 12 0 0 0 12 12h68a12 12 0 0 0 12-12v-14"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.65"
      />
    </svg>
  );
}

/** 2 — a janela do Chrome aberta em chrome://extensions */
function WidgetBrowser({ still }: { still: boolean }) {
  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden="true">
      <rect
        x="14"
        y="18"
        width="212"
        height="144"
        rx="16"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.6"
      />
      <path d="M14 52h212" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="34" cy="35" r="3.5" fill="currentColor" opacity="0.45" />
      <circle cx="48" cy="35" r="3.5" fill="currentColor" opacity="0.45" />
      <circle cx="62" cy="35" r="3.5" fill="currentColor" opacity="0.45" />
      <rect
        x="80"
        y="26"
        width="132"
        height="18"
        rx="9"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.4"
      />
      <path
        d="M92 35h74"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      <motion.rect
        x="172"
        y="29"
        width="1.6"
        height="12"
        fill="currentColor"
        opacity="1"
        initial={false}
        animate={{ opacity: still ? 1 : [1, 0, 1] }}
        transition={still ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: "linear" }}
      />
      <rect
        x="34"
        y="70"
        width="80"
        height="34"
        rx="9"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.3"
      />
      <rect
        x="126"
        y="70"
        width="80"
        height="34"
        rx="9"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.3"
      />
      <motion.rect
        x="34"
        y="116"
        width="80"
        height="34"
        rx="9"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.35"
        initial={false}
        animate={{ opacity: still ? 0.8 : [0.35, 0.9, 0.35] }}
        transition={loop(2.8, still)}
      />
      <rect
        x="126"
        y="116"
        width="80"
        height="34"
        rx="9"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.3"
      />
    </svg>
  );
}

/** 3 — a chave do modo desenvolvedor indo e voltando */
function WidgetToggle({ still }: { still: boolean }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" aria-hidden="true">
      <Spin dur={38} still={still}>
        <circle
          cx="100"
          cy="70"
          r="60"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 11"
          opacity="0.2"
        />
      </Spin>
      <rect
        x="38"
        y="42"
        width="124"
        height="56"
        rx="28"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.6"
      />
      {/* `initial={false}` + `cx` como atributo: sem os dois o primeiro render
          escreve `cx="undefined"` — o Motion ainda não resolveu o primeiro
          quadro — e o Chrome registra o erro no console */}
      <motion.circle
        cx="68"
        cy="70"
        r="19"
        fill="currentColor"
        initial={false}
        animate={{
          cx: still ? 132 : [68, 132, 132, 68],
          opacity: still ? 0.9 : [0.5, 0.95, 0.95, 0.5],
        }}
        transition={
          still
            ? { duration: 0 }
            : { duration: 5, times: [0, 0.28, 0.76, 1], repeat: Infinity, ease: "easeInOut" }
        }
      />
      <path
        d="M100 20v-8M148 34l6-6M52 34l-6-6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

/** 4 — a extensão descendo para dentro da pasta */
function WidgetFolder({ still }: { still: boolean }) {
  return (
    <svg viewBox="0 0 190 175" fill="none" aria-hidden="true">
      <motion.g
        opacity="0.55"
        initial={false}
        animate={{ y: still ? 0 : [-6, 6, -6], opacity: still ? 0.9 : [0.55, 1, 0.55] }}
        transition={loop(3, still)}
      >
        <rect
          x="72"
          y="12"
          width="46"
          height="46"
          rx="12"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="86" cy="29" r="2.6" fill="currentColor" opacity="0.7" />
        <circle cx="104" cy="29" r="2.6" fill="currentColor" opacity="0.7" />
        <circle cx="86" cy="45" r="2.6" fill="currentColor" opacity="0.7" />
        <circle cx="104" cy="45" r="2.6" fill="currentColor" opacity="0.7" />
      </motion.g>
      <path
        d="M24 78h44l13 15h85v60a11 11 0 0 1-11 11H35a11 11 0 0 1-11-11z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.65"
      />
      <path d="M24 110h142" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}

/* ============================================================
   A GRADE
   Quatro blocos separados por linhas finas, no arranjo da referência: duas
   colunas altas (widget e texto empilhados) e uma terceira, mais larga,
   partida em duas faixas com o widget ao lado do texto.
   ============================================================ */

type Bloco = {
  slot: 1 | 2 | 3 | 4;
  step: string;
  title: string;
  desc: string;
  Widget: (props: { still: boolean }) => ReactNode;
  /** na referência o segundo bloco inverte a ordem: texto em cima, widget embaixo */
  widgetFirst: boolean;
  extra?: ReactNode;
};

function Widget({
  slot,
  Shape,
  reduce,
}: {
  slot: number;
  Shape: (props: { still: boolean }) => ReactNode;
  reduce: boolean;
}) {
  return (
    <div className={`dlg-widget s${slot}`}>
      <div className={`dlg-glow s${slot}`} aria-hidden="true" />
      <motion.div
        className="dlg-widget-art"
        variants={fromCenter(reduce)}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        <Shape still={reduce} />
      </motion.div>
    </div>
  );
}

function Texto({ slot, step, title, desc, extra }: Omit<Bloco, "Widget" | "widgetFirst">) {
  return (
    <div className={`dlg-text s${slot}`}>
      <div className="dlg-step">{step}</div>
      <SplitReveal as="h3" className="dlg-title" text={title} preset="from-down-blur" />
      <SplitReveal as="p" className="dlg-desc" text={desc} preset="from-down-blur" />
      {extra}
    </div>
  );
}

function DownloadPage() {
  const [showUnzipHelp, setShowUnzipHelp] = useState(false);
  const reduce = useReducedMotionSafe();

  const handleDownload = async () => {
    try {
      await downloadExtensionZip();
      toast.success("Download iniciado!", {
        description: "Confira a pasta 'Downloads' do seu computador.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao baixar a extensão");
    }
  };

  const copyChromeUrl = async () => {
    const copied = await copyToClipboard("chrome://extensions");
    if (copied) {
      toast.success("Endereço 'chrome://extensions' copiado!", {
        description: "Cole na barra de endereço de uma nova aba do Chrome.",
      });
    } else {
      toast.error("Não consegui copiar", {
        description: "Digite chrome://extensions na barra de endereços do Chrome.",
      });
    }
  };

  const BLOCOS: Bloco[] = [
    {
      slot: 1,
      step: "Passo 1",
      title: "Baixe o arquivo da extensão",
      desc: "O .zip oficial vai direto para a sua pasta Downloads — é o botão roxo aqui em cima.",
      Widget: WidgetDownload,
      widgetFirst: true,
    },
    {
      slot: 2,
      step: "Passo 2",
      title: "Abra a página de extensões",
      desc: "Numa aba nova do Chrome, cole chrome://extensions na barra de endereço.",
      Widget: WidgetBrowser,
      widgetFirst: false,
      extra: (
        <button onClick={copyChromeUrl} className="btn btn-outline dlg-copy">
          <Copy /> Copiar chrome://extensions
        </button>
      ),
    },
    {
      slot: 3,
      step: "Passo 3",
      title: "Ligue o modo desenvolvedor",
      desc: "A chave fica no canto superior direito da própria página de extensões.",
      Widget: WidgetToggle,
      widgetFirst: true,
    },
    {
      slot: 4,
      step: "Passo 4",
      title: "Carregue a pasta extraída",
      desc: "Clique em “Carregar sem compactação” e escolha a pasta. Pronto — a Pitch AI já aparece no Chrome.",
      Widget: WidgetFolder,
      widgetFirst: true,
    },
  ];

  return (
    <SitePageFrame>
      <div className="wrap">
        {/* Banner de verificação do status da extensão */}
        <div className="dl-banner">
          <ExtensionStatusBanner />
        </div>

        <header className="sec-head">
          <div className="badge">
            <b>
              <Globe style={{ width: 11, height: 11 }} /> Compatível
            </b>
            <span>Google Chrome, Edge, Brave e Opera</span>
          </div>
          <h1>
            Instalar o Pitch AI é <em className="h1-serif">Muito Fácil</em>
          </h1>
          <p>
            Desenvolvido para qualquer pessoa conseguir usar em menos de 2 minutos, sem complicação.
          </p>
        </header>

        {/* Card de download principal */}
        <div className="card dl-hero">
          <div className="dl-file">
            <span className="dl-file-ic">
              <FolderArchive />
            </span>
            <div>
              <div className="dl-file-name">
                pitchai-extension.zip <span className="dl-pill">Pronto</span>
              </div>
              <div className="dl-tags">
                <span className="dl-pill">v{APP_VERSION}</span>
                <span>Extensão Oficial</span>
                <span className="dl-safe">
                  <ShieldCheck /> 100% Seguro
                </span>
              </div>
            </div>
          </div>

          <button onClick={handleDownload} className="btn btn-primary btn-lg btn-glow">
            <Download style={{ width: 16, height: 16 }} />
            1. Baixar Arquivo da Extensão
          </button>
        </div>

        {/* Passo a passo */}
        <section className="site-page-more">
          <div className="sec-head">
            <div className="eyebrow">Instalação</div>
            <h2>Passo a passo para pessoas leigas em tecnologia</h2>
          </div>

          <button
            type="button"
            onClick={() => setShowUnzipHelp((v) => !v)}
            className="btn btn-outline dl-help-btn"
          >
            <HelpCircle />
            Como extrair o arquivo .zip?
            <ChevronDown className={`dl-help-chev${showUnzipHelp ? " is-open" : ""}`} />
          </button>

          {showUnzipHelp && (
            <div className="card dl-help">
              <h3>💡 Como extrair o arquivo .zip em 2 cliques:</h3>
              <p>
                <b>No Windows:</b> Vá na sua pasta &quot;Downloads&quot;, clique com o{" "}
                <b>botão direito do mouse</b> no arquivo <code>pitchai-extension.zip</code> e
                escolha <b>Extrair Tudo...</b> e depois clique em <b>Extrair</b>.
              </p>
              <p>
                <b>No Mac (Apple):</b> Dê 2 cliques no arquivo <code>pitchai-extension.zip</code>.
                Uma nova pasta Amarela com o mesmo nome aparecerá ao lado.
              </p>
            </div>
          )}

          <div className="dlg-list">
            {BLOCOS.map(({ Widget: Shape, widgetFirst, ...bloco }) => (
              <div key={bloco.slot} className={`dlg-item s${bloco.slot}`}>
                {widgetFirst ? (
                  <>
                    <Widget slot={bloco.slot} Shape={Shape} reduce={reduce} />
                    <Texto {...bloco} />
                  </>
                ) : (
                  <>
                    <Texto {...bloco} />
                    <Widget slot={bloco.slot} Shape={Shape} reduce={reduce} />
                  </>
                )}
                {bloco.slot === 3 ? <div className="dlg-rule-h" aria-hidden="true" /> : null}
              </div>
            ))}
            <div className="dlg-rule-v v1" aria-hidden="true" />
            <div className="dlg-rule-v v2" aria-hidden="true" />
          </div>

          <div className="card dl-next">
            <p>
              <strong>Próximo Passo:</strong> Agora que você baixou a extensão, acesse o{" "}
              <Link to="/app">Painel Web do Pitch AI</Link> para configurar a voz e seus produtos.
            </p>
          </div>
        </section>
      </div>
    </SitePageFrame>
  );
}

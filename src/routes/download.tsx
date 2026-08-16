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
import { useState } from "react";
import { toast } from "sonner";
import { SitePageFrame } from "@/components/live/SitePageFrame";
import { ExtensionStatusBanner } from "@/components/live/ExtensionStatusBanner";
import { APP_VERSION } from "@/lib/live/version";
import { copyToClipboard } from "@/lib/clipboard";
import { downloadExtensionZip } from "@/lib/live/download-extension";

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

function DownloadPage() {
  const [showUnzipHelp, setShowUnzipHelp] = useState(false);

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

          <div className="feat dl-steps">
            <article className="card">
              <div className="step-n">1</div>
              <div className="card-tag">Download</div>
              <h3>Baixe o Arquivo</h3>
              <p>
                Clique no botão Roxo &quot;1. Baixar Arquivo da Extensão&quot; acima. O arquivo será
                salvo na sua pasta Downloads.
              </p>
            </article>

            <article className="card">
              <div className="step-n">2</div>
              <div className="card-tag">Aba do Chrome</div>
              <h3>Abra a Página de Extensões</h3>
              <p>
                Abra uma nova aba e digite <b>chrome://extensions</b> na barra de endereço (onde
                você digita os sites).
              </p>
              <button onClick={copyChromeUrl} className="btn btn-outline">
                <Copy /> Copiar chrome://extensions
              </button>
            </article>

            <article className="card">
              <div className="step-n">3</div>
              <div className="card-tag">Ativar</div>
              <h3>Ative o &quot;Modo Desenvolvedor&quot;</h3>
              <p>
                No canto superior direito da tela do Chrome, clique na chave para ativar o{" "}
                <b>Modo do desenvolvedor</b>.
              </p>
            </article>

            <article className="card">
              <div className="step-n">4</div>
              <div className="card-tag">Carregar</div>
              <h3>Carregue a Pasta</h3>
              <p>
                Clique no botão <b>&quot;Carregar sem compactação&quot;</b> e selecione a pasta
                extraída. Pronto!
              </p>
            </article>
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

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  Check,
  Globe,
  ShieldCheck,
  FolderArchive,
  Copy,
  HelpCircle,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SiteNav } from "@/components/live/SiteNav";
import { ExtensionStatusBanner } from "@/components/live/ExtensionStatusBanner";
import { APP_VERSION } from "@/lib/live/version";

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

  const handleDownload = () => {
    fetch(`/pitchai-extension.zip?v=${APP_VERSION}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "pitchai-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success("Download iniciado!", {
          description: "Confira a pasta 'Downloads' do seu computador.",
        });
      })
      .catch((err) => toast.error(err.message));
  };

  const copyChromeUrl = () => {
    navigator.clipboard.writeText("chrome://extensions");
    toast.success("Endereço 'chrome://extensions' copiado!", {
      description: "Cole na barra de endereço de uma nova aba do Chrome.",
    });
  };

  return (
    <div className="marketing-page min-h-screen pb-16">
      <SiteNav />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 space-y-8">
        {/* Banner de Verificação do Status da Extensão */}
        <ExtensionStatusBanner />

        <div className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#7C3AED]/30 bg-[#7C3AED]/10 px-4 py-1.5 text-xs font-bold text-[#A855F7]">
            <Globe className="h-3.5 w-3.5" />
            <span>Para Google Chrome, Edge, Brave e Opera</span>
          </div>

          <h1 className="marketing-title mt-4 text-4xl sm:text-5xl">
            Instalar o Pitch AI é Muito Fácil
          </h1>
          <p className="mt-3 text-slate-400 text-sm sm:text-base">
            Desenvolvido para qualquer pessoa conseguir usar em menos de 2 minutos, sem complicação.
          </p>
        </div>

        {/* Card de Download Principal */}
        <div className="marketing-panel rounded-3xl border-[#7C3AED]/30 p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#7C3AED] text-white shadow-lg">
                <FolderArchive className="h-8 w-8" />
              </div>
              <div>
                <div className="font-display text-xl font-extrabold text-white flex items-center gap-2">
                  <span>pitchai-extension.zip</span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-400 border border-emerald-500/30">
                    Pronto
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400 font-medium">
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-purple-300 font-bold">
                    v{APP_VERSION}
                  </span>
                  <span>Extensão Oficial</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5" /> 100% Seguro
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleDownload}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#7C3AED] px-8 py-4 font-extrabold text-white shadow-lg transition-all hover:bg-[#6D28D9] hover:shadow-[0_4px_25px_rgba(124,58,237,0.5)] active:scale-95 text-sm"
            >
              <Download className="h-5 w-5" />
              <span>1. Baixar Arquivo da Extensão</span>
            </button>
          </div>
        </div>

        {/* Passo a Passo Ilustrado Simplificado */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#A855F7]" />
              <span>Passo a Passo para Pessoas Leigas em Tecnologia</span>
            </h2>
            <button
              type="button"
              onClick={() => setShowUnzipHelp((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-[#A855F7] hover:underline font-bold"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Como extrair o arquivo .zip?</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showUnzipHelp ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {/* Dica de Unzip se expandida */}
          {showUnzipHelp && (
            <div className="rounded-2xl border border-purple-500/30 bg-purple-950/40 p-5 text-xs text-purple-200 space-y-2 animate-in fade-in">
              <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                💡 Como extrair o arquivo .zip em 2 cliques:
              </h4>
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

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Passo 1 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7C3AED] text-white font-extrabold text-sm">
                  1
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Download
                </span>
              </div>
              <h3 className="font-bold text-white text-base">Baixe o Arquivo</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Clique no botão Roxo &quot;1. Baixar Arquivo da Extensão&quot; acima. O arquivo será
                salvo na sua pasta Downloads.
              </p>
            </div>

            {/* Passo 2 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7C3AED] text-white font-extrabold text-sm">
                  2
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Aba do Chrome
                </span>
              </div>
              <h3 className="font-bold text-white text-base">Abra a Página de Extensões</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Abra uma nova aba e digite <b>chrome://extensions</b> na barra de endereço (onde
                você digita os sites).
              </p>
              <button
                onClick={copyChromeUrl}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition-all"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar chrome://extensions</span>
              </button>
            </div>

            {/* Passo 3 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7C3AED] text-white font-extrabold text-sm">
                  3
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Ativar
                </span>
              </div>
              <h3 className="font-bold text-white text-base">
                Ative o &quot;Modo Desenvolvedor&quot;
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                No canto superior direito da tela do Chrome, clique na chave para ativar o{" "}
                <b>Modo do desenvolvedor</b>.
              </p>
            </div>

            {/* Passo 4 */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7C3AED] text-white font-extrabold text-sm">
                  4
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Carregar
                </span>
              </div>
              <h3 className="font-bold text-white text-base">Carregue a Pasta</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Clique no botão <b>&quot;Carregar sem compactação&quot;</b> e selecione a pasta
                extraída. Pronto!
              </p>
            </div>
          </div>
        </div>

        {/* Rodapé explicativo */}
        <div className="rounded-2xl border border-[#7C3AED]/20 bg-[#7C3AED]/10 p-5 text-xs sm:text-sm text-purple-200 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <strong className="text-white font-bold">Próximo Passo:</strong> Agora que você baixou a
            extensão, acesse o{" "}
            <Link to="/app" className="text-[#A855F7] underline font-bold">
              Painel Web do Pitch AI
            </Link>{" "}
            para configurar a voz e seus produtos.
          </div>
        </div>
      </main>
    </div>
  );
}

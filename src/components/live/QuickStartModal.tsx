import React, { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Puzzle,
  Tv,
  ShoppingBag,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Volume2,
  Zap,
  HelpCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  PartyPopper,
} from "lucide-react";
import { toast } from "sonner";
import {
  ExtensionStatusBanner,
  fireSuccessConfetti,
} from "@/components/live/ExtensionStatusBanner";
import { copyToClipboard } from "@/lib/clipboard";
import { connectSyncTokenToExtension } from "@/lib/live/extension-sync";

interface QuickStartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncToken?: string;
}

export function QuickStartModal({ open, onOpenChange, syncToken }: QuickStartModalProps) {
  const [step, setStep] = useState(1);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [accountLinked, setAccountLinked] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).pitchAiExtensionInstalled) {
      setExtensionDetected(true);
    }

    const handler = () => {
      setExtensionDetected(true);
      fireSuccessConfetti();
    };
    window.addEventListener("pitchai-extension-detected", handler);
    return () => window.removeEventListener("pitchai-extension-detected", handler);
  }, []);

  const handleLinkAccount = async () => {
    if (!syncToken) {
      toast.error("Sua chave de sincronização ainda não está pronta", {
        description: "Aguarde alguns segundos e tente novamente.",
      });
      return;
    }

    const copied = await copyToClipboard(syncToken);
    setLinkingAccount(true);
    const result = await connectSyncTokenToExtension(syncToken);
    setLinkingAccount(false);
    if (!result.ok) {
      setAccountLinked(false);
      toast.error("A extensão não confirmou a conexão", {
        description: result.message || "Atualize a extensão e tente novamente.",
      });
      return;
    }

    setAccountLinked(true);
    fireSuccessConfetti();
    toast.success("Conta do TikTok vinculada com sucesso! 🎉", {
      description: copied
        ? "Chave copiada. Seu robô Pitch AI está pronto para atuar na sua transmissão."
        : "Seu robô Pitch AI está pronto. Não consegui copiar a chave — copie manualmente pelo painel.",
    });
  };

  const handleNextStep = () => {
    setStep((s) => s + 1);
  };

  const handleFinish = () => {
    fireSuccessConfetti();
    localStorage.setItem("pitchai_quickstart_seen", "true");
    onOpenChange(false);
    toast.success("Tudo pronto! Seu robô vendedor está configurado e pronto para a live.", {
      description: "Agora basta abrir sua transmissão no TikTok Shop.",
    });
  };

  const copyChromeUrl = async () => {
    const copied = await copyToClipboard("chrome://extensions");
    if (copied) {
      toast.success("Endereço 'chrome://extensions' copiado!", {
        description: "Cole em uma nova aba do Chrome para abrir suas extensões.",
      });
    } else {
      toast.error("Não consegui copiar", {
        description: "Digite chrome://extensions na barra de endereços do Chrome.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-purple-500/30 bg-[#0E061F] text-slate-100 p-0 overflow-hidden shadow-2xl">
        {/* Banner Superior com Gradiente e Progresso */}
        <div className="bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#C084FC] p-6 text-white relative">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full w-fit backdrop-blur-md mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Guia do Iniciante • Passo {step} de 3</span>
          </div>

          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="font-display text-2xl font-extrabold text-white tracking-tight">
              {step === 1 && "1. Instale seu Assistente de Live no Chrome"}
              {step === 2 && "2. Conecte sua Conta do TikTok Shop"}
              {step === 3 && "3. Deixe a IA Vender por Você na Live!"}
            </DialogTitle>
            <DialogDescription className="text-purple-100 text-xs sm:text-sm">
              {step === 1 &&
                "Sem termos técnicos complicados: é como instalar um aplicativo no seu navegador em 1 minuto."}
              {step === 2 &&
                "Como conectar o Pitch AI à sua tela de transmissão do TikTok sem precisar de senhas."}
              {step === 3 &&
                "Sua voz realista, vitrine e respostas automáticas configuradas para dobrar suas vendas."}
            </DialogDescription>
          </DialogHeader>

          {/* Barra de Progresso */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
            <div
              className="h-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Conteúdo dos Passos */}
        <div className="p-6 space-y-6">
          {/* PASSO 1: INSTALAÇÃO DA EXTENSÃO */}
          {step === 1 && (
            <div className="space-y-4">
              <ExtensionStatusBanner syncToken={syncToken} />

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Puzzle className="h-4 w-4 text-[#A855F7]" />
                  <span>3 Passos Super Simples para Instalar:</span>
                </h4>

                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-xl bg-black/40 p-3 border border-white/10 space-y-1">
                    <span className="font-bold text-[#A855F7]">1. Clique em Baixar</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Baixe o arquivo <b>.ZIP</b> para o seu computador.
                    </p>
                  </div>

                  <div className="rounded-xl bg-black/40 p-3 border border-white/10 space-y-1">
                    <span className="font-bold text-[#A855F7]">2. Descompacte</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Clique com o botão direito no arquivo e selecione <b>Extrair Tudo</b>.
                    </p>
                  </div>

                  <div className="rounded-xl bg-black/40 p-3 border border-white/10 space-y-1">
                    <span className="font-bold text-[#A855F7]">3. Arraste no Chrome</span>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Acesse <b>chrome://extensions</b> e ative o <b>Modo Desenvolvedor</b>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <Button
                    asChild
                    size="sm"
                    className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold gap-1.5"
                  >
                    <Link to="/download">
                      <Zap className="h-3.5 w-3.5" />
                      <span>Baixar Extensão Agora</span>
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyChromeUrl}
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20 text-xs gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar chrome://extensions</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: CONECTAR A CONTA DO TIKTOK */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#7C3AED]/30 bg-gradient-to-br from-[#1A0B36] to-[#0E051F] p-4 text-xs text-slate-300 space-y-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm">
                  <Tv className="h-5 w-5 text-purple-400" />
                  <span>Como conectar sua live no TikTok Shop sem complicações:</span>
                </div>
                <p className="leading-relaxed">
                  Não é necessário colocar sua senha do TikTok no Pitch AI. O processo é seguro e
                  feito diretamente pelo seu navegador!
                </p>

                <ol className="space-y-2 list-decimal list-inside font-medium text-slate-200">
                  <li className="p-2 rounded-lg bg-white/5 border border-white/10">
                    Abra o painel do seu TikTok Shop (central do criador) em uma aba do Chrome.
                  </li>
                  <li className="p-2 rounded-lg bg-white/5 border border-white/10">
                    Sua extensão do Pitch AI aparecerá automaticamente como uma barrinha discreta no
                    topo da tela.
                  </li>
                  <li className="p-2 rounded-lg bg-white/5 border border-white/10">
                    Clique em <b>&quot;Conectar Live&quot;</b> e a IA começará a ler o chat e fixar
                    seus produtos automaticamente!
                  </li>
                </ol>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 text-emerald-200 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    <span>
                      {accountLinked
                        ? "Conta vinculada e pronta para transmitir!"
                        : "Sua chave de sincronização já está gerada e pronta neste navegador."}
                    </span>
                  </div>

                  {accountLinked && (
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-300 border border-emerald-500/30 shrink-0 flex items-center gap-1">
                      <PartyPopper className="h-3 w-3" /> Vinculado
                    </span>
                  )}
                </div>

                <Button
                  size="sm"
                  onClick={handleLinkAccount}
                  disabled={linkingAccount}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs gap-2 shadow"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>
                    {linkingAccount
                      ? "Validando conexão…"
                      : accountLinked
                        ? "Re-vincular Conta do TikTok Shop 🎉"
                        : "Vincular Minha Conta do TikTok Shop 🎉"}
                  </span>
                </Button>
              </div>
            </div>
          )}

          {/* PASSO 3: TUDO PRONTO PARA VENDER */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <Volume2 className="h-4 w-4 text-purple-400" />
                    <span>Voz Humana e Realista</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Sua IA fala frases chamativas com entonação natural para prender a atenção do
                    público da sua live.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <ShoppingBag className="h-4 w-4 text-emerald-400" />
                    <span>Vitrine Inteligente</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    A IA troca o produto em destaque na tela conforme os clientes perguntam sobre
                    ele no chat.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-purple-500/30 bg-purple-950/40 p-4 text-center space-y-2">
                <h4 className="font-bold text-sm text-white">
                  🎉 Parabéns! Você está pronto para bombar suas vendas.
                </h4>
                <p className="text-xs text-purple-200 leading-relaxed">
                  Caso precise rever estas instruções mais tarde, você pode clicar no botão{" "}
                  <b>&quot;Guia Rápido&quot;</b> no topo do painel a qualquer momento.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Botões de Navegação */}
        <div className="border-t border-white/10 bg-black/40 p-4 flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 text-xs gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <Button
                size="sm"
                onClick={handleNextStep}
                className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs gap-1.5 shadow"
              >
                <span>Próximo Passo</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleFinish}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Concluir e Ir para o Painel</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

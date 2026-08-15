import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  Zap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import confetti from "canvas-confetti";
import { copyToClipboard } from "@/lib/clipboard";

export function fireSuccessConfetti() {
  try {
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.6 },
      colors: ["#7C3AED", "#00E676", "#A855F7", "#F59E0B", "#3B82F6", "#EC4899"],
    });
  } catch (e) {
    console.log("Confetti trigger", e);
  }
}

export function ExtensionStatusBanner({ syncToken }: { syncToken?: string }) {
  // Começa em false para o HTML do servidor bater com o do cliente; a detecção
  // real acontece no efeito abaixo (ler window aqui causa erro de hidratação).
  const [installed, setInstalled] = useState<boolean>(false);
  const [synced, setSynced] = useState<boolean>(false);

  useEffect(() => {
    // Já instalada quando a tela abriu: reflete sem comemorar.
    if ((window as any).pitchAiExtensionInstalled) setInstalled(true);

    function handleDetected() {
      setInstalled(true);
      fireSuccessConfetti();
    }

    function handleMessage(event: MessageEvent) {
      // Valida origem: aceita só a própria janela (mesmo origin).
      // Evita que iframes/scripts de terceiros falsifiquem a confirmação.
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "PITCHAI_SYNC_TOKEN_SUCCESS") {
        setSynced(true);
        fireSuccessConfetti();
        toast.success("Sincronização concluída com a extensão!");
      }
    }

    window.addEventListener("pitchai-extension-detected", handleDetected);
    window.addEventListener("message", handleMessage);

    // Polling para detectar a flag injetada pela extensão.
    // Para assim que detectada (evita polling infinito em SPA).
    const interval = setInterval(() => {
      if ((window as any).pitchAiExtensionInstalled) {
        setInstalled((prev) => {
          if (!prev) fireSuccessConfetti();
          return true;
        });
        clearInterval(interval);
      }
    }, 1500);

    return () => {
      window.removeEventListener("pitchai-extension-detected", handleDetected);
      window.removeEventListener("message", handleMessage);
      clearInterval(interval);
    };
  }, []);

  const handleCopyChromeUrl = async () => {
    const copied = await copyToClipboard("chrome://extensions");
    if (copied) {
      toast.success("Endereço 'chrome://extensions' copiado!", {
        description: "Abra uma nova aba no Chrome, cole na barra de endereço e pressione Enter.",
      });
    } else {
      toast.error("Não consegui copiar", {
        description: "Digite chrome://extensions na barra de endereços do Chrome.",
      });
    }
  };

  const handleAutoSync = async () => {
    if (!syncToken) {
      toast.error("Você precisa estar conectado para obter seu código de sincronização.");
      return;
    }

    // Target = própria origin (não "*" — evita broadcast para iframes de terceiros).
    window.postMessage({ type: "PITCHAI_SYNC_TOKEN", token: syncToken }, window.location.origin);
    const copied = await copyToClipboard(syncToken);

    // Sucesso de verdade é quando a extensão responde PITCHAI_SYNC_TOKEN_SUCCESS
    // (tratado no efeito acima). Aqui só confirmamos o envio.
    toast.info("Pedido de conexão enviado para a extensão…", {
      description: copied
        ? "O código também foi copiado, caso precise colar manualmente."
        : "Se a extensão não responder, copie o código pelo painel e cole nela.",
    });
  };

  return (
    <Card
      className={`p-4 border transition-all overflow-hidden max-w-full min-w-0 ${
        installed
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
          : "border-amber-500/40 bg-amber-500/10 text-amber-100"
      }`}
    >
      <div className="flex flex-col gap-3 min-w-0 w-full">
        <div className="flex items-start gap-3 min-w-0">
          {installed ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <AlertCircle className="h-6 w-6" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-display text-sm font-bold text-white">
              {installed ? (
                <>
                  <span className="break-words">Extensão do Pitch AI Instalada</span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-extrabold text-emerald-300 border border-emerald-500/30 shrink-0">
                    Ativa
                  </span>
                </>
              ) : (
                <>
                  <span className="break-words">Extensão Acompanhante não Detectada</span>
                  <span className="rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-extrabold text-amber-300 border border-amber-500/30 shrink-0">
                    Pendente
                  </span>
                </>
              )}
            </div>

            <p className="mt-1 text-xs text-slate-300 leading-relaxed break-words">
              {installed
                ? "Sua extensão está conectada a este navegador. Você pode iniciar sua live no TikTok Shop normalmente."
                : "A extensão é necessária para ler o chat e fixar produtos no TikTok Shop. Leva menos de 2 minutos para instalar."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
          {!installed ? (
            <>
              <Button
                asChild
                size="sm"
                className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold gap-1.5 shadow max-w-full"
              >
                <Link to="/download">
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Baixar Extensão</span>
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyChromeUrl}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 text-xs gap-1 max-w-full"
              >
                <Copy className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Copiar chrome://extensions</span>
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleAutoSync}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow max-w-full"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {synced ? "Re-sincronizar Conexão" : "Conectar em 1 Clique"}
              </span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

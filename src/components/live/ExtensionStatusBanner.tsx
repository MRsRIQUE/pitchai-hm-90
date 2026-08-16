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
import { connectSyncTokenToExtension } from "@/lib/live/extension-sync";

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
  const [installed, setInstalled] = useState<boolean>(() => {
    return (
      typeof window !== "undefined" &&
      (Boolean((window as any).pitchAiExtensionInstalled) ||
        Boolean(document.documentElement.getAttribute("data-pitchai-extension")))
    );
  });
  const [synced, setSynced] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);

  useEffect(() => {
    function handleDetected() {
      setInstalled(true);
      fireSuccessConfetti();
    }

    window.addEventListener("pitchai-extension-detected", handleDetected);

    // Polling para detectar a flag injetada pela extensão.
    // Para assim que detectada (evita polling infinito em SPA).
    const interval = setInterval(() => {
      if (
        (window as any).pitchAiExtensionInstalled ||
        document.documentElement.getAttribute("data-pitchai-extension")
      ) {
        setInstalled((prev) => {
          if (!prev) fireSuccessConfetti();
          return true;
        });
        clearInterval(interval);
      }
    }, 1500);

    return () => {
      window.removeEventListener("pitchai-extension-detected", handleDetected);
      clearInterval(interval);
    };
  }, []);

  const handleCopyChromeUrl = () => {
    navigator.clipboard.writeText("chrome://extensions");
    toast.success("Endereço 'chrome://extensions' copiado!", {
      description: "Abra uma nova aba no Chrome, cole na barra de endereço e pressione Enter.",
    });
  };

  const handleAutoSync = async () => {
    if (!syncToken) {
      toast.error("Você precisa estar conectado para obter seu código de sincronização.");
      return;
    }

    setSyncing(true);
    const result = await connectSyncTokenToExtension(syncToken);
    setSyncing(false);
    if (!result.ok) {
      setSynced(false);
      toast.error("Não foi possível conectar a extensão", {
        description: result.message || "Atualize a extensão e tente novamente.",
      });
      return;
    }

    setSynced(true);
    fireSuccessConfetti();
    toast.success("Conta sincronizada com sucesso! 🎉", {
      description: result.aiLocked
        ? "Conexão salva. A cota de IA está pausada, mas os controles da live continuam disponíveis."
        : "Token validado e salvo pela extensão. Os controles da live já estão liberados.",
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
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300 border border-emerald-500/30 shrink-0">
                    Ativa
                  </span>
                </>
              ) : (
                <>
                  <span className="break-words">Extensão Acompanhante não Detectada</span>
                  <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-extrabold text-amber-300 border border-amber-500/30 shrink-0">
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
              disabled={syncing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow max-w-full"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {syncing
                  ? "Validando conexão…"
                  : synced
                    ? "Re-sincronizar Conexão"
                    : "Conectar em 1 Clique"}
              </span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Video,
  VideoOff,
  Upload,
  Camera,
  MonitorUp,
  CircleStop,
  Radio,
  Timer,
  Download,
  CalendarClock,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Source = "camera" | "tela" | "arquivo";

const fmt = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/**
 * Player isolado: só re-renderiza quando a fonte/estado da live muda.
 * O cronômetro (1x por segundo) fica fora daqui, senão derruba frames.
 */
const LiveVideoPreview = memo(function LiveVideoPreview({
  videoRef,
  ready,
  live,
  monitor,
}: {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  ready: boolean;
  live: boolean;
  monitor: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl border bg-black/60",
        live ? "border-destructive/60" : "border-border/60",
      )}
      style={{ contain: "paint" }}
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted={!monitor}
        className="h-full w-full object-contain"
      />
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          <VideoOff className="h-6 w-6" />
          <span className="text-xs">Nenhuma fonte selecionada</span>
        </div>
      )}
    </div>
  );
});

export function LiveStudioCard({ compact = false }: { compact?: boolean } = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileUrlRef = useRef<string | null>(null);

  const [source, setSource] = useState<Source>("camera");
  const [fileName, setFileName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [autoStop, setAutoStop] = useState(false);
  const [autoStopMin, setAutoStopMin] = useState(60);
  const [gravar, setGravar] = useState(true);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [agendar, setAgendar] = useState(false);
  const [agendadoEm, setAgendadoEm] = useState<string>("");
  const [agora, setAgora] = useState(() => Date.now());
  const [virtualCam, setVirtualCam] = useState<string | null>(null);
  const [monitor, setMonitor] = useState(false);

  const detectVirtualCam = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cam = devs.find(
        (d) => d.kind === "videoinput" && /obs|virtual|manycam|droidcam/i.test(d.label),
      );
      setVirtualCam(cam?.label ?? null);
    } catch {
      setVirtualCam(null);
    }
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    void detectVirtualCam();
    navigator.mediaDevices.addEventListener?.("devicechange", detectVirtualCam);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", detectVirtualCam);
  }, []);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopTracks();
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
    };
  }, []);

  // Cronômetro + parada automática

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (!live || !autoStop) return;
    if (elapsed >= autoStopMin * 60) {
      stopLive(true);
    }
  }, [elapsed, live, autoStop, autoStopMin]);

  const attach = useCallback(async (stream: MediaStream) => {
    stopTracks();
    streamRef.current = stream;
    const el = videoRef.current;
    if (el) {
      // só troca o srcObject quando o stream realmente mudou — reatribuir derruba frames
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        el.removeAttribute("src");
      }
      el.loop = false;
      await el.play().catch(() => undefined);
    }
    setReady(true);
  }, []);

  const useCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });
      setSource("camera");
      setFileName(null);
      await attach(stream);
      toast.success("Câmera conectada");
    } catch {
      toast.error("Não foi possível acessar a câmera");
    }
  };

  const useScreen = async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: true,
      });
      // "motion" prioriza fluidez em vez de nitidez — evita travar a captura de tela
      stream.getVideoTracks().forEach((t: MediaStreamTrack) => {
        try {
          (t as MediaStreamTrack & { contentHint?: string }).contentHint = "motion";
        } catch {
          /* noop */
        }
      });
      setSource("tela");
      setFileName(null);
      await attach(stream);
      toast.success("Tela compartilhada");
    } catch {
      toast.error("Compartilhamento de tela cancelado");
    }
  };

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      stopTracks();
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      setSource("arquivo");
      setFileName(file.name);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
        videoRef.current.loop = true;
        void videoRef.current.play().catch(() => undefined);
      }

      setReady(true);
      toast.success("Vídeo carregado");
    };
    input.click();
  };

  const startLive = async () => {
    if (!ready) {
      toast.error("Escolha primeiro a fonte de vídeo", {
        description: "Clique em Câmera, Tela ou Vídeo acima.",
      });
      return;
    }
    if (!virtualCam) {
      toast.warning("Câmera virtual não detectada", {
        description:
          "O Studio vai rodar aqui, mas o TikTok só recebe o vídeo com a câmera virtual do OBS ligada.",
      });
    }
    setElapsed(0);
    setRecordingUrl(null);
    await videoRef.current?.play().catch(() => undefined);

    if (gravar) {
      try {
        const stream =
          source === "arquivo"
            ? ((videoRef.current as any)?.captureStream?.() as MediaStream | undefined)
            : (streamRef.current ?? undefined);
        if (stream) {
          chunksRef.current = [];
          const rec = new MediaRecorder(stream);
          rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
          rec.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: "video/webm" });
            setRecordingUrl(URL.createObjectURL(blob));
          };
          rec.start(1000);
          recorderRef.current = rec;
        }
      } catch {
        toast.info("Gravação indisponível para essa fonte");
      }
    }

    setLive(true);
    toast.success("Studio no ar", {
      description: virtualCam
        ? "Selecione a câmera virtual do OBS dentro do TikTok."
        : "Ligue a câmera virtual do OBS para o TikTok receber o vídeo.",
    });
  };

  const stopLive = (byTimer = false) => {
    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    } catch {
      /* noop */
    }
    recorderRef.current = null;
    videoRef.current?.pause();
    setLive(false);
    toast[byTimer ? "info" : "success"](
      byTimer ? "Live encerrada pelo temporizador" : "Live encerrada",
    );
  };

  // Relógio para o agendamento

  useEffect(() => {
    if (!agendar || live || !agendadoEm) return;
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [agendar, live, agendadoEm]);

  const agendadoTs = agendadoEm ? new Date(agendadoEm).getTime() : null;
  const faltaParaIniciar =
    agendar && agendadoTs && !live ? Math.max(0, Math.ceil((agendadoTs - agora) / 1000)) : null;

  useEffect(() => {
    if (!agendar || live || !agendadoTs) return;
    if (agora >= agendadoTs) {
      if (!ready) {
        toast.error("Live agendada, mas nenhuma fonte de vídeo foi escolhida");
        setAgendar(false);
        return;
      }
      setAgendar(false);
      void startLive();
    }
  }, [agora, agendar, live, agendadoTs, ready]);

  const restante = autoStop ? Math.max(0, autoStopMin * 60 - elapsed) : 0;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Video className="h-4 w-4 text-primary" />
          <div>
            <h2 className="font-display text-base font-bold">Studio da live</h2>
            <p className="text-xs text-muted-foreground">
              Fonte de vídeo da sua live: escolha, inicie e pare por aqui. O TikTok recebe a imagem
              pela câmera virtual.
            </p>
          </div>
        </div>
        {live && (
          <span className="flex items-center gap-1.5 rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-semibold text-destructive">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
            AO VIVO
          </span>
        )}
      </div>

      {/* Preview */}
      <div className="relative">
        <LiveVideoPreview videoRef={videoRef} ready={ready} live={live} monitor={monitor} />
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 font-mono text-xs text-white">
          {fmt(elapsed)}
          {autoStop && live && ` · resta ${fmt(restante)}`}
        </div>
      </div>

      {/* Fontes */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant={source === "camera" ? "default" : "outline"} size="sm" onClick={useCamera}>
          <Camera className="mr-1.5 h-4 w-4" /> Câmera
        </Button>
        <Button variant={source === "tela" ? "default" : "outline"} size="sm" onClick={useScreen}>
          <MonitorUp className="mr-1.5 h-4 w-4" /> Tela
        </Button>
        <Button variant={source === "arquivo" ? "default" : "outline"} size="sm" onClick={pickFile}>
          <Upload className="mr-1.5 h-4 w-4" /> Vídeo
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Ouvir retorno</p>
            <p className="text-xs text-muted-foreground">
              Escuta o áudio da fonte no seu fone. Use fone para não gerar microfonia.
            </p>
          </div>
        </div>
        <Switch checked={monitor} onCheckedChange={setMonitor} />
      </div>
      {fileName && <p className="truncate text-xs text-muted-foreground">Arquivo: {fileName}</p>}

      {/* Agendamento */}
      {!compact && (
        <div className="space-y-3 rounded-xl border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Agendar início</span>
            </div>
            <Switch checked={agendar} onCheckedChange={setAgendar} disabled={live} />
          </div>
          {agendar && !live && (
            <div className="space-y-2">
              <Input
                type="datetime-local"
                value={agendadoEm}
                onChange={(e) => setAgendadoEm(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {faltaParaIniciar === null
                  ? "Escolha a data e a hora de início."
                  : faltaParaIniciar > 0
                    ? `A live começa em ${fmt(faltaParaIniciar)}. Deixe esta página aberta.`
                    : "Iniciando…"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Timer de encerramento */}
      {!compact && (
        <div className="space-y-3 rounded-xl border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-secondary" />
              <span className="text-sm font-medium">Duração (encerrar automaticamente)</span>
            </div>
            <Switch checked={autoStop} onCheckedChange={setAutoStop} />
          </div>
          {autoStop && (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={autoStopMin}
                onChange={(e) => setAutoStopMin(Math.max(1, Number(e.target.value) || 1))}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">minutos de live</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Gravar a live</span>
            <Switch checked={gravar} onCheckedChange={setGravar} disabled={live} />
          </div>
        </div>
      )}

      {/* Câmera virtual — como o vídeo chega no TikTok */}
      {!compact && (
        <div className="space-y-2 rounded-xl border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MonitorUp className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Enviar para o TikTok</span>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                virtualCam ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {virtualCam ? "câmera virtual pronta" : "câmera virtual não detectada"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            O navegador não envia vídeo direto para o TikTok. Use uma câmera virtual — o TikTok
            enxerga ela como se fosse uma webcam.
          </p>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Instale o OBS Studio (gratuito, Windows e Mac).</li>
            <li>No OBS, adicione a fonte "Captura de janela" e escolha esta aba do Pitch AI.</li>
            <li>Clique em "Iniciar câmera virtual" no canto inferior direito do OBS.</li>
            <li>Aqui no Studio, escolha sua fonte e clique em "Iniciar live".</li>
            <li>No TikTok, selecione a câmera "OBS Virtual Camera" como entrada de vídeo.</li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" asChild>
              <a href="https://obsproject.com/download" target="_blank" rel="noreferrer">
                <Download className="mr-1.5 h-4 w-4" /> Baixar OBS
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(
                    [
                      "Como enviar o vídeo do Pitch AI para o TikTok:",
                      "1. Instale o OBS Studio (obsproject.com/download).",
                      "2. No OBS, adicione a fonte 'Captura de janela' e escolha a aba do Pitch AI.",
                      "3. Clique em 'Iniciar câmera virtual' no OBS.",
                      "4. No Pitch AI, escolha a fonte e clique em 'Iniciar live'.",
                      "5. No TikTok, selecione 'OBS Virtual Camera' como câmera.",
                    ].join("\n"),
                  )
                  .then(() => toast.success("Passo a passo copiado"))
                  .catch(() => toast.error("Não foi possível copiar"));
              }}
            >
              Copiar passo a passo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void detectVirtualCam()}>
              Verificar novamente
            </Button>
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap gap-2">
        {!live ? (
          <Button onClick={startLive} disabled={!ready} className="flex-1">
            <Radio className="mr-1.5 h-4 w-4" /> Iniciar live
          </Button>
        ) : (
          <Button variant="destructive" onClick={() => stopLive(false)} className="flex-1">
            <CircleStop className="mr-1.5 h-4 w-4" /> Parar live
          </Button>
        )}
        {recordingUrl && (
          <Button variant="outline" asChild>
            <a href={recordingUrl} download="pitchai-live.webm">
              <Download className="mr-1.5 h-4 w-4" /> Baixar gravação
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}

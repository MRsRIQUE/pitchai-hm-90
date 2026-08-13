/**
 * VoiceSettings - Componente para configurações de voz da IA
 * Parte do LiveDashboard
 */
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mic, AudioLines, Play, Volume2, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { VOICES, SAMPLE_PHRASE, type VoiceId } from "@/lib/live/voices";
import { aiHeaders } from "@/lib/live/ai-headers";
import { safeFetch } from "@/lib/api";

export interface VoiceSettingsProps {
  compact?: boolean;
  audioOutputs: MediaDeviceInfo[];
  audioPermGranted: boolean;
  onRequestAudioPermission: () => Promise<void>;
}

export function VoiceSettings({
  compact = false,
  audioOutputs,
  audioPermGranted,
  onRequestAudioPermission,
}: VoiceSettingsProps) {
  const { config, updateConfig, loading } = useLiveStore(
    useShallow((state) => ({
      config: state.config,
      updateConfig: state.actions.updateConfig,
      loading: state.loading,
    })),
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [testingVoice, setTestingVoice] = useState(false);

  // Função para atualizar configuração de voz
  const updateVoiceConfig = (updater: Partial<typeof config.voz>) => {
    updateConfig((c) => ({
      ...c,
      voz: { ...c.voz, ...updater },
    }));
  };

  // Testa a voz selecionada
  const testVoice = async () => {
    setTestingVoice(true);
    try {
      const headers = await aiHeaders();

      const result = await safeFetch<Blob>("/api/tts/preview", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: SAMPLE_PHRASE,
          voice: config.voz.id,
          speed: config.voz.speed,
        }),
        onError: (msg) => {
          toast.error(msg);
        },
        showToast: true,
      });

      if (!result) {
        toast.error("Falha ao gerar áudio");
        return;
      }

      const url = URL.createObjectURL(result);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = url;
        audioRef.current.volume = Math.min(1, Math.max(0, config.voz.gain));

        // Tenta definir o dispositivo de saída
        const sinkId = config.voz.outputDeviceId;
        const el = audioRef.current as HTMLAudioElement & {
          setSinkId?: (id: string) => Promise<void>;
        };
        if (sinkId && typeof el.setSinkId === "function") {
          try {
            await el.setSinkId(sinkId);
          } catch {
            toast.error("Falha ao rotear áudio para o dispositivo selecionado");
          }
        }

        await audioRef.current.play();
      }
    } catch (e) {
      toast.error("Falha ao gerar áudio", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
    } finally {
      setTestingVoice(false);
    }
  };

  if (compact) {
    return (
      <Card className="p-4">
        <h4 className="mb-3 font-semibold text-sm">Voz da IA</h4>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Voz
            </label>
            <Select
              value={config.voz.id}
              onValueChange={(v) => updateVoiceConfig({ id: v as VoiceId })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Escolha a voz" />
              </SelectTrigger>
              <SelectContent>
                {VOICES.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Velocidade</span>
              <span className="font-mono">{config.voz.speed.toFixed(2)}x</span>
            </div>
            <Slider
              min={0.7}
              max={1.2}
              step={0.05}
              value={[config.voz.speed]}
              onValueChange={([v]) => updateVoiceConfig({ speed: v })}
            />
          </div>
          <Button onClick={testVoice} disabled={testingVoice || loading.voice} className="w-full">
            <Play className="h-4 w-4" />
            {testingVoice || loading.voice ? "Gerando..." : "Testar voz"}
          </Button>
        </div>
        <audio ref={audioRef} hidden />
      </Card>
    );
  }

  return (
    <div id="sec-voz" className="scroll-mt-24 pt-2">
      <h4 className="mb-3 font-display text-sm font-semibold">
        Voz da IA
        <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
          troca em tempo real, sem reiniciar a live
        </span>
      </h4>

      <Card className="p-4">
        {/* Seleção de voz */}
        <div className="grid gap-3 sm:grid-cols-2">
          {VOICES.map((v) => (
            <button
              key={v.id}
              onClick={() => updateVoiceConfig({ id: v.id as VoiceId })}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                config.voz.id === v.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition ${
                  config.voz.id === v.id
                    ? "bg-primary text-primary-foreground ring-primary/60 shadow-[0_4px_14px_-4px_rgba(124,58,237,0.6)]"
                    : "bg-muted/60 text-muted-foreground ring-border"
                }`}
              >
                {config.voz.id === v.id ? (
                  <AudioLines className="h-[18px] w-[18px]" strokeWidth={2.4} />
                ) : (
                  <Mic className="h-[18px] w-[18px]" strokeWidth={2.2} />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{v.label}</div>
                <div className="truncate text-xs text-muted-foreground">{v.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Configurações de áudio */}
        <div className="mt-4 space-y-3">
          {/* Velocidade */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Velocidade</span>
              <span className="font-mono">{config.voz.speed.toFixed(2)}x</span>
            </div>
            <Slider
              min={0.7}
              max={1.2}
              step={0.05}
              value={[config.voz.speed]}
              onValueChange={([v]) => updateVoiceConfig({ speed: v })}
            />
          </div>

          {/* Dispositivo de saída */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Saída de áudio (para onde a IA fala)</span>
              {!audioPermGranted && audioOutputs.every((d) => !d.label) && (
                <button
                  type="button"
                  onClick={onRequestAudioPermission}
                  className="text-primary underline underline-offset-2"
                >
                  liberar dispositivos
                </button>
              )}
            </div>
            <select
              value={config.voz.outputDeviceId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                const label = audioOutputs.find((d) => d.deviceId === id)?.label ?? "";
                updateVoiceConfig({
                  outputDeviceId: id || undefined,
                  outputDeviceLabel: label || undefined,
                });
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Padrão do sistema</option>
              {audioOutputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Dispositivo ${d.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Selecione o cabo virtual (VB-Cable / BlackHole) para mandar a voz da IA direto ao
              microfone da live.
            </p>
          </div>

          {/* Volume da IA */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Volume da IA</span>
              <span className="font-mono">{Math.round(config.voz.gain * 100)}%</span>
            </div>
            <Slider
              min={0}
              max={2}
              step={0.05}
              value={[config.voz.gain]}
              onValueChange={([v]) => updateVoiceConfig({ gain: v })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Ajuste separado do sistema. Acima de 100% amplifica; use com moderação.
            </p>
          </div>

          {/* Push-to-talk */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-semibold text-sm">Push-to-talk</div>
                <p className="text-[11px] text-muted-foreground">
                  Segure a tecla para silenciar a IA enquanto você fala.
                </p>
              </div>
              <Switch
                checked={config.voz.pushToTalk.enabled}
                onCheckedChange={(v) =>
                  updateVoiceConfig({
                    pushToTalk: { ...config.voz.pushToTalk, enabled: v },
                  })
                }
              />
            </div>
            {config.voz.pushToTalk.enabled && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Tecla:</span>
                <select
                  value={config.voz.pushToTalk.key}
                  onChange={(e) =>
                    updateVoiceConfig({
                      pushToTalk: { ...config.voz.pushToTalk, key: e.target.value },
                    })
                  }
                  className="rounded border border-border bg-background px-2 py-1"
                >
                  <option value="Space">Espaço</option>
                  <option value="AltLeft">Alt esquerdo</option>
                  <option value="ControlLeft">Ctrl esquerdo</option>
                  <option value="ShiftLeft">Shift esquerdo</option>
                  <option value="Backquote">` (crase)</option>
                </select>
              </div>
            )}
          </div>

          {/* Botão de teste de voz */}
          <Button
            onClick={testVoice}
            disabled={testingVoice || loading.voice}
            className="w-full sm:w-auto"
          >
            <Play className="h-4 w-4" />
            {testingVoice || loading.voice ? "Gerando áudio..." : "Testar voz"}
          </Button>
        </div>

        <audio ref={audioRef} hidden />
      </Card>
    </div>
  );
}

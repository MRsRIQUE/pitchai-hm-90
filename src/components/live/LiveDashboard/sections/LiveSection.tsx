import { Timer } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { LiveStudioCard } from "../../LiveStudioCard";
import { DemoModeCard } from "../../DemoModeCard";

/**
 * A seção da transmissão em si.
 *
 * Esta é a única view que fica montada o tempo todo (o container só esconde
 * com CSS): o Studio segura a stream da câmera/tela e a gravação em andamento,
 * e desmontar no meio de uma live derrubaria as duas. O modo demonstração, ao
 * contrário, só monta quando a seção está à vista — ele tem simulação própria
 * e não faz sentido rodando escondido.
 */
export function LiveSection({ ativa, simples }: { ativa: boolean; simples: boolean }) {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();

  const setEncerrar = (patch: Partial<typeof config.encerrarTempo>) =>
    updateConfig((c) => ({ ...c, encerrarTempo: { ...c.encerrarTempo, ...patch } }));

  return (
    <>
      <div className="app-section">
        <LiveStudioCard compact={simples} />
      </div>

      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h2
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <Timer aria-hidden="true" />
                </span>
                Encerrar por tempo
              </h2>
              <p className="app-card-desc">
                Encerra a live sozinho ao atingir o tempo definido — contado pelo cronômetro real, a
                partir do início da live.
              </p>
            </div>
            <Switch
              checked={config.encerrarTempo.enabled}
              onCheckedChange={(enabled) => setEncerrar({ enabled })}
            />
          </div>

          {config.encerrarTempo.enabled ? (
            <div className="app-field" style={{ maxWidth: 200 }}>
              <label htmlFor="encerrar-minutos">Duração máxima (minutos)</label>
              <input
                id="encerrar-minutos"
                className="app-input"
                type="number"
                min={1}
                value={config.encerrarTempo.minutes}
                onChange={(e) => setEncerrar({ minutes: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
          ) : null}
        </div>
      </div>

      {ativa && !simples ? (
        <div className="app-section">
          <DemoModeCard cfg={config} setCfg={updateConfig} />
        </div>
      ) : null}
    </>
  );
}

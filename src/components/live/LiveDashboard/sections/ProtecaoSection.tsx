import { Eye, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { WordFilterSection } from "../WordFilterSection";

/**
 * Tudo que impede a live de cair ou a IA de falar o que não devia.
 *
 * "Confirmar antes de enviar" fica aqui, e não em Automações, porque ele não
 * liga nenhum comportamento novo — ele é o freio de mão de todos os outros.
 */
export function ProtecaoSection() {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();

  return (
    <>
      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h2
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <ShieldCheck aria-hidden="true" />
                </span>
                Proteção geral
              </h2>
              <p className="app-card-desc">
                Pode ligar agora. A IA entra sozinha assim que os campos do chat forem detectados na
                página da live.
              </p>
            </div>
            <Switch
              checked={config.protecaoGeral}
              onCheckedChange={(v) => updateConfig((c) => ({ ...c, protecaoGeral: v }))}
            />
          </div>

          <div className="app-grid app-grid--2">
            <div className="app-card app-card--flat">
              <h3 className="app-card-title">Violação</h3>
              <p className="app-card-desc">Vigia a tela e encerra a live antes de virar punição.</p>
            </div>
            <div className="app-card app-card--flat">
              <h3 className="app-card-title">Auto Moderador IA</h3>
              <p className="app-card-desc">Responde e neutraliza os comentários que atrapalham.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="app-section">
        <WordFilterSection />
      </div>

      <div className="app-section">
        <div className="app-card">
          <div className="app-card-head" style={{ marginBottom: 0 }}>
            <div>
              <h2
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <Eye aria-hidden="true" />
                </span>
                Confirmar respostas antes de enviar
              </h2>
              <p className="app-card-desc">
                Antes de responder por voz ou texto, você lê a resposta e aprova. Bom para os
                primeiros dias de live.
              </p>
            </div>
            <Switch
              checked={config.revisarAntesDeEnviar}
              onCheckedChange={(v) => updateConfig((c) => ({ ...c, revisarAntesDeEnviar: v }))}
            />
          </div>
        </div>
      </div>
    </>
  );
}

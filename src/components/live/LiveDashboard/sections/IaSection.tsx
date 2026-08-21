import { AiConfigSection } from "../AiConfigSection";
import { GeminiFeaturesPanel } from "../../GeminiFeaturesPanel";

/**
 * O "cérebro" da IA em três blocos: o contexto que ela usa em toda resposta,
 * e o laboratório para testar prompt e voz sem subir uma live de verdade.
 */
export function IaSection() {
  return (
    <>
      <div className="app-section">
        <AiConfigSection />
      </div>

      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Laboratório</h2>
        </div>
        <GeminiFeaturesPanel />
      </div>
    </>
  );
}

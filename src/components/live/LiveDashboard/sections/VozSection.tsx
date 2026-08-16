import { VoiceSettings } from "../VoiceSettings";
import { GuiaTransmissao } from "./GuiaTransmissao";

/**
 * Escolha da voz e o caminho que ela faz até o TikTok. As duas coisas juntas
 * porque o usuário que acabou de escolher a voz é exatamente quem precisa
 * descobrir que ela ainda não está saindo na live.
 */
export function VozSection({
  audioOutputs,
  audioPermGranted,
  onRequestAudioPermission,
}: {
  audioOutputs: MediaDeviceInfo[];
  audioPermGranted: boolean;
  onRequestAudioPermission: () => Promise<void>;
}) {
  return (
    <>
      <div className="app-section">
        <VoiceSettings
          audioOutputs={audioOutputs}
          audioPermGranted={audioPermGranted}
          onRequestAudioPermission={onRequestAudioPermission}
        />
      </div>

      <GuiaTransmissao />
    </>
  );
}

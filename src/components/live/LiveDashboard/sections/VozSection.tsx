import { VoiceSettings } from "../VoiceSettings";

/** Escolha e prévia da voz usada pela IA durante a live. */
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
    <div className="app-section">
      <VoiceSettings
        audioOutputs={audioOutputs}
        audioPermGranted={audioPermGranted}
        onRequestAudioPermission={onRequestAudioPermission}
      />
    </div>
  );
}

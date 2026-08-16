import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { DEFAULT_CONFIG } from "@/lib/live/config";
import { SyncTokenCard } from "../../SyncTokenCard";

/** Token da extensão, cotas do plano e a cópia de segurança da configuração. */
export function ContaSection() {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();

  const exportar = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pitchai-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Backup exportado");
  };

  const importar = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        // O spread sobre DEFAULT_CONFIG é o que salva backup antigo: as chaves
        // que ainda não existiam quando o arquivo foi gerado entram no padrão.
        updateConfig(() => ({ ...DEFAULT_CONFIG, ...parsed }));
        toast.success("Backup importado");
      } catch {
        toast.error("Arquivo inválido");
      }
    };
    input.click();
  };

  return (
    <>
      <div className="app-section">
        <SyncTokenCard />
      </div>

      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Cópia de segurança</h2>
        </div>
        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h3 className="app-card-title">Exportar ou restaurar sua configuração</h3>
              <p className="app-card-desc">
                Leva produtos, contexto da IA, roteiros e filtros para outro computador. Importar
                substitui o que está aqui.
              </p>
            </div>
          </div>
          <div className="app-toolbar" style={{ marginBottom: 0 }}>
            <button type="button" className="app-btn" onClick={exportar}>
              <Download aria-hidden="true" />
              Exportar backup
            </button>
            <button type="button" className="app-btn" onClick={importar}>
              <Upload aria-hidden="true" />
              Importar backup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

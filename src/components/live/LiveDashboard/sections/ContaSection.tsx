import { CreditCard, Download, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { getFirebaseAuth } from "@/lib/firebase";
import { DEFAULT_CONFIG } from "@/lib/live/config";
import { SyncTokenCard } from "../../SyncTokenCard";

/** Token da extensão, cotas do plano e a cópia de segurança da configuração. */
export function ContaSection() {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();
  const [abrindoPortal, setAbrindoPortal] = useState(false);

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

  const abrirPortalAssinatura = async () => {
    setAbrindoPortal(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error("sem-sessao");
      const token = await user.getIdToken();
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ returnUrl: `${window.location.origin}/app?section=conta` }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.url) {
        if (res.status === 404) {
          toast.info("Você ainda não tem assinatura ativa", {
            description: "Escolha um plano na página de planos para assinar.",
          });
          return;
        }
        throw new Error(payload?.error || "Falha ao abrir o portal.");
      }
      window.location.assign(payload.url);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "sem-sessao"
          ? error.message
          : "Não foi possível abrir o portal de assinatura.",
      );
    } finally {
      setAbrindoPortal(false);
    }
  };

  return (
    <>
      <div className="app-section">
        <SyncTokenCard />
      </div>

      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Assinatura</h2>
        </div>
        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h3 className="app-card-title">Gerenciar assinatura</h3>
              <p className="app-card-desc">
                Trocar cartão, baixar faturas ou cancelar — direto no portal seguro da Stripe.
              </p>
            </div>
            <button
              type="button"
              className="app-btn"
              onClick={() => void abrirPortalAssinatura()}
              disabled={abrindoPortal}
            >
              {abrindoPortal ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <CreditCard aria-hidden="true" />
              )}
              Gerenciar assinatura
            </button>
          </div>
        </div>
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

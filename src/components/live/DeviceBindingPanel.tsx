import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { AlertTriangle, Loader2, MonitorSmartphone, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase";
import { toast } from "sonner";

/**
 * Mostra qual navegador está com a licença e permite soltá-lo.
 *
 * A regra do produto é uma extensão por conta, e o próprio cliente desvincula —
 * no máximo uma vez a cada 24 horas. O aviso de que o outro navegador cai na
 * hora aparece ANTES da confirmação, e não depois: quem estiver no meio de uma
 * live no outro computador vai perder o acesso imediatamente, e essa surpresa
 * não pode existir.
 */

type BindingState = {
  bound: boolean;
  installShort: string | null;
  boundAt: string | null;
  lastSeenAt: string | null;
  canRelease: boolean;
  canReleaseAt: string | null;
  canReleaseAtLabel: string;
  enforced: boolean;
};

function formatMoment(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DeviceBindingPanel() {
  const [state, setState] = useState<BindingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      // Ainda não logado NESTE instante — o onAuthStateChanged abaixo chama de
      // novo quando o usuário aparecer. Sair daqui com loading:false e state:null
      // fazia o card inteiro desaparecer da tela para sempre.
      setLoading(false);
      setState(null);
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/account/device-binding", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data?.error || "Não foi possível consultar o navegador vinculado.");
        return;
      }
      setErro(null);
      setState(data as BindingState);
    } catch {
      setErro("Não foi possível consultar o navegador vinculado. Verifique sua conexão.");
    } finally {
      setLoading(false);
    }
  }, []);

  // O Firebase restaura a sessão de forma assíncrona: no primeiro render o
  // currentUser costuma ser null mesmo com o vendedor logado. Sem escutar, o
  // card só apareceria depois de um F5 com sorte de timing.
  useEffect(() => onAuthStateChanged(getFirebaseAuth(), () => void load()), [load]);

  // A extensão manda o vendedor para cá com ?desvincular=1 quando recusa a
  // instalação. Chegando por esse caminho, a confirmação já abre aberta.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("desvincular") === "1") {
      setConfirming(true);
    }
  }, []);

  async function release() {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    setBusy(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/account/device-binding", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: "release" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.message || "Não foi possível desvincular agora.");
        return;
      }
      toast.success(data?.message || "Navegador desvinculado.");
      setConfirming(false);
      await load();
    } catch {
      toast.error("Não foi possível desvincular agora. Verifique sua conexão.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        Verificando o navegador vinculado...
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
        {erro}
      </div>
    );
  }

  // Sem estado o card não some: sumir em silêncio é indistinguível de "não
  // existe trava", e foi exatamente o que aconteceu — o vendedor abria a conta
  // e não via nada sobre vínculo nenhum.
  if (!state) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-bold text-foreground">Navegador vinculado</p>
        <p className="mt-1">
          Sua conta usa a extensão em um navegador por vez. Entre na sua conta para ver e trocar o
          navegador vinculado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start gap-2">
        <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-foreground">Navegador vinculado</p>
          {state.bound ? (
            <p className="text-xs text-muted-foreground">
              Sua licença está ativa em um navegador desde {formatMoment(state.boundAt)}
              {state.installShort ? ` (instalação …${state.installShort})` : ""}. Cada conta tem
              direito a uma extensão.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nenhum navegador vinculado no momento. O próximo que abrir a extensão com o seu código
              será vinculado a ele.
            </p>
          )}
        </div>
      </div>

      {state.bound && !confirming && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={!state.canRelease || busy}
            onClick={() => setConfirming(true)}
          >
            <Unlink className="h-3.5 w-3.5" />
            Desvincular navegador
          </Button>
          {!state.canRelease && (
            <p className="text-xs text-muted-foreground">
              Você já desvinculou nas últimas 24 horas. Poderá desvincular de novo em{" "}
              <strong className="text-foreground">{state.canReleaseAtLabel}</strong>.
            </p>
          )}
        </div>
      )}

      {state.bound && confirming && (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-bold">Leia antes de confirmar</p>
              <p>
                Você só pode desvincular <strong>uma vez por dia</strong>. O outro navegador perde o
                acesso <strong>na hora</strong> — se houver uma live rodando nele, a extensão trava
                imediatamente.
              </p>
              <p>
                Depois de desvincular, abra a extensão no navegador que você quer usar: o primeiro
                que se conectar com o seu código fica com a licença.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="gap-2"
              disabled={busy || !state.canRelease}
              onClick={release}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlink className="h-3.5 w-3.5" />
              )}
              Sim, desvincular agora
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </Button>
          </div>
          {!state.canRelease && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Você já desvinculou nas últimas 24 horas. Poderá desvincular de novo em{" "}
              <strong>{state.canReleaseAtLabel}</strong>.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

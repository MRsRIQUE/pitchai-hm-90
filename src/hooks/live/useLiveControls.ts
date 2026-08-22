/**
 * Ponte painel → barra da live.
 *
 * A extensão publica o estado dela no doc compartilhado e o painel lê a cada
 * ciclo do `useVitrineSync`. Faltava o caminho de volta: um clique em
 * "Proteção" aqui só mexia no localStorage, então a barra da live nunca ficava
 * sabendo. Este hook devolve um `updateConfig` que, além de salvar local,
 * publica só as chaves de controle que mudaram.
 */
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import type { LiveConfig } from "@/lib/live/config";
import {
  LIVE_CONTROL_KEYS,
  pushLiveConfigFields,
  pushLiveControls,
  type LiveControls,
} from "@/lib/live/sync";

export type ConfigUpdater = (value: LiveConfig | ((cfg: LiveConfig) => LiveConfig)) => void;

/** Só as chaves de controle que realmente mudaram entre dois estados. */
function diffControls(prev: LiveConfig, next: LiveConfig): LiveControls {
  const diff: LiveControls = {};
  for (const key of LIVE_CONTROL_KEYS) {
    if (prev[key] !== next[key]) diff[key] = next[key];
  }
  return diff;
}

const CONTENT_SYNC_KEYS = [
  "aiContext",
  "productAiSalesContexts",
  "ultimoRoteiro",
  "roteirosPorProduto",
  "produtos",
] as const satisfies readonly (keyof LiveConfig)[];

function diffContent(prev: LiveConfig, next: LiveConfig): Partial<LiveConfig> {
  const diff: Partial<LiveConfig> = {};
  for (const key of CONTENT_SYNC_KEYS) {
    if (prev[key] !== next[key]) Object.assign(diff, { [key]: next[key] });
  }
  return diff;
}

/**
 * Use este updater em tudo que o usuário clica. O `updateConfig` cru da store
 * continua servindo para carregar do localStorage e para aplicar o que veio do
 * servidor — esses dois não podem publicar de volta, senão viram eco.
 */
export function useSyncedUpdateConfig(): ConfigUpdater {
  const updateConfig = useLiveStore((state) => state.actions.updateConfig);
  const pendingRef = useRef<Partial<LiveConfig>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const retryCountRef = useRef(0);

  const flushContent = useCallback(() => {
    timerRef.current = null;
    if (inFlightRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(pending).length === 0) return;
    let retryDelay = 0;
    const request = pushLiveConfigFields(pending);
    inFlightRef.current = request;
    void request
      .then((saved) => {
        if (!saved) throw new Error("Sessão indisponível para sincronização.");
        retryCountRef.current = 0;
      })
      .catch((err) => {
        // A edição mais recente sempre vence quando algo mudou durante o envio.
        pendingRef.current = { ...pending, ...pendingRef.current };
        retryCountRef.current += 1;
        retryDelay = Math.min(15_000, 1_500 * 2 ** (retryCountRef.current - 1));
        console.error("[useSyncedUpdateConfig] falha ao publicar conteúdo:", err);
        toast.error("Conteúdo salvo neste navegador", {
          description: "A sincronização com a extensão será tentada novamente automaticamente.",
        });
      })
      .finally(() => {
        inFlightRef.current = null;
        if (Object.keys(pendingRef.current).length > 0 && retryCountRef.current <= 5) {
          timerRef.current = setTimeout(flushContent, retryDelay || 50);
        }
      });
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      flushContent();
    },
    [flushContent],
  );

  return useCallback(
    (value) => {
      // getState() em vez do config do render: garante o valor mais fresco
      // mesmo com vários toggles seguidos no mesmo tick.
      const prev = useLiveStore.getState().config;
      const next = typeof value === "function" ? value(prev) : value;

      updateConfig(next);

      const diff = diffControls(prev, next);
      if (Object.keys(diff).length > 0) {
        void pushLiveControls(diff).catch((err) => {
          console.error("[useSyncedUpdateConfig] falha ao publicar controles:", err);
          toast.error("Não consegui avisar a extensão", {
            description:
              "A mudança valeu aqui no painel, mas a barra da live pode estar desatualizada.",
          });
        });
      }

      const content = diffContent(prev, next);
      if (Object.keys(content).length > 0) {
        pendingRef.current = { ...pendingRef.current, ...content };
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flushContent, 700);
      }
    },
    [flushContent, updateConfig],
  );
}

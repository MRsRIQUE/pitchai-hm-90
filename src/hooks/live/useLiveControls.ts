/**
 * Ponte painel → barra da live.
 *
 * A extensão publica o estado dela no doc compartilhado e o painel lê a cada
 * ciclo do `useVitrineSync`. Faltava o caminho de volta: um clique em
 * "Proteção" aqui só mexia no localStorage, então a barra da live nunca ficava
 * sabendo. Este hook devolve um `updateConfig` que, além de salvar local,
 * publica só as chaves de controle que mudaram.
 */
import { useCallback } from "react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import type { LiveConfig } from "@/lib/live/config";
import { LIVE_CONTROL_KEYS, pushLiveControls, type LiveControls } from "@/lib/live/sync";

export type ConfigUpdater = (value: LiveConfig | ((cfg: LiveConfig) => LiveConfig)) => void;

/** Só as chaves de controle que realmente mudaram entre dois estados. */
function diffControls(prev: LiveConfig, next: LiveConfig): LiveControls {
  const diff: LiveControls = {};
  for (const key of LIVE_CONTROL_KEYS) {
    if (prev[key] !== next[key]) diff[key] = next[key];
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

  return useCallback(
    (value) => {
      // getState() em vez do config do render: garante o valor mais fresco
      // mesmo com vários toggles seguidos no mesmo tick.
      const prev = useLiveStore.getState().config;
      const next = typeof value === "function" ? value(prev) : value;

      updateConfig(next);

      const diff = diffControls(prev, next);
      if (Object.keys(diff).length === 0) return;

      void pushLiveControls(diff).catch((err) => {
        console.error("[useSyncedUpdateConfig] falha ao publicar controles:", err);
        toast.error("Não consegui avisar a extensão", {
          description:
            "A mudança valeu aqui no painel, mas a barra da live pode estar desatualizada.",
        });
      });
    },
    [updateConfig],
  );
}

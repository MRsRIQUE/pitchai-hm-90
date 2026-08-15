/**
 * Hook para sincronização da vitrine com o TikTok Shop
 * Gerencia estado, erros e race conditions
 */
import { useEffect, useRef, useCallback } from "react";
import { useLiveStore } from "@/stores/useLiveStore";
import {
  pullVitrine,
  isWithinControlEchoWindow,
  type LiveControlKey,
  type LiveControls,
} from "@/lib/live/sync";
import { validateVitrineResponse } from "@/lib/validations/vitrine";
import { withRetry } from "@/lib/api/withRetry";

export interface VitrineSyncOptions {
  /** Intervalo de sincronização em ms (padrão: 20000) */
  syncInterval?: number;
  /** Se deve sincronizar automaticamente */
  autoSync?: boolean;
  /** Callback quando a sincronização for bem-sucedida */
  onSuccess?: (items: any[], updatedAt: string | null) => void;
  /** Callback quando houver erro */
  onError?: (error: string) => void;
}

/**
 * Resultado de uma sincronização. `syncVitrine` não rejeita — ela relata.
 * Quem chama precisa disso para não anunciar sucesso quando a sincronização
 * falhou (o auto-sync interno simplesmente ignora o retorno).
 */
export type VitrineSyncOutcome =
  | { ok: true; items: any[]; updatedAt: string | null }
  /**
   * `busy` marca a colisão com uma sincronização já em andamento. Não é falha
   * de rede nem vitrine vazia — quem chama não deve gritar erro por isso.
   */
  | { ok: false; error: string; busy?: boolean };

export interface VitrineSyncResult {
  /** Sincroniza a vitrine manualmente e informa se deu certo */
  syncVitrine: () => Promise<VitrineSyncOutcome>;
  /** Cancela a sincronização automática */
  cancelSync: () => void;
  /** Reinicia a sincronização automática */
  restartSync: () => void;
  /** Se a sincronização automática está ativa */
  isAutoSyncActive: boolean;
}

export function useVitrineSync(options: VitrineSyncOptions = {}): VitrineSyncResult {
  const { syncInterval = 20000, autoSync = true, onSuccess, onError } = options;

  const { setVitrine, setLoading, setError, updateConfig } = useLiveStore((state) => state.actions);

  // Refs para controle de execução
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isSyncingRef = useRef<boolean>(false);

  // Guarda os callbacks em refs para que mudem sem recriar `syncVitrine`.
  // Callbacks passados inline (ex.: onError=(e)=>...) mudam a cada render;
  // se entrassem nas deps do useCallback/useEffect, o auto-sync re-executaria
  // em loop infinito ("Maximum update depth exceeded").
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  }, [onSuccess, onError]);

  /**
   * Espelha no painel os controles que a barra da live acabou de mudar
   * (Proteção, Auto Mod, Respostas IA...). Só grava o que realmente divergiu,
   * para não reescrever a config — e nunca durante a janela de eco, senão uma
   * leitura antiga desfaz o clique que o usuário acabou de dar aqui.
   */
  const applyRemoteControls = useCallback(
    (controls: LiveControls | undefined) => {
      if (!controls || isWithinControlEchoWindow()) return;

      const atual = useLiveStore.getState().config;
      const diff: LiveControls = {};
      for (const [key, value] of Object.entries(controls) as [LiveControlKey, boolean][]) {
        if (atual[key] !== value) diff[key] = value;
      }
      if (Object.keys(diff).length === 0) return;

      updateConfig((c) => ({ ...c, ...diff }));
    },
    [updateConfig],
  );

  // Função principal de sincronização
  const syncVitrine = useCallback(async (): Promise<VitrineSyncOutcome> => {
    // Evita sincronizações simultâneas
    if (isSyncingRef.current) {
      console.log("[useVitrineSync] Sincronização já em andamento, pulando...");
      return { ok: false, error: "Sincronização já em andamento", busy: true };
    }

    // Cancela requisição anterior se ainda estiver pendente
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    isSyncingRef.current = true;

    try {
      setLoading("vitrine", true);
      setError("vitrine", undefined);

      // Usa withRetry para tentar novamente em caso de falha
      const result = await withRetry(
        async () => {
          // Verifica se o controller foi abortado
          if (controller.signal.aborted) {
            throw new Error("Sincronização cancelada");
          }

          // Chama a função de pullVitrine passando o AbortSignal — cancela
          // o fetch se um novo tick iniciar antes deste terminar.
          const res = await pullVitrine({ signal: controller.signal });

          if (!res) {
            throw new Error("Nenhum dado de vitrine encontrado");
          }

          // Valida os dados com Zod
          const validated = validateVitrineResponse({
            items: res.items,
            updatedAt: res.updatedAt,
          });

          // Os controles ficam fora do schema da vitrine de propósito: são o
          // estado da barra da live, não produtos.
          return { ...validated, controls: res.controls };
        },
        {
          maxRetries: 3,
          initialDelay: 1000,
          delayMultiplier: 2,
          onRetry: (error, attempt, delay) => {
            console.warn(
              `[useVitrineSync] Tentativa ${attempt} falhou, tentando novamente em ${delay}ms:`,
              error,
            );
          },
        },
      );

      // Atualiza o estado com os dados validados
      if (isMountedRef.current) {
        setVitrine(
          result.items,
          result.items.length === 0 ? "vazia" : "ok",
          result.updatedAt ?? null,
        );
        applyRemoteControls(result.controls);
        onSuccessRef.current?.(result.items, result.updatedAt ?? null);
      }

      return { ok: true, items: result.items, updatedAt: result.updatedAt ?? null };
    } catch (error) {
      if (!isMountedRef.current) return { ok: false, error: "Componente desmontado" };

      let errorMessage = "Falha ao sincronizar vitrine";

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          errorMessage = "Sincronização cancelada";
        } else {
          errorMessage = error.message;
        }
      }

      console.error("[useVitrineSync] Erro na sincronização:", error);
      setError("vitrine", errorMessage);
      onErrorRef.current?.(errorMessage);

      return { ok: false, error: errorMessage };
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current) {
        setLoading("vitrine", false);
      }
    }
  }, [setVitrine, setLoading, setError, applyRemoteControls]);

  // Função para cancelar sincronização
  const cancelSync = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSyncingRef.current = false;
  }, []);

  // Função para reiniciar sincronização
  const restartSync = useCallback(() => {
    cancelSync();
    // Sincroniza imediatamente
    syncVitrine();
    // Reinicia o intervalo
    syncIntervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        syncVitrine();
      }
    }, syncInterval);
  }, [syncVitrine, syncInterval, cancelSync]);

  // Efeito para sincronização automática
  useEffect(() => {
    isMountedRef.current = true;

    if (autoSync) {
      // Sincroniza uma vez no mount
      syncVitrine();

      // Configura intervalo de sincronização
      syncIntervalRef.current = setInterval(() => {
        if (document.visibilityState === "visible") {
          syncVitrine();
        }
      }, syncInterval);
    }

    // Listener para mudança de visibilidade da aba
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && autoSync) {
        syncVitrine();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup
    return () => {
      isMountedRef.current = false;
      cancelSync();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoSync, syncInterval, syncVitrine, cancelSync]);

  return {
    syncVitrine,
    cancelSync,
    restartSync,
    isAutoSyncActive: autoSync && syncIntervalRef.current !== null,
  };
}

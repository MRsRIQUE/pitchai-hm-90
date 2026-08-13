/**
 * Hook para sincronização da vitrine com o TikTok Shop
 * Gerencia estado, erros e race conditions
 */
import { useEffect, useRef, useCallback } from "react";
import { useLiveStore } from "@/stores/useLiveStore";
import { pullVitrine } from "@/lib/live/sync";
import { validateVitrineResponse } from "@/lib/validations/vitrine";
import { safeFetch } from "@/lib/api";
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

export interface VitrineSyncResult {
  /** Sincroniza a vitrine manualmente */
  syncVitrine: () => Promise<void>;
  /** Cancela a sincronização automática */
  cancelSync: () => void;
  /** Reinicia a sincronização automática */
  restartSync: () => void;
  /** Se a sincronização automática está ativa */
  isAutoSyncActive: boolean;
}

export function useVitrineSync(options: VitrineSyncOptions = {}): VitrineSyncResult {
  const { syncInterval = 20000, autoSync = true, onSuccess, onError } = options;

  const { setVitrine, setLoading, setError } = useLiveStore((state) => state.actions);

  // Refs para controle de execução
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isSyncingRef = useRef<boolean>(false);

  // Função principal de sincronização
  const syncVitrine = useCallback(async () => {
    // Evita sincronizações simultâneas
    if (isSyncingRef.current) {
      console.log("[useVitrineSync] Sincronização já em andamento, pulando...");
      return;
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

          return validated;
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
        onSuccess?.(result.items, result.updatedAt ?? null);
      }
    } catch (error) {
      if (!isMountedRef.current) return;

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
      onError?.(errorMessage);
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current) {
        setLoading("vitrine", false);
      }
    }
  }, [setVitrine, setLoading, setError, onSuccess, onError]);

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

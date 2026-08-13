/**
 * Gerenciamento de configuração da extensão
 * Centraliza o carregamento, salvamento e atualização da configuração
 */

import { Config, DEFAULT_CONFIG, STORAGE_KEYS } from "../types";
import { encryptConfigObj, decryptConfigObj } from "../utils/crypto";

// ============================================================================
// Gerenciamento de Storage
// ============================================================================

/**
 * Carrega a configuração do chrome.storage
 */
export async function loadConfig(): Promise<Config> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.CONFIG], async (result) => {
      const stored = result[STORAGE_KEYS.CONFIG];
      
      if (!stored) {
        resolve(DEFAULT_CONFIG);
        return;
      }
      
      try {
        const decrypted = await decryptConfigObj(stored);
        const config = normalizeConfig(decrypted);
        resolve(config);
      } catch (error) {
        console.error("[config] Failed to decrypt config:", error);
        resolve(DEFAULT_CONFIG);
      }
    });
  });
}

/**
 * Salva a configuração no chrome.storage
 */
export async function saveConfig(config: Config): Promise<void> {
  const encrypted = await encryptConfigObj(config);
  await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: encrypted });
}

/**
 * Atualiza a configuração de forma incremental
 * (útil para evitar sobrescrever dados não relacionados)
 */
export async function updateConfig(
  updater: (current: Config) => Config | Partial<Config>,
): Promise<Config> {
  const current = await loadConfig();
  const updated = updater(current);

  if (updated === current) {
    return current;
  }

  // Se for um Partial<Config>, mescla com o atual
  const finalConfig: Config =
    !updated || typeof updated === "function"
      ? current
      : { ...current, ...updated };

  await saveConfig(finalConfig);
  return finalConfig;
}

/**
 * Normaliza a configuração para garantir que todos os campos estejam preenchidos
 */
export function normalizeConfig(data: unknown): Config {
  try {
    const parsed = data as Partial<Config>;
    
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      // Normaliza objetos aninhados
      voz: {
        ...DEFAULT_CONFIG.voz,
        ...(parsed.voz || {}),
        monitor: {
          ...DEFAULT_CONFIG.voz.monitor,
          ...(parsed.voz?.monitor || {}),
        },
        pushToTalk: {
          ...DEFAULT_CONFIG.voz.pushToTalk,
          ...(parsed.voz?.pushToTalk || {}),
        },
      },
      autoFixar: {
        ...DEFAULT_CONFIG.autoFixar,
        ...(parsed.autoFixar || {}),
      },
      encerrarTempo: {
        ...DEFAULT_CONFIG.encerrarTempo,
        ...(parsed.encerrarTempo || {}),
      },
      agendar: {
        ...DEFAULT_CONFIG.agendar,
        ...(parsed.agendar || {}),
      },
      filtros: {
        ...DEFAULT_CONFIG.filtros,
        ...(parsed.filtros || {}),
      },
      vozContextos: {
        ...DEFAULT_CONFIG.vozContextos,
        ...(parsed.vozContextos || {}),
      },
      demo: {
        ...DEFAULT_CONFIG.demo,
        ...(parsed.demo || {}),
      },
      somVenda: {
        ...DEFAULT_CONFIG.somVenda,
        ...(parsed.somVenda || {}),
      },
      aiContext: {
        ...DEFAULT_CONFIG.aiContext,
        ...(parsed.aiContext || {}),
      },
      // Garante que produtos seja um array
      produtos: Array.isArray(parsed.produtos) ? parsed.produtos : [],
      roteirosPorProduto: {
        ...DEFAULT_CONFIG.roteirosPorProduto,
        ...(parsed.roteirosPorProduto || {}),
      },
      // Preserva o syncToken
      syncToken: parsed.syncToken || DEFAULT_CONFIG.syncToken,
      version: parsed.version || DEFAULT_CONFIG.version,
      lastUpdated: Date.now(),
    };
  } catch (error) {
    console.error("[config] Failed to normalize config:", error);
    return DEFAULT_CONFIG;
  }
}

// ============================================================================
// Sincronização com o Backend
// ============================================================================

import {
  loadConfigFromBackend,
  pushConfigToBackend,
} from "../utils/network";

/**
 * Sincroniza a configuração com o backend
 */
export async function syncConfigWithBackend(force: boolean = false): Promise<Config> {
  const config = await loadConfig();
  
  if (!config.syncToken || !force) {
    return config;
  }
  
  try {
    const backendConfig = await loadConfigFromBackend(config.syncToken);
    
    if (backendConfig) {
      // Mescla a configuração do backend com a local
      // (prioriza a local para campos que não devem ser sobrescritos)
      const merged = {
        ...backendConfig,
        // Preserva configurações locais que não estão no backend
        ...config,
        // Mas atualiza produtos e roteiros do backend
        produtos: backendConfig.produtos || config.produtos,
        roteirosPorProduto: backendConfig.roteirosPorProduto || config.roteirosPorProduto,
      };
      
      await saveConfig(merged);
      return merged;
    }
  } catch (error) {
    console.error("[config] Failed to sync with backend:", error);
  }
  
  return config;
}

/**
 * Envia a configuração local para o backend
 */
export async function pushConfigToBackendSafe(config: Config): Promise<boolean> {
  if (!config.syncToken) {
    return false;
  }
  
  try {
    const result = await pushConfigToBackend(config.syncToken, config);
    return result?.success ?? false;
  } catch (error) {
    console.error("[config] Failed to push config to backend:", error);
    return false;
  }
}

// ============================================================================
// Listeners de Storage
// ============================================================================

/**
 * Configura um listener para mudanças na configuração
 */
export function onConfigChange(
  callback: (newConfig: Config, oldConfig: Config) => void,
): () => void {
  let oldConfig: Config = DEFAULT_CONFIG;
  
  const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
    if (changes[STORAGE_KEYS.CONFIG]) {
      const newValue = changes[STORAGE_KEYS.CONFIG].newValue;
      
      if (newValue) {
        decryptConfigObj(newValue).then((decrypted) => {
          const newConfig = normalizeConfig(decrypted);
          callback(newConfig, oldConfig);
          oldConfig = newConfig;
        });
      }
    }
  };
  
  chrome.storage.onChanged.addListener(listener);
  
  // Retorna função para remover o listener
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

// ============================================================================
// Funções utilitárias
// ============================================================================

/**
 * Obtém um valor específico da configuração
 */
export async function getConfigValue<T extends keyof Config>(
  key: T,
): Promise<Config[T]> {
  const config = await loadConfig();
  return config[key];
}

/**
 * Atualiza um valor específico da configuração
 */
export async function setConfigValue<T extends keyof Config>(
  key: T,
  value: Config[T],
): Promise<Config> {
  return updateConfig((current) => ({
    ...current,
    [key]: value,
  }));
}

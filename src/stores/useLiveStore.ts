import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
  LiveConfig,
  DEFAULT_CONFIG,
  loadConfig as loadLocalConfig,
  saveConfig as saveLocalConfig,
} from "@/lib/live/config";
import type { VitrineItem } from "@/lib/live/sync";

// Tipos para loading states
type LoadingState = {
  vitrine: boolean;
  voice: boolean;
  script: boolean;
  sales: boolean;
  config: boolean;
};

// Tipos para erros
type ErrorState = {
  vitrine?: string;
  voice?: string;
  script?: string;
  sales?: string;
  general?: string;
};

// Tipo do estado global
type LiveState = {
  // ConfiguraÃ§Ã£o principal
  config: LiveConfig;

  // Dados da vitrine
  vitrineItems: VitrineItem[];
  vitrineStatus: "idle" | "ok" | "vazia";
  vitrineAt: string | null;

  // Estados de loading
  loading: LoadingState;

  // Estado de erros
  errors: ErrorState;

  // Sincronização com a nuvem
  isSyncedWithCloud: boolean;
  lastSyncAt: string | null;

  // AÃ§Ãµes
  actions: {
    loadConfig: () => void;
    updateConfig: (value: LiveConfig | ((cfg: LiveConfig) => LiveConfig)) => void;
    resetConfig: () => void;
    setVitrine: (items: VitrineItem[], status: "ok" | "vazia", at?: string | null) => void;
    setLoading: (key: keyof LoadingState, value: boolean) => void;
    setError: (key: keyof ErrorState, error: string | undefined) => void;
    clearErrors: () => void;
    setSyncedWithCloud: (isSynced: boolean, at?: string | null) => void;
  };
};

// FunÃ§Ã£o para criar a store
function createLiveStore(set: any, get: any): LiveState {
  const actions = {
    loadConfig: () => {
      try {
        const cfg = loadLocalConfig();
        set({ config: cfg });
      } catch (e) {
        set({
          errors: { ...get().errors, general: "Falha ao carregar configuraÃ§Ã£o local" },
        });
      }
    },

    updateConfig: (value: LiveConfig | ((cfg: LiveConfig) => LiveConfig)) => {
      const newConfig =
        typeof value === "function"
          ? (value as (cfg: LiveConfig) => LiveConfig)(get().config)
          : value;
      try {
        saveLocalConfig(newConfig);
        set({ config: newConfig });
      } catch (e) {
        set({
          errors: { ...get().errors, general: "Falha ao salvar configuraÃ§Ã£o" },
        });
      }
    },

    resetConfig: () => {
      try {
        saveLocalConfig(DEFAULT_CONFIG);
        set({ config: DEFAULT_CONFIG });
      } catch (e) {
        set({
          errors: { ...get().errors, general: "Falha ao resetar configuraÃ§Ã£o" },
        });
      }
    },

    setVitrine: (items: VitrineItem[], status: "ok" | "vazia", at?: string | null) => {
      set({
        vitrineItems: items,
        vitrineStatus: status,
        vitrineAt: at ?? get().vitrineAt,
      });
    },

    setLoading: (key: keyof LoadingState, value: boolean) => {
      set((state: LiveState) => ({
        loading: { ...state.loading, [key]: value },
      }));
    },

    setError: (key: keyof ErrorState, error: string | undefined) => {
      set((state: LiveState) => ({
        errors: { ...state.errors, [key]: error },
      }));
    },

    clearErrors: () => {
      set({ errors: {} });
    },

    setSyncedWithCloud: (isSynced: boolean, at?: string | null) => {
      set({
        isSyncedWithCloud: isSynced,
        lastSyncAt: at ?? get().lastSyncAt,
      });
    },
  };

  return {
    config: DEFAULT_CONFIG,
    vitrineItems: [],
    vitrineStatus: "idle",
    vitrineAt: null,
    loading: {
      vitrine: false,
      voice: false,
      script: false,
      sales: false,
      config: false,
    },
    errors: {},
    isSyncedWithCloud: false,
    lastSyncAt: null,
    actions,
  };
}

// CriaÃ§Ã£o da store
export const useLiveStore = create<LiveState>()((set, get) => createLiveStore(set, get));

// Selector hooks para facilitar o uso
export const useConfig = () => useLiveStore((state) => state.config);
export const useVitrine = () =>
  useLiveStore(
    useShallow((state) => ({
      items: state.vitrineItems,
      status: state.vitrineStatus,
      at: state.vitrineAt,
    })),
  );
export const useLoading = () => useLiveStore((state) => state.loading);
export const useErrors = () => useLiveStore((state) => state.errors);
export const useLiveActions = () => useLiveStore((state) => state.actions);

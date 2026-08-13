/**
 * Entry point do content script
 * Inicializa todos os módulos e hooks
 */

import type { Config } from "./types";

// ============================================================================
// Hooks (efeito colateral)
// ============================================================================

import "./hooks/network";
import "./hooks/net-bridge";

// ============================================================================
// Tipos e Interfaces
// ============================================================================

export type { Config } from "./types";
export * as types from "./types";
export * as core from "./core";
export * as regions from "./regions";
export * as hooks from "./hooks";

// ============================================================================
// Mensagens
// ============================================================================

export enum MessageType {
  // Configuração
  GET_CONFIG = "GET_CONFIG",
  SET_CONFIG = "SET_CONFIG",

  // Produtos
  GET_PRODUCTS = "GET_PRODUCTS",
  SET_PRODUCTS = "SET_PRODUCTS",
  ADD_PRODUCT = "ADD_PRODUCT",
  REMOVE_PRODUCT = "REMOVE_PRODUCT",
  SYNC_PRODUCTS = "SYNC_PRODUCTS",

  // Regiões
  GET_REGIONS = "GET_REGIONS",
  SET_REGION = "SET_REGION",
  CLEAR_REGIONS = "CLEAR_REGIONS",

  // Eventos
  EMIT_EVENT = "EMIT_EVENT",
  ON_EVENT = "ON_EVENT",

  // Status
  GET_STATUS = "GET_STATUS",
  PING = "PING",
  PONG = "PONG",
}

export interface Message {
  type: MessageType;
  payload?: unknown;
  timestamp?: number;
  requestId?: string;
}

export interface RequestMessage extends Message {
  requestId: string;
}

export interface ResponseMessage extends Message {
  requestId: string;
  success: boolean;
  error?: string;
}

export interface ConfigPayload {
  config: unknown;
  partial?: boolean;
}

// ============================================================================
// Funções de Utilidade
// ============================================================================

export function isContentScript(): boolean {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.runtime &&
    !!chrome.runtime.id &&
    typeof window !== "undefined"
  );
}

export function isServiceWorker(): boolean {
  return (
    typeof self !== "undefined" &&
    typeof window === "undefined" &&
    typeof chrome !== "undefined" &&
    !!chrome.runtime &&
    !!chrome.runtime.id
  );
}

export function isBackgroundPage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.runtime &&
    !!chrome.runtime.id &&
    typeof window !== "undefined" &&
    window.location.href.includes("chrome-extension://")
  );
}

// ============================================================================
// Inicialização
// ============================================================================

let _booted = false;

export async function initContentScript(): Promise<void> {
  if (_booted) return;
  _booted = true;
  console.log("[PitchAI] Inicializando content script...");

  try {
    const { loadConfig, saveConfig } = await import("./core/config");
    const { resolveAll, startWatcher } = await import("./regions");
    const { eventBus } = await import("./core/events");
    const { scrapeCatalog } = await import("./core/products");

    const cfg = await loadConfig();
    await resolveAll({ force: false });
    startWatcher();
    await scrapeCatalog();
    eventBus.emit("status:update", { status: "ready", details: { config: cfg } });

    console.log("[PitchAI] Content script inicializado com sucesso!");
  } catch (error) {
    console.error("[PitchAI] Erro ao inicializar content script:", error);
  }
}

// ============================================================================
// Inicialização Automática
// ============================================================================

if (isContentScript()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initContentScript().catch(console.error);
    });
  } else {
    initContentScript().catch(console.error);
  }
}

export default {
  initContentScript,
  isContentScript,
  isServiceWorker,
  isBackgroundPage,
  MessageType,
};

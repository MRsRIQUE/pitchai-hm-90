/**
 * Funções utilitárias para requisições HTTP
 * Inclui retry automático, timeout e fallback para modo offline
 */

import { Config } from "../types";

// ============================================================================
// Configuração
// ============================================================================

/** URL base da API */
export function getApiBase(): string {
  if (window.location.origin && window.location.origin.includes("run.app")) {
    return window.location.origin;
  }
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return window.location.origin;
  }
  return "https://pitchai-live.lovable.app";
}

// ============================================================================
// Configuração de retry
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 segundo
const TIMEOUT = 10000; // 10 segundos

// ============================================================================
// Wrapper seguro para fetch
// ============================================================================

/** Opções para safeFetch */
export interface SafeFetchOptions extends RequestInit {
  /** Número máximo de retries */
  retries?: number;
  /** Delay entre retries em ms */
  retryDelay?: number;
  /** Timeout em ms */
  timeout?: number;
  /** Callback para erros */
  onError?: (error: Error, attempt: number) => void;
  /** Fallback se todas as tentativas falharem */
  fallback?: unknown;
}

/** Erro personalizado para requisições */
export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * Faz uma requisição fetch com retry automático e timeout
 */
export async function safeFetch<T = unknown>(
  endpoint: string,
  options: SafeFetchOptions = {},
): Promise<T | null> {
  const {
    retries = MAX_RETRIES,
    retryDelay = RETRY_DELAY,
    timeout = TIMEOUT,
    onError,
    fallback,
    ...fetchOptions
  } = options;

  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(`${getApiBase()}${endpoint}`, {
        ...fetchOptions,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        lastError = new FetchError(
          `HTTP ${response.status}: ${errorText}`,
          response.status,
          errorText,
        );
        
        if (attempt <= retries) {
          onError?.(lastError, attempt);
          await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
          continue;
        }
        
        throw lastError;
      }
      
      try {
        return (await response.json()) as T;
      } catch {
        return null as T | null;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt <= retries) {
        onError?.(lastError, attempt);
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      
      throw lastError;
    }
  }
  
  return fallback as T | null;
}

// ============================================================================
// Funções específicas para a API do Pitch AI
// ============================================================================

/**
 * Verifica se um token é válido
 */
export async function verifyToken(token: string): Promise<{
  valid: boolean;
  locked: boolean;
  plan?: string;
  reason?: string;
  message?: string;
  remainingChat?: number;
  remainingTts?: number;
  chatLimit?: number;
  ttsLimit?: number;
} | null> {
  if (!token) return null;
  
  try {
    const headers = await signRequest(token, "verify");
    const result = await safeFetch<{
      valid: boolean;
      locked: boolean;
      plan?: string;
      reason?: string;
      message?: string;
      remainingChat?: number;
      remainingTts?: number;
      chatLimit?: number;
      ttsLimit?: number;
    }>("/api/public/live/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ token }),
      retries: 3,
    });
    
    return result;
  } catch (error) {
    console.error("[network] Failed to verify token:", error);
    return null;
  }
}

/**
 * Carrega a configuração do backend
 */
export async function loadConfigFromBackend(token: string): Promise<Partial<Config> | null> {
  if (!token) return null;
  
  try {
    const result = await safeFetch<{ config?: Partial<Config> }>("/api/public/live/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "pull",
        token,
      }),
      retries: 3,
    });
    
    return result?.config || null;
  } catch (error) {
    console.error("[network] Failed to load config:", error);
    return null;
  }
}

/**
 * Envia a configuração para o backend
 */
export async function pushConfigToBackend(
  token: string,
  config: Partial<Config>,
): Promise<{ success: boolean; error?: string } | null> {
  if (!token) return null;
  
  try {
    const result = await safeFetch<{ success: boolean; error?: string }>(
      "/api/public/live/config",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "push",
          token,
          config,
        }),
        retries: 3,
      },
    );
    
    return result;
  } catch (error) {
    console.error("[network] Failed to push config:", error);
    return null;
  }
}

/**
 * Inicia uma sessão de live
 */
export async function startSession(token: string): Promise<{
  session_id?: string;
  error?: string;
} | null> {
  if (!token) return null;
  
  try {
    const result = await safeFetch<{ session_id?: string; error?: string }>(
      "/api/public/live/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "start",
          token,
        }),
        retries: 3,
      },
    );
    
    return result;
  } catch (error) {
    console.error("[network] Failed to start session:", error);
    return null;
  }
}

/**
 * Encerra uma sessão de live
 */
export async function endSession(
  token: string,
  sessionId: string,
): Promise<{ success: boolean; error?: string } | null> {
  if (!token || !sessionId) return null;
  
  try {
    const result = await safeFetch<{ success: boolean; error?: string }>(
      "/api/public/live/session",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "end",
          token,
          session_id: sessionId,
        }),
        retries: 3,
      },
    );
    
    return result;
  } catch (error) {
    console.error("[network] Failed to end session:", error);
    return null;
  }
}

/**
 * Envia um evento para a sessão de live
 */
export async function sendSessionEvent(
  token: string,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!token || !sessionId) return;
  
  try {
    await safeFetch("/api/public/live/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "event",
        token,
        session_id: sessionId,
        ...payload,
      }),
      retries: 2,
      fallback: null,
    });
  } catch (error) {
    console.warn("[network] Failed to send session event:", error);
  }
}

// ============================================================================
// Importação da função de assinatura
// ============================================================================

import { signRequest } from "./crypto";

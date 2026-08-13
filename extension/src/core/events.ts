/**
 * Gerenciamento de eventos da extensão
 * Usa CustomEvents para comunicação entre scripts
 */

import { PitchAIEvent, PitchAIEventType } from "../types";

// ============================================================================
// Classe de Gerenciamento de Eventos
// ============================================================================

/**
 * Classe singleton para gerenciar eventos da extensão
 */
export class PitchAIEventBus {
  private static instance: PitchAIEventBus;
  private listeners: Map<PitchAIEventType, Set<(data: unknown) => void>> = new Map();
  
  private constructor() {
    this.listenGlobal();
  }
  
  /**
   * Obtém a instância singleton
   */
  public static getInstance(): PitchAIEventBus {
    if (!PitchAIEventBus.instance) {
      PitchAIEventBus.instance = new PitchAIEventBus();
    }
    return PitchAIEventBus.instance;
  }
  
  // ==========================================================================
  // Registrar Listeners
  // ==========================================================================
  
  /**
   * Registra um listener para um tipo de evento
   */
  public on<T>(
    type: PitchAIEventType,
    callback: (data: T) => void,
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    
    this.listeners.get(type)!.add(callback as (data: unknown) => void);
    
    // Retorna função para remover o listener
    return () => {
      this.listeners.get(type)?.delete(callback as (data: unknown) => void);
    };
  }
  
  /**
   * Registra um listener que é chamado apenas uma vez
   */
  public once<T>(
    type: PitchAIEventType,
    callback: (data: T) => void,
  ): () => void {
    const onceCallback = (data: unknown) => {
      callback(data as T);
      this.off(type, onceCallback);
    };
    
    return this.on(type, onceCallback);
  }
  
  /**
   * Remove um listener
   */
  public off<T>(
    type: PitchAIEventType,
    callback: (data: T) => void,
  ): void {
    this.listeners.get(type)?.delete(callback as (data: unknown) => void);
  }
  
  /**
   * Remove todos os listeners de um tipo
   */
  public offAll(type: PitchAIEventType): void {
    this.listeners.delete(type);
  }
  
  /**
   * Remove todos os listeners
   */
  public clear(): void {
    this.listeners.clear();
  }
  
  // ==========================================================================
  // Emitir Eventos
  // ==========================================================================
  
  /**
   * Emite um evento para todos os listeners
   */
  public emit<T>(
    type: PitchAIEventType,
    data: T,
  ): void {
    const event: PitchAIEvent<T> = {
      type,
      data,
      timestamp: Date.now(),
    };
    
    // Dispara listeners internos
    this.listeners.get(type)?.forEach((cb) => {
      try {
        cb(data);
      } catch (error) {
        console.error(`[PitchAIEventBus] Error in listener for ${type}:`, error);
      }
    });
    
    // Dispara evento global (para outros scripts)
    this.emitGlobal(event);
  }
  
  /**
   * Emite um evento global (CustomEvent)
   */
  private emitGlobal<T>(event: PitchAIEvent<T>): void {
    try {
      window.dispatchEvent(
        new CustomEvent(`pitchai:${event.type}`, {
          detail: event,
        }),
      );
    } catch (error) {
      console.error("[PitchAIEventBus] Failed to emit global event:", error);
    }
  }
  
  // ==========================================================================
  // Listeners Globais
  // ==========================================================================
  
  /**
   * Configura listeners para eventos globais
   */
  private listenGlobal(): void {
    const eventTypes: PitchAIEventType[] = [
      "products:update",
      "messages:update",
      "config:update",
      "session:start",
      "session:end",
      "error",
      "status:update",
      "mapping:update",
    ];
    
    eventTypes.forEach((type) => {
      window.addEventListener(`pitchai:${type}`, (ev: Event) => {
        const customEvent = ev as CustomEvent;
        const event = customEvent.detail as PitchAIEvent;
        
        if (event?.type === type) {
          this.emit(type, event.data);
        }
      });
    });
  }
}

// ============================================================================
// Instância Global
// ============================================================================

/**
 * Instância global do EventBus
 */
export const eventBus = PitchAIEventBus.getInstance();

// ============================================================================
// Funções de Convenência
// ============================================================================

/**
 * Emite um evento de atualização de produtos
 */
export function emitProductsUpdate(products: unknown): void {
  eventBus.emit("products:update", products);
}

/**
 * Emite um evento de atualização de mensagens
 */
export function emitMessagesUpdate(messages: unknown): void {
  eventBus.emit("messages:update", messages);
}

/**
 * Emite um evento de atualização de configuração
 */
export function emitConfigUpdate(config: unknown): void {
  eventBus.emit("config:update", config);
}

/**
 * Emite um evento de início de sessão
 */
export function emitSessionStart(sessionId: string): void {
  eventBus.emit("session:start", { sessionId });
}

/**
 * Emite um evento de fim de sessão
 */
export function emitSessionEnd(sessionId: string): void {
  eventBus.emit("session:end", { sessionId });
}

/**
 * Emite um evento de erro
 */
export function emitError(error: Error): void {
  eventBus.emit("error", {
    message: error.message,
    stack: error.stack,
    timestamp: Date.now(),
  });
}

/**
 * Emite um evento de atualização de status
 */
export function emitStatusUpdate(status: string, details?: Record<string, unknown>): void {
  eventBus.emit("status:update", {
    status,
    details,
    timestamp: Date.now(),
  });
}

/**
 * Emite um evento de atualização de mapeamento
 */
export function emitMappingUpdate(mapping: unknown): void {
  eventBus.emit("mapping:update", mapping);
}

/**
 * Inicializa o barramento de eventos.
 */
export function initEvents(): void {
  emitStatusUpdate("events:ready");
}

/**
 * withRetry - Executa funções com retry automático
 * Útil para chamadas API que podem falhar temporariamente
 */

/**
 * Opções para retry
 */
export interface RetryOptions {
  /** Número máximo de tentativas (padrão: 3) */
  maxRetries?: number;
  /** Delay inicial em ms (padrão: 1000) */
  initialDelay?: number;
  /** Multiplicador de delay (padrão: 2 - exponential backoff) */
  delayMultiplier?: number;
  /** Delay máximo em ms (padrão: 10000) */
  maxDelay?: number;
  /** Função para verificar se deve tentar novamente */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Callback chamado a cada tentativa */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

/**
 * Erro de retry
 */
export class RetryError extends Error {
  constructor(
    message: string,
    public attempts: number,
    public lastError: unknown,
  ) {
    super(message);
    this.name = "RetryError";
  }
}

/**
 * Executa uma função com retry automático
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    delayMultiplier = 2,
    maxDelay = 10000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt++;

      // Se for a última tentativa ou não deve tentar novamente, lança o erro
      if (attempt > maxRetries || !shouldRetry(error, attempt)) {
        throw new RetryError(
          `Falha após ${attempt} tentativas: ${error instanceof Error ? error.message : String(error)}`,
          attempt,
          error,
        );
      }

      // Calcula delay com exponential backoff
      const delay = Math.min(initialDelay * Math.pow(delayMultiplier, attempt - 1), maxDelay);

      // Chama callback de retry
      onRetry?.(error, attempt, delay);

      // Aguarda antes de tentar novamente
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Isso nunca deve ser alcançado, mas apenas para satisfazer o TypeScript
  throw new RetryError("Falha inesperada no retry", attempt, lastError);
}

/**
 * Executa uma função com retry e fallback
 */
export async function withRetryAndFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  options?: RetryOptions,
): Promise<T> {
  try {
    return await withRetry(fn, options);
  } catch (error) {
    console.warn("Retries esgotados, usando fallback:", error);
    return fallback;
  }
}

/**
 * Hook para retry com React
 */
export function useRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): {
  execute: () => Promise<T>;
  reset: () => void;
} {
  let isCancelled = false;

  const execute = async () => {
    try {
      return await withRetry(fn, {
        ...options,
        shouldRetry: (error, attempt) =>
          !isCancelled && (options.shouldRetry?.(error, attempt) ?? true),
      });
    } catch (error) {
      if (isCancelled) {
        throw new Error("Execução cancelada");
      }
      throw error;
    }
  };

  const reset = () => {
    isCancelled = true;
  };

  return { execute, reset };
}

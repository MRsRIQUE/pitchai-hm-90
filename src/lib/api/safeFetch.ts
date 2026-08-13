/**
 * safeFetch - Wrapper seguro para chamadas fetch
 * Adiciona tratamento de erros, timeout e fallback
 */

export type SafeFetchOptions = RequestInit & {
  /** Timeout em milissegundos (padrão: 10000ms) */
  timeout?: number;
  /** Callback para erros */
  onError?: (error: string, details?: { status?: number; message?: string }) => void;
  /** Valor de fallback se a requisição falhar */
  fallback?: any;
  /** Se deve mostrar toast de erro automaticamente */
  showToast?: boolean;
};

/**
 * Erro personalizado para requisições
 */
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
 * Função principal para requisições seguras
 */
export async function safeFetch<T = any>(
  input: RequestInfo | URL,
  init?: SafeFetchOptions,
): Promise<T | null> {
  const { timeout = 10000, onError, fallback, showToast, ...fetchOptions } = init || {};

  // Criar controller para timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(input, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Tratar respostas de erro
    if (!response.ok) {
      const errorText = await response.text().catch(() => "Não foi possível ler a resposta");
      const errorMessage = `HTTP ${response.status}: ${errorText}`;

      const error = new FetchError(errorMessage, response.status, errorText);

      // Chamar callback de erro
      onError?.(errorMessage, { status: response.status, message: errorText });

      // Mostrar toast se solicitado
      if (showToast) {
        // Import dinâmico para evitar dependência circular
        const { toast } = await import("sonner");
        toast.error(`Erro ${response.status}: ${errorText}`);
      }

      return fallback as T | null;
    }

    // Tentar parsear JSON
    try {
      return (await response.json()) as T;
    } catch (jsonError) {
      // Se não for JSON, retornar texto vazio
      return null as T | null;
    }
  } catch (error) {
    clearTimeout(timeoutId);

    let errorMessage = "Falha na requisição";
    let status: number | undefined;
    let details: string | undefined;

    if (error instanceof FetchError) {
      errorMessage = error.message;
      status = error.status;
      details = error.details;
    } else if (error instanceof Error) {
      errorMessage = error.message;
      if (error.name === "AbortError") {
        errorMessage = "Requisição expirou";
      } else if (error.name === "TypeError") {
        errorMessage = "Não foi possível conectar ao servidor";
      }
    }

    // Chamar callback de erro
    onError?.(errorMessage, { status, message: details });

    // Mostrar toast se solicitado
    if (showToast) {
      const { toast } = await import("sonner");
      toast.error(errorMessage);
    }

    return fallback as T | null;
  }
}

/**
 * safeFetch com suporte a headers de autenticação
 */
export async function safeAuthFetch<T = any>(
  input: RequestInfo | URL,
  init?: SafeFetchOptions & {
    /** Função para obter headers de autenticação */
    getHeaders?: () => Promise<HeadersInit | Record<string, string>>;
  },
): Promise<T | null> {
  const { getHeaders, ...options } = init || {};

  // Obter headers de autenticação
  let headers: HeadersInit = options.headers || {};
  if (getHeaders) {
    try {
      const authHeaders = await getHeaders();
      headers = { ...headers, ...authHeaders };
    } catch (error) {
      console.error("Falha ao obter headers de autenticação:", error);
      options.onError?.("Falha na autenticação");
      return options.fallback as T | null;
    }
  }

  return safeFetch<T>(input, { ...options, headers });
}

/**
 * Wrapper para POST requests
 */
export async function safePost<T = any>(
  url: string,
  data?: any,
  options?: SafeFetchOptions,
): Promise<T | null> {
  return safeFetch<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });
}

/**
 * Wrapper para GET requests
 */
export async function safeGet<T = any>(url: string, options?: SafeFetchOptions): Promise<T | null> {
  return safeFetch<T>(url, {
    method: "GET",
    ...options,
  });
}

/**
 * Wrapper para PUT requests
 */
export async function safePut<T = any>(
  url: string,
  data?: any,
  options?: SafeFetchOptions,
): Promise<T | null> {
  return safeFetch<T>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });
}

/**
 * Wrapper para DELETE requests
 */
export async function safeDelete<T = any>(
  url: string,
  options?: SafeFetchOptions,
): Promise<T | null> {
  return safeFetch<T>(url, {
    method: "DELETE",
    ...options,
  });
}

/**
 * API Utilities Index
 * Exporta todas as utilidades de API em um único lugar
 */

export {
  safeFetch,
  safeAuthFetch,
  safePost,
  safeGet,
  safePut,
  safeDelete,
  FetchError,
  type SafeFetchOptions,
} from "./safeFetch";

export {
  withRetry,
  withRetryAndFallback,
  useRetry,
  RetryError,
  type RetryOptions,
} from "./withRetry";

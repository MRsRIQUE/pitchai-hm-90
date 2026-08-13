import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
// Chamadas de server functions (RPC, /_serverFn/*) precisam continuar recebendo
// JSON mesmo nesse caso — devolver HTML aqui faz o cliente do createServerFn
// perder a mensagem real do erro e exibir apenas um aviso genérico.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const error = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(error);

  const isServerFnRequest =
    request.headers.get("x-tsr-serverfn") != null || new URL(request.url).pathname.includes("/_serverFn/");
  if (isServerFnRequest) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// ===== CORS para o app nativo (Capacitor) =====
// O app embarcado faz chamadas cross-origin (server functions /_serverFn/*,
// /api/coach/chat, /api/exercise-image/*) a partir de capacitor://localhost (iOS)
// ou https://localhost (Android). A auth é por header Bearer (sem cookies), então
// NÃO usamos Access-Control-Allow-Credentials.
const CORS_ALLOW_HEADERS_FALLBACK = "authorization, content-type, x-tsr-serverfn, accept";

function corsOriginFor(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === "capacitor://localhost" || origin === "ionic://localhost") return origin;
  try {
    const u = new URL(origin);
    // Android (https://localhost) e dev (http://localhost:5173, 127.0.0.1…).
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return origin;
  } catch {
    return null;
  }
  return null;
}

function withCors(response: Response, allowed: string | null): Response {
  if (!allowed) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", allowed);
  headers.append("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  // Defense-in-depth: cabeçalhos de segurança aplicados a todas as respostas SSR.
  // Em vez de X-Frame-Options: DENY (que bloqueia o iframe do preview do Lovable
  // e gera "recusou a se conectar"), usamos CSP frame-ancestors permitindo
  // self + domínios do Lovable. Mantém proteção contra clickjacking de terceiros.
  if (!headers.has("content-security-policy"))
    headers.set(
      "content-security-policy",
      "frame-ancestors 'self' https://*.googleusercontent.com https://*.run.app https://*.google.com https://*.ai.studio https://ai.studio https://*.pitchai.ai.studio https://pitchai.ai.studio https://*.lovable.app https://*.lovable.dev https://lovable.dev",
    );
  if (!headers.has("x-content-type-options")) headers.set("x-content-type-options", "nosniff");
  if (!headers.has("referrer-policy"))
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!headers.has("permissions-policy"))
    headers.set(
      "permissions-policy",
      "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    );
  if (!headers.has("strict-transport-security"))
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const corsOrigin = corsOriginFor(request);
    // Preflight CORS do app nativo — responde antes de chegar ao handler SSR.
    if (
      request.method === "OPTIONS" &&
      corsOrigin &&
      request.headers.get("access-control-request-method")
    ) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": corsOrigin,
          "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers":
            request.headers.get("access-control-request-headers") ?? CORS_ALLOW_HEADERS_FALLBACK,
          "access-control-max-age": "86400",
          vary: "Origin",
        },
      });
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withCors(
        withSecurityHeaders(await normalizeCatastrophicSsrResponse(response, request)),
        corsOrigin,
      );
    } catch (error) {
      console.error(error);
      const isServerFnRequest =
        request.headers.get("x-tsr-serverfn") != null ||
        new URL(request.url).pathname.includes("/_serverFn/");
      const message = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
      const fallback = isServerFnRequest
        ? new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
          })
        : new Response(renderErrorPage(), {
            status: 500,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
      return withCors(withSecurityHeaders(fallback), corsOrigin);
    }
  },
};

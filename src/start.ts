import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachFirebaseAuth } from "@/lib/firebase-attacher";

// Chamadas de server functions (RPC) usam o caminho /_serverFn/ e o header
// x-tsr-serverfn. Elas precisam sempre de uma resposta JSON — se devolvermos
// HTML aqui, o cliente (fetch do createServerFn) não conseguirá interpretar o
// erro real (ex.: token expirado, "Forbidden") e o usuário só vê uma mensagem
// genérica. Páginas normais (navegação/documento) continuam recebendo a
// página de erro em HTML.
function isServerFnRequest(): boolean {
  try {
    const request = getRequest();
    if (!request) return false;
    if (request.headers.get("x-tsr-serverfn")) return true;
    return new URL(request.url).pathname.includes("/_serverFn/");
  } catch {
    return false;
  }
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    if (isServerFnRequest()) {
      const message = error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
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
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachFirebaseAuth],
  requestMiddleware: [errorMiddleware],
}));

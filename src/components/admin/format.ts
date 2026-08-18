/**
 * Formatação e leitura de erro do painel administrativo.
 *
 * Vive fora do `admin-ui.tsx` porque aquele arquivo só exporta componentes —
 * misturar os dois quebra o fast refresh do Vite.
 */

export function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * O transporte das server functions rejeita com o que aparecer: `Error`, a
 * `Response` crua do middleware ou um objeto só com `status`. `String(erro)`
 * nesses dois últimos vira "[object Response]" e apaga justamente o número que
 * separa sessão (401) de permissão (403).
 */
function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof Response !== "undefined" && error instanceof Response) {
    return `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`;
  }
  if (error && typeof error === "object") {
    const shape = error as { message?: unknown; status?: unknown; statusCode?: unknown };
    if (typeof shape.message === "string" && shape.message.trim()) return shape.message;
    const status = shape.statusCode ?? shape.status;
    return typeof status === "number" ? `HTTP ${status}` : "";
  }
  return String(error ?? "");
}

/** A rejeição veio como o documento HTML de erro da aplicação, não como dado. */
function isHtmlErrorPage(message: string): boolean {
  return (
    /<(?:!doctype|html|head|body)\b/i.test(message) || /unexpected token\s+['"]?</i.test(message)
  );
}

export function readableAdminError(error: unknown): string {
  const fallback = "Não foi possível carregar os dados. Atualize a página e tente novamente.";
  const message = rawErrorMessage(error);

  // O transporte das server functions pode devolver a página HTML de erro da
  // aplicação. Nunca exibimos esse documento bruto dentro do painel.
  if (!message.trim() || isHtmlErrorPage(message)) return fallback;

  return message;
}

/**
 * Versão para o bloco "Detalhes do erro": nunca troca a causa por uma frase
 * genérica. Onde `readableAdminError` protege o leitor do HTML cru, aqui o
 * próprio HTML é a informação — ele significa que a requisição morreu antes do
 * handler, e sem isso 401, 403 e 500 chegam ao admin com o mesmo texto.
 */
export function adminErrorDetail(error: unknown): string {
  const message = rawErrorMessage(error);
  if (!message.trim()) return "Erro sem mensagem (veja o console do navegador).";
  if (isHtmlErrorPage(message)) {
    return "O servidor devolveu a página de erro HTML — a requisição falhou antes do handler. Confira o status em DevTools › Network e o log do servidor.";
  }
  return message;
}

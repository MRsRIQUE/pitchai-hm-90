/**
 * Formatação e leitura de erro do painel administrativo.
 *
 * Vive fora do `admin-ui.tsx` porque aquele arquivo só exporta componentes —
 * misturar os dois quebra o fast refresh do Vite.
 */

export function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function readableAdminError(error: unknown): string {
  const fallback = "Não foi possível carregar os dados. Atualize a página e tente novamente.";
  const message = error instanceof Error ? error.message : String(error ?? "");

  // O transporte das server functions pode devolver a página HTML de erro da
  // aplicação. Nunca exibimos esse documento bruto dentro do painel.
  if (
    !message.trim() ||
    /<(?:!doctype|html|head|body)\b/i.test(message) ||
    /unexpected token\s+['"]?</i.test(message)
  ) {
    return fallback;
  }

  return message;
}

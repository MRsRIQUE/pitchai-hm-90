/**
 * Funções utilitárias para manipulação de strings
 * Usadas para limpeza e normalização de nomes de produtos, mensagens, etc.
 */

/**
 * Limpa uma string removendo espaços extras, emojis e caracteres especiais
 */
export function cleanName(raw: string | null | undefined): string {
  if (!raw) return "";

  return String(raw)
    .replace(/\s+/g, " ") // Substitui múltiplos espaços por um único
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "") // Remove emojis
    .replace(/^[\s·|•\-–—]+|[\s·|•\-–—]+$/g, "") // Remove caracteres de pontuação no início/fim
    .trim();
}

/**
 * Normaliza uma string para uso como chave (minusculas, sem acentos, sem caracteres especiais)
 */
export function normKey(name: string | null | undefined): string {
  if (!name) return "";

  return cleanName(name)
    .toLowerCase()
    .normalize("NFD") // Normaliza para decompor caracteres acentuados
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9 ]/g, "") // Remove caracteres que não são letras, números ou espaço
    .replace(/\s+/g, " ") // Substitui múltiplos espaços por um único
    .trim();
}

/**
 * Verifica se um nome de produto é inválido (ex: "Gerenciador de Live", "Sair", etc.)
 */
export function isBadProductName(name: string | null | undefined): boolean {
  if (!name) return true;

  const cleaned = cleanName(name);
  const key = normKey(cleaned);

  // Nome muito curto ou vazio
  if (!key || key.length < 4) return true;

  // Regex para nomes de navegação/chrome do TikTok
  const BAD_NAMES = [
    /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live)/i,
    /^(adicionar|fixar|destacar|editar|excluir|todos|produtos?|vitrine|estoque|pedidos?)$/i,
    /^(frete gr[áa]tis|ao vivo|live|novo|new|promo|oferta|mais vendido|best ?seller|cupom|em alta|estoque|dispon[íi]vel|esgotado|vendidos?|\d+[.,]?\d*\s*(vendidos?|sold)|\d+%|\d+)$/i,
  ];

  return BAD_NAMES.some((rx) => rx.test(cleaned));
}

/**
 * Extrai o nome de um produto a partir do texto bruto
 */
export function inferNameFromProductText(text: string, price?: string): string {
  let s = cleanName(text);

  // Remove números no início (ex: "1. Produto")
  s = s.replace(/^\d+\s+/, "");

  // Se houver preço, remove o preço e tudo depois
  if (price) {
    s = s.split(price)[0] || s;
  }

  // Remove termos de metadados (ex: "em estoque", "frete grátis")
  s =
    s.split(
      /\b(?:em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em|frete\s+gr[áa]tis)\b/i,
    )[0] || s;

  // Remove preço no formato "R$ 100"
  s = s.replace(/\s+R\$\s?\d[\d.,].*$/i, "");

  // Remove números soltos no final
  s = s.replace(/\s+\d+\s*$/, "");

  return cleanName(s);
}

/**
 * Verifica se uma string parece ser um handle de usuário (ex: "@loja", "arthurdias993")
 */
export function isHandleName(name: string): boolean {
  const cleaned = cleanName(name);
  const HANDLE_RX = /^@?[a-z][a-z0-9._-]{2,}\d{0,6}$/i;
  return HANDLE_RX.test(cleaned);
}

/**
 * Gera uma chave única para um produto (usando PID ou nome normalizado)
 */
export function productKey(product: { pid?: string; name?: string }): string | null {
  if (product?.pid) {
    return `#${product.pid}`;
  }
  const key = normKey(product?.name);
  return key || null;
}

/**
 * Verifica se dois nomes de produtos são similares (um pode ser truncado do outro)
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 10 || b.length < 10) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/**
 * Regex para detectar preços em strings
 */
export const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;

/**
 * Regex para detectar CTAs (Call-to-Action) em strings
 */
export const CTA_RX = /(fixar|apresentar|adicionar|destacar|vender|comprar)/i;

/**
 * Regex para detectar badges do TikTok
 */
export const BADGE_RX =
  /^(frete gr[áa]tis|ao vivo|live|novo|new|promo|oferta|mais vendido|best ?seller|cupom|em alta|estoque|dispon[íi]vel|esgotado|vendidos?|\d+[.,]?\d*\s*(vendidos?|sold)|\d+%|\d+)$/i;

/**
 * Regex para detectar nomes de navegação do TikTok
 */
export const JUNK_NAME_RX =
  /^(adicionar|fixar|destacar|editar|excluir|vender|ver mais|todos|produtos?|vitrine|estoque|pedidos?|apresentar|remover|comprar|carrinho)$/i;

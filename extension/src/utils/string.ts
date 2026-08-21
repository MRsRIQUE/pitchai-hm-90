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
 * Teto de caracteres de um nome de produto.
 *
 * Os títulos mais compridos do catálogo real (do tipo "Basike Teclado Mecanico
 * Gamer Sem Fio 99 Teclas RGB...") ficam perto de 160, então 200 dá folga sem
 * deixar passar texto de tela. É o mesmo teto do `ProductSchema`: assim nenhum
 * nome sobrevive ao filtro para morrer depois, calado, na validação.
 */
export const MAX_PRODUCT_NAME_LEN = 200;

/**
 * Emendas de `textContent`: quando o nome é o texto de um container inteiro, as
 * palavras grudam na fronteira entre elementos irmãos ("relâmpagoRecompensa").
 *
 * Exige 3 minúsculas antes da maiúscula porque marca não é emenda: "iPhone",
 * "20000mAh" e "MagSafe" têm no máximo 2 e não entram na conta, enquanto
 * "relâmpago|Recompensa" e "produtos|Os" entram.
 */
const GLUED_WORDS_RX = /\p{Ll}{3}\p{Lu}/gu;

/**
 * Um nome real chega a 3 emendas somando marcas ("PowerBank ... SmartWatch"),
 * o lixo importado tinha 9. O corte fica no meio, sem depender de rótulo algum.
 */
const MAX_GLUED_WORDS = 3;

/**
 * Frases de estado vazio da vitrine. Não são ancoradas de propósito: aparecem
 * tanto sozinhas quanto no meio de um textContent emendado.
 */
const EMPTY_STATE_RX =
  /(ainda\s+n[ãa]o\s+h[áa]\s+produtos|produtos\s+adicionados\s+aparecer[ãa]o|apenas\s+para\s+espectadores)/i;

/**
 * Controles comerciais vizinhos da vitrine. São entidades com imagem, valor e
 * até id próprio, mas não mercadorias que possam ser apresentadas na LIVE.
 */
const NON_PRODUCT_LABEL_RX =
  /^(?:cup(?:om|ons)\b|promo(?:ç(?:ão|ões)|cao|coes)\b|oferta\s+rel[âa]mpago\b|cat[áa]logo(?:\s+(?:todos?|de\s+produtos?))?\b|todos?\s+(?:os\s+)?produtos?\b|recompensas?\b|cartaz(?:es)?(?:\s+de\s+cupom)?\b|descontos?\b|(?:r\$\s*)?\d+(?:[.,]\d+)?\s*(?:%|reais?)?\s*(?:off|de\s+desconto)\b)/i;

/**
 * Verifica se um nome de produto é inválido (ex: "Gerenciador de Live", "Sair", etc.)
 */
export function isBadProductName(name: string | null | undefined): boolean {
  if (!name) return true;

  const cleaned = cleanName(name);
  const key = normKey(cleaned);

  // Nome muito curto ou vazio
  if (!key || key.length < 4) return true;

  // Comprimento e emendas são as duas defesas que não dependem de conhecer os
  // rótulos do TikTok — continuam valendo quando ele renomeia os botões.
  if (cleaned.length > MAX_PRODUCT_NAME_LEN) return true;
  if ((cleaned.match(GLUED_WORDS_RX) || []).length > MAX_GLUED_WORDS) return true;
  if (EMPTY_STATE_RX.test(cleaned)) return true;
  if (NON_PRODUCT_LABEL_RX.test(cleaned)) return true;

  // Regex para nomes de navegação/chrome do TikTok
  const BAD_NAMES = [
    /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live)/i,
    /^(adicionar|fixar|destacar|editar|excluir|todos|produtos?|vitrine|estoque|pedidos?)$/i,
    /^(frete gr[áa]tis|ao vivo|live|novo|new|promo|oferta|mais vendido|best ?seller|cupom|em alta|estoque|dispon[íi]vel|esgotado|vendidos?|\d+[.,]?\d*\s*(vendidos?|sold)|\d+%|\d+)$/i,
  ];

  return BAD_NAMES.some((rx) => rx.test(cleaned));
}

/**
 * Corta o rabo de metadados do card (cronômetro de oferta, estoque, frete)
 * que a emenda do textContent cola no fim do título.
 *
 * O primeiro replace desgruda só o rótulo com inicial maiúscula colado em
 * minúscula ("CozinhaTermina em" → "Cozinha Termina em"): assim o split com
 * \b passa a enxergar a fronteira, e palavras que só CONTÊM o rótulo ficam
 * inteiras ("Kit Determina em Pó" não vira "Kit Dete"). Cópia do content.js —
 * as duas não podem divergir (ver tests/vitrine-products.test.ts).
 */
export function stripProductMeta(raw: string | null | undefined): string {
  let s = String(raw || "");
  s = s.replace(
    /(\p{Ll})(Termina\s+em|Em\s+estoque|Demonstra[çc][ãa]o\s+solicitada|Frete\s+gr[áa]tis)/gu,
    "$1 $2",
  );
  s =
    s.split(
      /\b(?:em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em|frete\s+gr[áa]tis)\b/i,
    )[0] || s;
  // Sobras do cronômetro/promoção quando vêm depois do trecho cortado.
  s = s.replace(/(?:\s*\d{1,2}:\d{2}:\d{2}\s*)+$/, "");
  s = s.replace(/\s+(?:de|por)$/i, "");
  return cleanName(s);
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

  // Remove termos de metadados (ex: "em estoque", "frete grátis"), colados ou não
  s = stripProductMeta(s);

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

// ============================================================================
// Preço e foto do produto — o que o painel consome (ver sections/produto.ts)
// ============================================================================

/**
 * Preço do produto em CENTAVOS.
 *
 * Inteiro e nunca decimal: dinheiro em float acumula erro (0.1 + 0.2 já não é
 * 0.3) e um catálogo somado no cliente começa a divergir do TikTok.
 */
export type PrecoCentavos = {
  /** Menor preço do texto — é o que o vendedor anuncia. */
  cents: number;
  /** Só quando o texto traz uma FAIXA de verdade ("R$ 29,90 - R$ 49,90"). */
  maxCents?: number;
};

/** Liga os dois lados de uma faixa. "De X por Y" fica de fora: é preço riscado. */
const PRICE_RANGE_SEP_RX = /^\s*[-–—~]\s*$/;

/**
 * Converte um número escrito pela vitrine em centavos.
 *
 * O separador decimal é decidido pela quantidade de dígitos que vem depois dele,
 * não pelo símbolo: assim "R$ 1.299" (milhar) e "R$ 89,90" (centavo) saem certos
 * sem depender de a página estar em pt-BR.
 */
function numberToCents(raw: string): number | null {
  const limpo = raw.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  if (!limpo) return null;

  const posDecimal = Math.max(limpo.lastIndexOf(","), limpo.lastIndexOf("."));
  let inteiros = limpo;
  let centavos = "00";

  if (posDecimal >= 0) {
    const fracao = limpo.slice(posDecimal + 1);
    // 3 dígitos depois do separador é milhar ("1.299"), não centavo.
    if (fracao.length === 1 || fracao.length === 2) {
      inteiros = limpo.slice(0, posDecimal);
      centavos = fracao.padEnd(2, "0");
    }
  }

  const digitos = inteiros.replace(/\D/g, "");
  // Acima de 9 dígitos não é preço: é id de produto que escapou do PRICE_RX.
  if (!digitos || digitos.length > 9) return null;

  return Number(digitos) * 100 + Number(centavos);
}

/**
 * Lê o preço de um texto da vitrine.
 *
 * Devolve `null` quando não há preço — e nunca `{ cents: 0 }` para dizer "não
 * sei", porque zero é um preço válido e o painel anunciaria o produto de graça.
 */
export function parsePriceCents(raw: string | null | undefined): PrecoCentavos | null {
  if (!raw) return null;

  const texto = String(raw);
  const rx = new RegExp(PRICE_RX.source, "gi");
  const achados: { cents: number; inicio: number; fim: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = rx.exec(texto)) !== null) {
    const cents = numberToCents(m[0]);
    if (cents !== null) {
      achados.push({ cents, inicio: m.index, fim: m.index + m[0].length });
    }
  }

  if (achados.length === 0) return null;

  // Faixa só quando os dois preços estão ligados por hífen ou til. Em "De R$
  // 99,90 por R$ 49,90" vale o menor — anunciar "de 49,90 a 99,90" seria mentira.
  for (let i = 1; i < achados.length; i++) {
    if (!PRICE_RANGE_SEP_RX.test(texto.slice(achados[i - 1].fim, achados[i].inicio))) continue;
    const menor = Math.min(achados[i - 1].cents, achados[i].cents);
    const maior = Math.max(achados[i - 1].cents, achados[i].cents);
    if (menor !== maior) return { cents: menor, maxCents: maior };
  }

  return { cents: Math.min(...achados.map((a) => a.cents)) };
}

/** Símbolo escrito na vitrine → código ISO 4217, que é o que o painel formata. */
const CURRENCY_BY_SYMBOL: Record<string, string> = {
  R$: "BRL",
  US$: "USD",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
};

/**
 * Moeda do preço, lida do símbolo que a própria vitrine escreveu.
 *
 * `undefined` quando não há preço: o painel assume BRL nesse caso, e chutar a
 * moeda seria pior que omitir — trocaria o rótulo de um valor certo.
 */
export function currencyFromPrice(raw: string | null | undefined): string | undefined {
  const simbolo = String(raw || "").match(PRICE_RX)?.[1];
  return simbolo ? CURRENCY_BY_SYMBOL[simbolo.toUpperCase()] : undefined;
}

/** Teto combinado com o painel: acima disso ele ignora e cai no fallback. */
export const MAX_IMAGE_URL_LEN = 2048;

/**
 * URL de foto que sobrevive à viagem até o painel.
 *
 * Só http(s): `blob:` morre fora da aba do TikTok e `data:` estoura o limite de
 * 1 MiB do documento no Firestore. Domínio não entra no teste de propósito — a
 * CDN do TikTok rotaciona host, e uma allowlist aqui derrubaria foto boa em
 * silêncio; o painel já degrada para as iniciais quando a imagem falha.
 */
export function isUsableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const limpo = String(url).trim();
  if (limpo.length > MAX_IMAGE_URL_LEN) return false;
  return /^https?:\/\/\S+$/i.test(limpo);
}

/**
 * Maior resolução de um `srcset`.
 *
 * A vírgula só separa candidatos quando vem antes de outra URL: a própria URL
 * pode ter vírgula (a CDN do TikTok usa em parâmetro de recorte), e um split
 * ingênuo em "," partiria o endereço no meio.
 */
export function pickBestSrcsetUrl(srcset: string | null | undefined): string {
  if (!srcset) return "";

  let melhor = "";
  let melhorPeso = -1;

  for (const parte of String(srcset).split(/,\s+(?=https?:\/\/|\/)/)) {
    const [url, descritor] = parte.trim().split(/\s+/);
    if (!url) continue;

    // "800w" e "2x" viram 800 e 2; sem descritor vale 1. Misturar as duas
    // unidades no mesmo srcset não acontece na prática.
    const peso = descritor ? parseFloat(descritor) || 1 : 1;
    if (peso > melhorPeso) {
      melhorPeso = peso;
      melhor = url;
    }
  }

  return melhor;
}

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

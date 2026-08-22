import type { Product } from "@/lib/live/config";

/*
 * Leitura de mídia e preço do produto para a UI.
 *
 * Os campos (`imageUrl`, `priceCents`, `priceMaxCents`, `currency`) vivem no
 * `Product` de `lib/live/config` e são todos opcionais: o catálogo já gravado
 * não os tem, e a vitrine nem sempre consegue extraí-los. Cada função aqui
 * trata a ausência em vez de assumir que o dado chegou.
 */

/** Comprimento máximo aceito para a URL da foto. Ver `urlDaImagem`. */
const MAX_URL = 2048;

/**
 * Código de moeda que o `Intl` aceita, com "BRL" como piso.
 *
 * Não é preciosismo: `Intl.NumberFormat` lança `RangeError` para qualquer coisa
 * que não sejam três letras — inclusive o símbolo cru `"R$"`. Como isto roda
 * dentro do render, a exceção derrubaria o painel inteiro por causa de um campo
 * de texto torto vindo do catálogo. Três letras desconhecidas (`"XYZ"`) o `Intl`
 * exibe sem reclamar, então basta checar a forma.
 */
function moedaValida(currency: string | null | undefined): string {
  const codigo = currency?.trim();
  return codigo && /^[A-Za-z]{3}$/.test(codigo) ? codigo : "BRL";
}

/**
 * Preço pronto para exibir, ou `null` quando não há preço nenhum.
 *
 * `toLocaleString` e nunca `toFixed`: o `toFixed` não põe separador de milhar
 * nem símbolo, então o mesmo preço apareceria de dois jeitos dependendo de onde
 * fosse renderizado.
 */
export function formatarPreco(produto: Product): string | null {
  const moeda = moedaValida(produto.currency);

  const formatar = (centavos: number) =>
    (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: moeda });

  if (typeof produto.priceCents === "number" && Number.isFinite(produto.priceCents)) {
    const min = produto.priceCents;
    const max = produto.priceMaxCents;

    // Faixa só quando o teto existe e é maior: mostrar "R$ 29,90 – R$ 29,90"
    // seria ruído, e mostrar só o mínimo faria faixa parecer preço fechado.
    if (typeof max === "number" && Number.isFinite(max) && max > min) {
      return `${formatar(min)} – ${formatar(max)}`;
    }
    return formatar(min);
  }

  // Catálogo antigo: `price` é texto livre já formatado pela vitrine.
  const legado = produto.price?.trim();
  return legado ? legado : null;
}

/**
 * URL utilizável da foto, ou `null`.
 *
 * Só http(s): a origem promete isso, mas o dado passa por Firestore e
 * localStorage, e um `data:`/`javascript:` chegando até um `<img src>` é o tipo
 * de coisa que não deve depender de a origem estar correta.
 */
export function urlDaImagem(produto: Pick<Product, "imageUrl">): string | null {
  const url = produto.imageUrl?.trim();
  if (!url || url.length > MAX_URL) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Até duas letras para o fallback da foto. */
export function iniciaisDoProduto(nome: string): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((p) => /\p{L}|\p{N}/u.test(p));

  if (palavras.length === 0) return "?";
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}

/*
 * Restos da interface da vitrine que a extensão emendava na descrição do
 * produto: rótulos dos controles do card ("Fixar", "Cliques 0", "Adicionado ao
 * carrinho 0"), contadores ("Em estoque: 18,8 mil") e o cronômetro da oferta
 * ("16:08:43", "1 dia"). Nada disso descreve o produto — mas já está gravado no
 * catálogo de quem importou antes do filtro, então a tela limpa na leitura.
 */
const PALAVRA_DE_UI_RX =
  /^(?:fixar|desafixar|destacar|cliques?|clique|adicionado|adicionar|ao|no|na|carrinho|editar|excluir|remover|mover|para|o|a|topo|dias?|horas?|h|min|mins?|minutos?|s|seg|segundos?|de|por|e|em|estoque|termina|demonstra[çc][ãa]o|solicitada|vendidos?|sold|un|unid|mil|pcs?|pe[çc]as?|frete|gr[áa]tis)$/i;
const NUMERO_RX = /^\d+(?:[.,]\d+)?$/;
const HORARIO_RX = /^\d{1,2}:\d{2}(?::\d{2})?$/;

/**
 * Um trecho é ruído quando TODAS as palavras são número, horário ou rótulo de
 * controle. "Suporte para fixar na parede" fica; ": 0 Fixar Cliques 0" cai.
 */
export function trechoEhRuidoDaVitrine(trecho: string): boolean {
  const palavras = trecho
    .toLowerCase()
    .split(/[\s;,()|•·\-–—/]+/)
    // "Cliques: 0" e ": 0" — o dois-pontos é separador, não palavra.
    .map((p) => p.replace(/^:+|:+$/g, ""))
    .filter(Boolean);
  if (palavras.length === 0) return true;
  return palavras.every(
    (p) => NUMERO_RX.test(p) || HORARIO_RX.test(p) || PALAVRA_DE_UI_RX.test(p),
  );
}

/** Descrição sem os restos da vitrine; `""` quando só havia ruído. */
export function limparDescricao(texto: string | null | undefined): string {
  return String(texto ?? "")
    .split(/\s*(?:\r?\n|·|\|)\s*/)
    // Tira só o separador que sobrou na ponta (": 0 …", "… ·"); o ponto final
    // fica — ele é do texto do vendedor.
    .map((t) => t.replace(/^[\s:;,·|•\-–—]+|[\s:;,·|•\-–—]+$/g, "").trim())
    .filter((t) => t && !trechoEhRuidoDaVitrine(t))
    .join(" · ");
}

/** Descrição pronta para a tela — ver `limparDescricao`. */
export function descricaoDoProduto(produto: Product): string {
  return limparDescricao(produto.description);
}

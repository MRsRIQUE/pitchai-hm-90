/**
 * Lógica para manipulação de produtos do TikTok Shop
 * Inclui parsing, validação, dedupe e gerenciamento de catálogo
 */

import {
  Product,
  Config,
  parseProduct,
  productKey,
  namesMatch,
  isBadProductName,
  cleanName,
  normKey,
  parsePriceCents,
  currencyFromPrice,
  isUsableImageUrl,
  pickBestSrcsetUrl,
  PRICE_RX,
  CTA_RX,
} from "../types";
import { emitProductsUpdate } from "./events";
export function extractProductId(card: HTMLElement): string | null {
  const selectors = [
    "[data-product-id]",
    "[data-goods-id]",
    "[data-pid]",
    "a[href*='/product/']",
    "[data-tid*='product']",
    "[data-e2e*='product']",
  ];

  for (const sel of selectors) {
    const el = card.querySelector<HTMLElement>(sel);
    if (el) {
      const anchor = el as HTMLAnchorElement;
      const id =
        el.getAttribute("data-product-id") ||
        el.getAttribute("data-goods-id") ||
        el.getAttribute("data-pid") ||
        (typeof anchor.href === "string" ? anchor.href.match(/\/product\/(\d+)/)?.[1] : "") ||
        el.getAttribute("data-tid") ||
        el.getAttribute("data-e2e");

      if (id && String(id).length >= 5) {
        return String(id).slice(0, 64);
      }
    }
  }

  return null;
}

/**
 * Extrai o nome do produto de um elemento DOM
 */
export function extractProductName(card: HTMLElement, text: string, price: string): string {
  // Tentar extrair de atributos conhecidos
  const titleSelectors = [
    "[data-e2e*='title']",
    "[class*='title']",
    "[class*='name']",
    "h1, h2, h3, h4",
    "[data-tid*='title']",
  ];

  for (const sel of titleSelectors) {
    const el = card.querySelector<HTMLElement>(sel);
    if (el) {
      const name = cleanName(el.textContent || el.getAttribute("title") || "");
      if (name.length >= 4 && !PRICE_RX.test(name)) {
        return name;
      }
    }
  }

  // Tentar extrair de imagens (alt text)
  const img = Array.from(card.querySelectorAll<HTMLImageElement>("img")).find(
    (i) => !looksLikeAvatar(i) && i.getAttribute("alt"),
  );

  if (img) {
    const alt = cleanName(img.getAttribute("alt") || "");
    if (alt.length >= 4) {
      return alt;
    }
  }

  // Tentar extrair de aria-label
  const aria = cleanName(card.getAttribute("aria-label") || "");
  if (aria.length >= 4) {
    return aria;
  }

  // Fallback: inferir do texto do card
  return inferNameFromProductText(text, price);
}

/**
 * Verifica se uma imagem parece ser um avatar (redonda ou muito pequena)
 */
export function looksLikeAvatar(img: HTMLImageElement): boolean {
  try {
    const r = img.getBoundingClientRect();
    if (r.width && r.width < 40) return true;

    const br = getComputedStyle(img).borderRadius || "";
    if (/(50|100)%/.test(br)) return true;
  } catch {
    // Ignora erros
  }
  return false;
}

/**
 * Extrai o preço de um elemento DOM
 */
export function extractPrice(card: HTMLElement): string {
  const text = card.textContent || "";
  const priceMatch = text.match(PRICE_RX);
  return priceMatch ? priceMatch[0].replace(/\s+/g, " ").trim().slice(0, 40) : "";
}

/**
 * Extrai a foto do produto de um elemento DOM.
 *
 * Pula avatar: há foto de perfil no DOM da live, e é justamente por isso que
 * `looksLikeAvatar` existe. Prefere o `srcset` porque ele traz a resolução maior
 * — o `src` costuma vir na miniatura borrada que o TikTok usa no carregamento.
 */
export function extractImageUrl(card: HTMLElement): string {
  for (const img of Array.from(card.querySelectorAll<HTMLImageElement>("img"))) {
    if (looksLikeAvatar(img)) continue;

    const candidata =
      pickBestSrcsetUrl(img.getAttribute("srcset")) || (img.getAttribute("src") || "").trim();
    if (isUsableImageUrl(candidata)) return candidata;
  }

  // Muito card do TikTok pinta a foto como background em vez de <img>.
  const comFundo = [card, ...Array.from(card.querySelectorAll<HTMLElement>("[style*='image']"))];
  for (const el of comFundo) {
    try {
      const url = (getComputedStyle(el).backgroundImage || "").match(/url\(["']?(.*?)["']?\)/)?.[1];
      if (isUsableImageUrl(url)) return url as string;
    } catch {
      // Ignora erros
    }
  }

  return "";
}

/**
 * Extrai a descrição de um elemento DOM
 */
export function extractDescription(text: string, name: string, price: string): string {
  return text
    .replace(name, "")
    .replace(price, "")
    .split(/[\n·|]/)
    .map(cleanName)
    .filter((l) => l.length > 3)
    .slice(0, 3)
    .join(" · ")
    .slice(0, 400);
}

/**
 * Infere o nome do produto a partir do texto bruto
 */
export function inferNameFromProductText(text: string, price?: string): string {
  let s = cleanName(text);
  s = s.replace(/^\d+\s+/, ""); // Remove números no início

  if (price) {
    s = s.split(price)[0] || s;
  }

  // Remove termos de metadados
  s =
    s.split(
      /\b(?:em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em|frete\s+gr[áa]tis)\b/i,
    )[0] || s;

  s = s.replace(/\s+R\$\s?\d[\d.,].*$/i, ""); // Remove preço
  s = s.replace(/\s+\d+\s*$/, ""); // Remove números no final

  return cleanName(s);
}

/**
 * Parseia um card de produto do TikTok
 */
export function parseProductCard(card: HTMLElement): Product | null {
  if (!(card instanceof HTMLElement)) return null;

  try {
    const text = (card.textContent || "").replace(/\s+/g, " ").trim();

    if (text.length < 5 || text.length > 800) return null;

    // Regex para detectar se é um card de navegação
    const PRODUCT_CHROME_RX = /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias)/i;
    if (PRODUCT_CHROME_RX.test(text) && !PRICE_RX.test(text)) return null;

    const price = extractPrice(card);
    const pid = extractProductId(card);

    // Se não tem preço, ID ou imagens, não é um produto
    const imgCount = card.querySelectorAll("img").length;
    if (!price && !imgCount && !pid) return null;

    // Se não tem preço e tem muitas imagens, provavelmente é um carousel
    if (!price && imgCount > 2) return null;

    // Sem preço e sem ID: só aceita com imagem de card ou CTA
    if (!price && !pid) {
      const realImg = Array.from(card.querySelectorAll("img")).some((i) => !looksLikeAvatar(i));
      if (!realImg && !CTA_RX.test(text)) return null;
    }

    const name = extractProductName(card, text, price);
    if (isBadProductName(name)) return null;

    const description = extractDescription(text, name, price);
    const centavos = parsePriceCents(price);
    const imageUrl = extractImageUrl(card);

    // Campos ausentes em vez de vazios: o painel distingue "não sei o preço" de
    // "de graça" pela ausência, e um 0 aqui anunciaria o produto errado.
    return {
      pid: pid || "",
      name,
      price,
      ...(centavos ? { priceCents: centavos.cents } : {}),
      ...(centavos?.maxCents ? { priceMaxCents: centavos.maxCents } : {}),
      ...(currencyFromPrice(price) ? { currency: currencyFromPrice(price) } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      description,
      fromVitrine: true,
    };
  } catch (error) {
    console.warn("[products] Failed to parse product card:", error);
    return null;
  }
}

// ============================================================================
// Gerenciamento de Catálogo
// ============================================================================

/**
 * Map de produtos (usado para dedupe)
 */
const productMap = new Map<string, Product>();

/**
 * Adiciona ou atualiza um produto no catálogo
 */
export function upsertProduct(product: Product): void {
  const key = productKey(product);
  if (!key) return;

  const existing = productMap.get(key);

  if (existing) {
    // Merge das informações
    const merged: Product = {
      ...existing,
      ...product,
      // Preferir dados não vazios
      name: product.name || existing.name,
      price: product.price || existing.price,
      description: product.description || existing.description,
      pid: product.pid || existing.pid,
    };

    // Se agora temos um PID, atualiza a chave
    if (merged.pid && !existing.pid) {
      productMap.delete(key);
      productMap.set(`#${merged.pid}`, merged);
    } else {
      productMap.set(key, merged);
    }
  } else {
    productMap.set(key, product);
  }

  // Emitir evento de atualização
  emitProductsUpdate(Array.from(productMap.values()));
}

/**
 * Remove um produto do catálogo
 */
export function removeProduct(product: Product): void {
  const key = productKey(product);
  if (!key) return;

  productMap.delete(key);
  emitProductsUpdate(Array.from(productMap.values()));
}

/**
 * Obtém todos os produtos do catálogo
 */
export function getProducts(): Product[] {
  return Array.from(productMap.values());
}

/**
 * Limpa o catálogo
 */
export function clearProducts(): void {
  productMap.clear();
  emitProductsUpdate([]);
}

/**
 * Adiciona múltiplos produtos ao catálogo
 */
export function addProducts(products: Product[]): void {
  products.forEach(upsertProduct);
}

// ============================================================================
// Validação e Limpeza
// ============================================================================

/**
 * Verifica se um produto deve ser removido do catálogo
 */
export function shouldDropProduct(product: Product): boolean {
  if (!product || typeof product !== "object") return true;

  const name = product.name || "";
  if (isBadProductName(name)) return true;

  const fromAuto = !!product.fromVitrine || !!product.demo;
  if (fromAuto && !product.price) {
    const PRODUCT_CHROME_RX = /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias)/i;
    return PRODUCT_CHROME_RX.test(name);
  }

  return false;
}

/**
 * Limpa o catálogo de produtos inválidos
 */
export function cleanupProducts(config: Config): boolean {
  if (!config || !Array.isArray(config.produtos)) return false;

  const before = config.produtos.length;
  const validProducts: Product[] = [];
  const seenKeys = new Set<string>();

  for (const p of config.produtos) {
    if (shouldDropProduct(p)) continue;

    const key = productKey(p);
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    validProducts.push(p);
  }

  // Atualiza o catálogo
  clearProducts();
  addProducts(validProducts);

  // Atualiza a configuração
  config.produtos = validProducts;

  // Marca o primeiro produto como ativo se nenhum estiver
  if (!config.produtos.some((p) => p.active) && config.produtos[0]) {
    config.produtos[0].active = true;
  }

  return config.produtos.length !== before;
}

// ============================================================================
// Coleta de Produtos
// ============================================================================

/**
 * Coleta cards de produto de um elemento DOM
 */
export function collectProductCards(
  root: Element | Document,
  out: Set<Element> = new Set(),
): Set<Element> {
  if (!root) return out;

  // Tentar adicionar o próprio elemento
  try {
    if (root instanceof HTMLElement) {
      addIfProductCard(root, out);
    }
  } catch {
    // Ignora erros
  }

  // Tentar adicionar os filhos
  try {
    Array.from(root.children || []).forEach((child) => {
      addIfProductCard(child, out);
    });
  } catch {
    // Ignora erros
  }

  // Selectores conhecidos para cards de produto
  const selectors = [
    "[data-tid*='product']",
    "[data-e2e*='product']",
    "[class*='ProductItem']",
    "[class*='product-item']",
    "[class*='ProductCard']",
    "[class*='product-card']",
    "[class*='LiveProduct']",
    "[class*='GoodsItem']",
    "[class*='goods-item']",
    "[class*='ShopProduct']",
    "img",
  ];

  selectors.forEach((sel) => {
    try {
      (root instanceof Document ? root : root.ownerDocument || document)
        .querySelectorAll(sel)
        .forEach((node) => {
          let cur: HTMLElement | null = node instanceof HTMLElement ? node : null;
          let hops = 0;

          while (cur && hops++ < 6) {
            addIfProductCard(cur, out);
            cur = cur.parentElement;
          }
        });
    } catch {
      // Ignora erros
    }
  });

  return out;
}

/**
 * Verifica se um elemento parece ser um card de produto
 */
export function addIfProductCard(el: Element, out: Set<Element>): boolean {
  if (!(el instanceof HTMLElement)) return false;

  try {
    // Se o elemento já tem múltiplas linhas de produto, não é um card
    if (hasMultipleProductRows(el)) return false;

    const parsed = parseProductCard(el);
    if (!parsed) return false;

    if (isBadProductName(parsed.name)) return false;

    out.add(el);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica se um elemento tem múltiplas linhas de produto
 */
export function hasMultipleProductRows(el: Element): boolean {
  let count = 0;

  try {
    Array.from(el.children || []).forEach((child) => {
      const text = child.textContent || "";
      if (PRICE_RX.test(text) && child.querySelector?.("img")) {
        count++;
      }
    });
  } catch {
    // Ignora erros
  }

  return count >= 2;
}

// ============================================================================
// Scraping de Vitrine
// ============================================================================

/**
 * Scrapeia o catálogo de produtos do TikTok
 */
export async function scrapeCatalog(
  sector?: Element | null,
  deep: boolean = false,
): Promise<Product[]> {
  const results: Map<string, Product> = new Map();

  // 1. Adicionar produtos da rede (API do TikTok)
  // (Isso será feito pelo hook.js e enviado via eventos)

  // 2. Adicionar produtos do DOM
  const cards = new Set<Element>();

  if (sector) {
    collectProductCards(sector, cards);
  } else {
    // Se não houver setor definido, procurar em todo o documento
    const allDocs = getAllDocuments();
    allDocs.forEach((doc) => {
      collectProductCards(doc, cards);
    });
  }

  // Processar os cards
  let domCount = 0;
  cards.forEach((card) => {
    let parsed: Product | null = null;

    try {
      parsed = parseProductCard(card as HTMLElement);
    } catch {
      parsed = null;
    }

    if (!parsed) return;
    if (isBadProductName(parsed.name)) return;

    domCount++;
    upsertProduct(parsed);
    results.set(productKey(parsed) || "", parsed);
  });

  return Array.from(results.values());
}

/**
 * Obtém todos os documentos acessíveis (página + iframes)
 */
export function getAllDocuments(): (Document | HTMLDocument)[] {
  const docs = [document];

  const walk = (doc: Document, depth: number) => {
    if (depth > 3) return;

    try {
      doc.querySelectorAll("iframe").forEach((f) => {
        let d: Document | null = null;

        try {
          d = f.contentDocument;
        } catch {
          d = null;
        }

        if (d && !docs.includes(d)) {
          docs.push(d);
          walk(d, depth + 1);
        }
      });
    } catch {
      // Ignora erros
    }
  };

  try {
    walk(document, 0);
  } catch {
    // Ignora erros
  }

  return docs;
}

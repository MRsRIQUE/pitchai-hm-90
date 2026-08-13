/**
 * Hook de rede - Intercepta requisições do TikTok Shop
 * Captura dados de produtos e mensagens do chat
 * 
 * Este script roda no MAIN world da página para ter acesso ao fetch/XHR/WebSocket
 */

// ============================================================================
// Constantes
// ============================================================================

const TAG = "__pitchai_net__";
const URL_RX = /(product|goods|promotion|shop|comment|message|barrage|danmaku|chat|live)/i;
const MAX_BODY = 4_000_000;

// ============================================================================
// Tipos
// ============================================================================

interface NetPayload {
  products: unknown[];
  messages: unknown[];
}

// ============================================================================
// Funções de Postagem
// ============================================================================

/**
 * Posta uma mensagem para o content script
 */
function post(kind: "products" | "messages", payload: unknown[]): void {
  if (!payload || !payload.length) return;
  
  try {
    window.postMessage({
      source: TAG,
      kind,
      payload,
    }, "*");
  } catch (error) {
    console.warn("[PitchAI Network Hook] Failed to post message:", error);
  }
}

// ============================================================================
// Funções de String
// ============================================================================

/**
 * Converte um valor para string e limpa
 */
function str(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

// ============================================================================
// Extração de Produtos
// ============================================================================

const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;
const PRODUCT_CHROME_RX = /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live)/i;
const BAD_PRODUCT_RX = /^(adicionar|fixar|destacar|editar|excluir|todos|produtos?|vitrine|estoque|pedidos?)$/i;

/**
 * Busca um valor em um objeto seguindo um path
 */
function deep(o: unknown, ...paths: string[]): string {
  for (const path of paths) {
    let cur: unknown = o;
    for (const seg of path.split(".")) {
      if (cur == null) break;
      cur = Array.isArray(cur) ? cur[0] : (cur as Record<string, unknown>)[seg];
    }
    const s = str(cur);
    if (s) return s;
  }
  return "";
}

/**
 * Extrai o preço de um objeto
 */
function priceOf(o: Record<string, unknown>): string {
  const direct = (
    str(o.format_price) ||
    str(o.price_str) ||
    str(o.sale_price_format) ||
    str(o.min_price_format) ||
    str(o.display_price) ||
    str(o.price_format)
  );
  
  if (direct) return direct.slice(0, 40);
  
  const nested = deep(
    o,
    "price.real_price.price_str",
    "price.real_price.format_price",
    "price.price_str",
    "price.format_price",
    "min_price.price_str",
    "max_price.price_str",
    "sku_list.price.real_price.price_str",
    "sku_list.price.price_str",
    "sku_list.price.format_price",
  );
  
  if (nested) return nested.slice(0, 40);
  
  for (const k of ["price", "sale_price", "min_price", "current_price"]) {
    const v = o[k];
    if (typeof v === "string" && PRICE_RX.test(v)) {
      return v.trim().slice(0, 40);
    }
    if (v && typeof v === "object") {
      const inner = (
        str((v as Record<string, unknown>).format_price) ||
        str((v as Record<string, unknown>).price_str) ||
        str((v as Record<string, unknown>).display_price) ||
        str((v as Record<string, unknown>).text)
      );
      if (inner) return inner.slice(0, 40);
    }
  }
  
  return "";
}

/**
 * Converte um objeto em um produto
 */
function asProduct(o: Record<string, unknown>): Record<string, unknown> | null {
  const base = (o.product_base || o.base_info || o.detail || null) as Record<string, unknown>;
  const src = base && typeof base === "object" ? { ...base, ...o } : o;
  
  const name = (
    str(src.title) ||
    str(src.product_name) ||
    str(src.name) ||
    str(src.product_title) ||
    str(src.goods_name) ||
    deep(o, "product_base.title", "base_info.title", "detail.title", "product_info.title")
  );
  
  if (name.length < 4 || name.length > 220) return null;
  if (PRODUCT_CHROME_RX.test(name) || BAD_PRODUCT_RX.test(name)) return null;
  
  const id = (src.product_id ?? src.productId ?? src.sku_id ?? src.goods_id ?? src.id ?? null) as string | null;
  const price = priceOf(src) || priceOf(o);
  
  // Verifica se tem formato de produto
  const hasProductShape = (
    id != null &&
    String(id).length >= 5 &&
    (!!price ||
      src.cover != null ||
      src.image != null ||
      src.images != null ||
      src.product_status != null ||
      src.sku_list != null ||
      src.stock != null ||
      base)
  );
  
  if (!hasProductShape) return null;
  
  const description = (
    str(src.desc) ||
    str(src.description) ||
    str(src.sell_point) ||
    str(src.brief) ||
    ""
  );
  
  let stock: number | undefined;
  if (typeof src.stock === "number") {
    stock = src.stock;
  } else if (typeof src.stock_num === "number") {
    stock = src.stock_num;
  }
  
  const image = str(src.cover) || str(src.image) || "";
  
  let index: number | undefined;
  if (typeof src.index === "number") {
    index = src.index;
  } else if (typeof src.position === "number") {
    index = src.position;
  }
  
  return {
    pid: id != null ? String(id).slice(0, 64) : "",
    name: name.slice(0, 200),
    price,
    description: description.slice(0, 400),
    stock,
    image,
    index,
  };
}

// ============================================================================
// Extração de Mensagens
// ============================================================================

const SYSTEM_MSG_RX = /(entrou na (live|sala)|joined|acabou de seguir|come[çc]ou a seguir|started following|enviou (um|uma)? ?(presente|rosa|coraç[ãa]o)|sent (a )?gift|curtiu|liked|compartilhou|shared|bem-?vind[oa] à live|welcome to the live|assistindo agora|espectadores?)/i;
const CHAT_CHROME_RX = /^(chat|todos\s+os\s+coment[áa]rios|relacionados\s+ao\s+produto|digite\s+algo|0\/100|os\s+coment[áa]rios\s+dos\s+espectadores\.*)$/i;

/**
 * Converte um objeto em uma mensagem
 */
function asMessage(o: Record<string, unknown>): Record<string, unknown> | null {
  const text = (
    str(o.content) ||
    str(o.comment) ||
    str(o.text) ||
    str(o.message)
  );
  
  if (!text || text.length < 2 || text.length > 300) return null;
  
  const user = o.user || o.author || o.sender || {};
  const author = (
    str(o.nickname) ||
    str((user as Record<string, unknown>).nickname) ||
    str((user as Record<string, unknown>).display_name) ||
    str((user as Record<string, unknown>).display_id) ||
    str(o.user_name) ||
    str(o.username)
  );
  
  if (!author) return null;
  
  // Ignora eventos de sistema (presente, follow, entrada)
  if (o.gift_id || o.giftId || o.action_type === "follow") return null;
  
  return {
    author: author.slice(0, 40),
    text,
  };
}

// ============================================================================
// Coleta Recursiva
// ============================================================================

/**
 * Coleta produtos e mensagens de um objeto JSON
 */
function collect(
  node: unknown,
  out: NetPayload,
  depth: number = 0,
): void {
  if (!node || depth > 8) return;
  
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length && i < 400; i++) {
      collect(node[i], out, depth + 1);
    }
    return;
  }
  
  if (typeof node !== "object") return;
  
  const p = asProduct(node as Record<string, unknown>);
  if (p) {
    out.products.push(p);
  } else {
    const m = asMessage(node as Record<string, unknown>);
    if (m) out.messages.push(m);
  }
  
  let keys: string[] = [];
  try {
    keys = Object.keys(node as Record<string, unknown>);
  } catch {
    return;
  }
  
  for (const k of keys) {
    const v = (node as Record<string, unknown>)[k];
    if (v && typeof v === "object") {
      collect(v, out, depth + 1);
    }
  }
}

// ============================================================================
// Dedupe
// ============================================================================

const seenProducts = new Set<string>();
const seenMessages = new Set<string>();

function handleJson(data: unknown): void {
  const out: NetPayload = { products: [], messages: [] };
  
  try {
    collect(data, out, 0);
  } catch {
    return;
  }
  
  const products: unknown[] = [];
  for (const p of out.products) {
    const key = `${(p as Record<string, unknown>).pid}|${String((p as Record<string, unknown>).name).toLowerCase()}`;
    if (seenProducts.has(key)) continue;
    seenProducts.add(key);
    products.push(p);
  }
  
  if (seenProducts.size > 800) seenProducts.clear();
  
  const messages: unknown[] = [];
  for (const m of out.messages) {
    const key = `${String((m as Record<string, unknown>).author)}|${String((m as Record<string, unknown>).text)}`.toLowerCase();
    if (seenMessages.has(key)) continue;
    seenMessages.add(key);
    messages.push(m);
  }
  
  if (seenMessages.size > 1200) seenMessages.clear();
  
  post("products", products);
  post("messages", messages);
}

function handleText(text: string, url: string): void {
  if (!text || text.length > MAX_BODY) return;
  
  const t = text.trimStart();
  if (!t.startsWith("{") && !t.startsWith("[")) return;
  
  if (url && !URL_RX.test(url) && !/product|nickname|content/i.test(t.slice(0, 4000))) {
    return;
  }
  
  let data: unknown = null;
  try {
    data = JSON.parse(t);
  } catch {
    return;
  }
  
  handleJson(data);
}

// ============================================================================
// Interceptação de Fetch
// ============================================================================

const origFetch = window.fetch;

if (typeof origFetch === "function") {
  window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    const p = origFetch.apply(this, args);
    
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "";
      
      p.then((res) => {
        try {
          const ct = res.headers.get("content-type") || "";
          if (!/json|text/i.test(ct)) return;
          
          res
            .clone()
            .text()
            .then((t) => handleText(t, url))
            .catch(() => {});
        } catch {
          // Ignora erros
        }
      }).catch(() => {});
    } catch {
      // Ignora erros
    }
    
    return p;
  };
}

// ============================================================================
// Interceptação de XMLHttpRequest
// ============================================================================

const XO = XMLHttpRequest.prototype.open;
const XS = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (
  method: string,
  url: string,
  ...rest: unknown[]
): void {
  try {
    (this as unknown as { __pitchaiUrl?: string }).__pitchaiUrl = String(url || "");
  } catch {
    // Ignora erros
  }
  return XO.apply(this, [method, url, ...rest] as Parameters<typeof XMLHttpRequest.prototype.open>);
};

XMLHttpRequest.prototype.send = function (
  ...args: Parameters<XMLHttpRequest["send"]>
): void {
  try {
    this.addEventListener("load", () => {
      try {
        const rt = (this as unknown as { responseType?: string }).responseType;
        if (rt && rt !== "text" && rt !== "json") return;
        
        const body = rt === "json" 
          ? JSON.stringify((this as unknown as { response: unknown }).response) 
          : (this as unknown as { responseText: string }).responseText;
        
        handleText(body, (this as unknown as { __pitchaiUrl?: string }).__pitchaiUrl || "");
      } catch {
        // Ignora erros
      }
    });
  } catch {
    // Ignora erros
  }
  return XS.apply(this, args);
};

// ============================================================================
// Interceptação de WebSocket
// ============================================================================

const OrigWS = window.WebSocket;

if (typeof OrigWS === "function") {
  const PatchedWS = function (url: string | URL, protocols?: string | string[]) {
    const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
    
    try {
      ws.addEventListener("message", (ev) => {
        if (typeof ev.data === "string") {
          handleText(ev.data, String(url || ""));
        }
      });
    } catch {
      // Ignora erros
    }
    
    return ws;
  };
  
  PatchedWS.prototype = OrigWS.prototype;
  
  ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach((k) => {
    try {
      (PatchedWS as unknown as Record<string, unknown>)[k] = (OrigWS as unknown as Record<string, unknown>)[k];
    } catch {
      // Ignora erros
    }
  });
  
  try {
    window.WebSocket = PatchedWS as unknown as typeof WebSocket;
  } catch {
    // Ignora erros
  }
}

// ============================================================================
// Inicialização
// ============================================================================

// Marca que o hook foi injetado
declare global {
  interface Window {
    __pitchaiHook?: boolean;
  }
}

window.__pitchaiHook = true;

export {};

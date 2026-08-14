// Pitch AI — hook de rede (roda no MAIN world da página)
// Lê as respostas do próprio TikTok (fetch / XHR / WebSocket) e repassa
// produtos e mensagens de chat para o content script via postMessage.
(function () {
  if (window.__pitchaiHook) return;
  window.__pitchaiHook = true;

  const TAG = "__pitchai_net__";
  const URL_RX = /(product|goods|promotion|shop|comment|message|barrage|danmaku|chat|live)/i;
  const MAX_BODY = 4_000_000;

  function post(kind, payload) {
    if (!payload || !payload.length) return;
    try {
      // Target = propria origin — nao broadcast para iframes de terceiros.
      const target = window.location.origin || "*";
      window.postMessage({ source: TAG, kind, payload }, target);
    } catch {}
  }

  const str = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;
  const PRODUCT_CHROME_RX =
    /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live)/i;
  const BAD_PRODUCT_RX =
    /^(adicionar|fixar|destacar|editar|excluir|todos|produtos?|vitrine|estoque|pedidos?)$/i;

  function deep(o, ...paths) {
    for (const path of paths) {
      let cur = o;
      for (const seg of path.split(".")) {
        if (cur == null) break;
        cur = Array.isArray(cur) ? cur[0] : cur[seg];
      }
      const s = str(cur);
      if (s) return s;
    }
    return "";
  }

  function priceOf(o) {
    const direct =
      str(o.format_price) ||
      str(o.price_str) ||
      str(o.sale_price_format) ||
      str(o.min_price_format) ||
      str(o.display_price) ||
      str(o.price_format);
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
      if (typeof v === "string" && PRICE_RX.test(v)) return v.trim().slice(0, 40);
      if (v && typeof v === "object") {
        const inner =
          str(v.format_price) || str(v.price_str) || str(v.display_price) || str(v.text);
        if (inner) return inner.slice(0, 40);
      }
    }
    return "";
  }

  function asProduct(o) {
    const base = o.product_base || o.base_info || o.detail || null;
    const src = base && typeof base === "object" ? { ...base, ...o } : o;
    const name =
      str(src.title) ||
      str(src.product_name) ||
      str(src.name) ||
      str(src.product_title) ||
      str(src.goods_name) ||
      deep(o, "product_base.title", "base_info.title", "detail.title", "product_info.title");
    if (name.length < 4 || name.length > 220) return null;
    if (PRODUCT_CHROME_RX.test(name) || BAD_PRODUCT_RX.test(name)) return null;
    const id = src.product_id ?? src.productId ?? src.sku_id ?? src.goods_id ?? src.id ?? null;
    const price = priceOf(src) || priceOf(o);
    // basta um id de produto: preço e imagem podem chegar depois pelo DOM
    const productEvidence = !!(
        price ||
        src.cover != null ||
        src.image != null ||
        src.images != null ||
        src.product_status != null ||
        src.sku_list != null ||
        src.stock != null ||
        base
      );
    const validId = id != null && String(id).length >= 5;
    // Algumas rotas entregam o id apenas numa segunda resposta. Ainda aceitamos
    // nome + preço + evidência de catálogo e consolidamos pelo nome no content script.
    const strongIdlessShape =
      !validId &&
      !!price &&
      !!(src.cover || src.image || src.images || src.sku_list || src.stock != null);
    const hasProductShape = productEvidence && (validId || strongIdlessShape);
    if (!hasProductShape) return null;
    const description =
      str(src.desc) || str(src.description) || str(src.sell_point) || str(src.brief) || "";
    const stock =
      typeof src.stock === "number"
        ? src.stock
        : typeof src.stock_num === "number"
          ? src.stock_num
          : undefined;
    return {
      pid: id != null ? String(id).slice(0, 64) : "",
      name: name.slice(0, 200),
      price,
      description: description.slice(0, 400),
      stock,
      image: str(src.cover) || str(src.image) || "",
      index:
        typeof src.index === "number"
          ? src.index
          : typeof src.position === "number"
            ? src.position
            : undefined,
    };
  }

  function asMessage(o) {
    const text = str(o.content) || str(o.comment) || str(o.text) || str(o.message);
    if (!text || text.length < 2 || text.length > 300) return null;
    const user = o.user || o.author || o.sender || {};
    const author =
      str(o.nickname) ||
      str(user.nickname) ||
      str(user.display_name) ||
      str(user.display_id) ||
      str(o.user_name) ||
      str(o.username);
    if (!author) return null;
    // eventos de sistema (presente, follow, entrada) não têm texto livre útil
    if (o.gift_id || o.giftId || o.action_type === "follow") return null;
    return { author: author.slice(0, 40), text };
  }

  function collect(node, out, depth) {
    if (!node || depth > 12) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length && i < 2000; i++) collect(node[i], out, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const p = asProduct(node);
    if (p) out.products.push(p);
    else {
      const m = asMessage(node);
      if (m) out.messages.push(m);
    }
    let keys = [];
    try {
      keys = Object.keys(node);
    } catch {
      keys = [];
    }
    for (const k of keys) {
      const v = node[k];
      if (v && typeof v === "object") collect(v, out, depth + 1);
    }
  }

  const seenProducts = new Map();
  const seenMessages = new Map();
  const MESSAGE_DEDUPE_MS = 45000;

  function handleJson(data) {
    const out = { products: [], messages: [] };
    try {
      collect(data, out, 0);
    } catch {
      return;
    }

    const products = [];
    for (const p of out.products) {
      const key = `${p.pid}|${p.name.toLowerCase()}`;
      const fingerprint = JSON.stringify([p.price, p.description, p.stock, p.image]);
      if (seenProducts.get(key) === fingerprint) continue;
      seenProducts.set(key, fingerprint);
      products.push(p);
    }
    if (seenProducts.size > 1600) {
      for (const key of Array.from(seenProducts.keys()).slice(0, 800)) seenProducts.delete(key);
    }

    const messages = [];
    const now = Date.now();
    for (const m of out.messages) {
      const key = `${m.author}|${m.text}`.toLowerCase();
      const last = seenMessages.get(key) || 0;
      if (now - last < MESSAGE_DEDUPE_MS) continue;
      seenMessages.set(key, now);
      messages.push(m);
    }
    if (seenMessages.size > 1600) {
      for (const [key, at] of seenMessages) {
        if (now - at > MESSAGE_DEDUPE_MS * 2) seenMessages.delete(key);
      }
    }

    post("products", products);
    post("messages", messages);
  }

  function handleText(text, url) {
    if (!text || text.length > MAX_BODY) return;
    const t = text.trimStart();
    if (!t.startsWith("{") && !t.startsWith("[")) return;
    if (url && !URL_RX.test(url) && !/product|nickname|content/i.test(t.slice(0, 4000))) return;
    let data = null;
    try {
      data = JSON.parse(t);
    } catch {
      return;
    }
    handleJson(data);
  }

  async function handleBinary(value, url) {
    try {
      let buffer = null;
      if (value instanceof Blob) buffer = await value.arrayBuffer();
      else if (value instanceof ArrayBuffer) buffer = value;
      else if (ArrayBuffer.isView(value))
        buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      if (!buffer || buffer.byteLength > MAX_BODY) return;
      handleText(new TextDecoder().decode(buffer), url);
    } catch {}
  }

  // ---- fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
        p.then((res) => {
          try {
            const ct = res.headers.get("content-type") || "";
            if (!/json|text/i.test(ct)) return;
            res
              .clone()
              .text()
              .then((t) => handleText(t, url))
              .catch(() => {});
          } catch {}
        }).catch(() => {});
      } catch {}
      return p;
    };
  }

  // ---- XMLHttpRequest ----
  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this.__pitchaiUrl = String(url || "");
    } catch {}
    return XO.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    try {
      this.addEventListener("load", () => {
        try {
          const rt = this.responseType;
          if (rt && rt !== "text" && rt !== "json") return;
          const body = rt === "json" ? JSON.stringify(this.response) : this.responseText;
          handleText(body, this.__pitchaiUrl);
        } catch {}
      });
    } catch {}
    return XS.apply(this, args);
  };

  // ---- WebSocket (frames de texto) ----
  const OrigWS = window.WebSocket;
  if (typeof OrigWS === "function") {
    const PatchedWS = function (url, protocols) {
      const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
      try {
        ws.addEventListener("message", (ev) => {
          if (typeof ev.data === "string") handleText(ev.data, String(url || ""));
          else handleBinary(ev.data, String(url || ""));
        });
      } catch {}
      return ws;
    };
    PatchedWS.prototype = OrigWS.prototype;
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach((k) => {
      try {
        PatchedWS[k] = OrigWS[k];
      } catch {}
    });
    try {
      window.WebSocket = PatchedWS;
    } catch {}
  }
})();

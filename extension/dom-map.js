// Pitch AI — auto-mapeamento do DOM do TikTok (sem seletores manuais)
// Expõe window.PitchaiDomMap
(function () {
  if (window.PitchaiDomMap) return;

  const CACHE_KEY = "pitchai_dommap_v1";
  const MANUAL_KEY = "pitchai_dommap_manual_v1";
  const MAX_SCAN = 6000;

  const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;
  const AUTHOR_RX = /^[^:]{2,32}:\s?\S/;
  const SALE_RX = /(comprou|compra|pedido|order|vendid|adicionou ao carrinho|x\s?\d+)/i;
  const VIOLATION_RX =
    /(viola[çc][ãa]o|violation|infra[çc][ãa]o|aviso|warning|penalidad|restri[çc][ãa]o|adverten|bloqueio|conte[úu]do impr[óo]prio|pol[íi]tica da comunidade)/i;
  const END_RX =
    /(encerrar|finalizar|terminar|fechar live|encerrar transmiss[ãa]o|finalizar live|end live|end broadcast|stop live|hang up|power off|parar (a )?(live|transmiss[ãa]o))/i;
  const START_RX =
    /(iniciar|come[çc]ar|transmitir|entrar ao vivo|iniciar transmiss[ãa]o|iniciar live|abrir live|go live|start live|start broadcast)/i;
  const JUNK_CLASS_RX = /(video|player|nav|header|footer|sidebar-menu|modal-mask)/i;

  // ---------- utils ----------
  function allDocs() {
    const docs = [document];
    const walk = (doc, depth) => {
      if (depth > 3) return;
      let frames = [];
      try {
        frames = Array.from(doc.querySelectorAll("iframe"));
      } catch {
        frames = [];
      }
      for (const f of frames) {
        let d = null;
        try {
          d = f.contentDocument;
        } catch {
          d = null;
        }
        if (d && !docs.includes(d)) {
          docs.push(d);
          walk(d, depth + 1);
        }
      }
    };
    try {
      walk(document, 0);
    } catch {}
    return docs;
  }

  /** Documentos + shadow roots abertos (TikTok usa web components em partes da live). */
  function allRoots() {
    const roots = allDocs();
    const seen = new Set(roots);
    const queue = roots.slice();
    let guard = 0;
    while (queue.length && guard++ < 4000) {
      const root = queue.shift();
      let hosts = [];
      try {
        hosts = Array.from(root.querySelectorAll("*")).slice(0, 4000);
      } catch {
        hosts = [];
      }
      for (const h of hosts) {
        const sr = h.shadowRoot;
        if (sr && !seen.has(sr)) {
          seen.add(sr);
          roots.push(sr);
          queue.push(sr);
        }
      }
    }
    return roots;
  }

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 12) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0)
        return false;
      return true;
    } catch {
      return false;
    }
  }

  function txt(el) {
    try {
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }

  function attrBag(el) {
    try {
      return [
        el.className && typeof el.className === "string" ? el.className : "",
        el.getAttribute("data-e2e") || "",
        el.getAttribute("data-tid") || "",
        el.getAttribute("aria-label") || "",
        el.getAttribute("title") || "",
        el.getAttribute("data-icon") || "",
        el.getAttribute("data-testid") || "",
        el.getAttribute("name") || "",
        el.id || "",
      ]
        .join(" ")
        .toLowerCase();
    } catch {
      return "";
    }
  }

  /** A UI da própria extensão nunca é alvo válido (evita autodetecção). */
  function isOwnUI(el) {
    try {
      if (!el || !(el instanceof Element)) return false;
      if (el.closest?.('[id^="pitchai"], [class*="pitchai"]')) return true;
      const host = el.getRootNode?.()?.host;
      if (host && host !== el) return isOwnUI(host);
      return false;
    } catch {
      return false;
    }
  }

  function insidePlayer(el) {
    let n = el;
    let hops = 0;
    while (n && hops++ < 6) {
      if (n.tagName === "VIDEO") return true;
      const bag = attrBag(n);
      if (/(^|[^a-z])video(player|-player)?([^a-z]|$)|livestream-player|xgplayer/.test(bag))
        return true;
      n = n.parentElement;
    }
    try {
      if (el.querySelector("video")) return true;
    } catch {}
    return false;
  }

  /** classes estáveis = descarta hashes tipo "e1a2b3c" ou muito curtas */
  function stableClasses(el) {
    let list = [];
    try {
      list = Array.from(el.classList || []);
    } catch {}
    return list.filter(
      (c) =>
        c.length >= 4 &&
        c.length <= 40 &&
        /[a-z]/i.test(c) &&
        !/^[a-z]{1,3}[0-9a-f]{4,}$/i.test(c) &&
        !/^css-/.test(c),
    );
  }

  function cssEscape(s) {
    try {
      return CSS.escape(s);
    } catch {
      return String(s).replace(/[^\w-]/g, "\\$&");
    }
  }

  const VOLATILE_TXT_RX =
    /^\s*$|^[\d.,%+-]+$|\d{1,2}[:h]\d{2}|(R\$|US\$|\$|€|£)\s?\d|\b(agora|há|ago|min|seg|hoje)\b/i;

  function ownTextOf(el) {
    let s = "";
    try {
      for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue || "";
    } catch {}
    return s.replace(/\s+/g, " ").trim();
  }

  function depthBetween(ancestor, node) {
    let d = 0;
    let n = node;
    while (n && n !== ancestor && d < 25) {
      n = n.parentElement;
      d++;
    }
    return n === ancestor ? d : -1;
  }

  /**
   * Âncoras textuais: rótulos estáveis dentro do container ("Produtos", "Chat"…).
   * Sobrevivem a mudanças de classe/posição — a base do remapeamento automático.
   */
  function anchorsOf(el) {
    const out = [];
    let kids = [];
    try {
      kids = Array.from(el.querySelectorAll("h1,h2,h3,h4,span,div,p,button,label,a")).slice(0, 600);
    } catch {}
    for (const k of kids) {
      if (out.length >= 4) break;
      const t = ownTextOf(k);
      if (!t || t.length < 3 || t.length > 48) continue;
      if (VOLATILE_TXT_RX.test(t)) continue;
      if (out.some((a) => a.t === t)) continue;
      const depth = depthBetween(el, k);
      if (depth < 1) continue;
      out.push({ t, depth, tag: k.tagName });
    }
    return out;
  }

  /** Reencontra o container a partir das âncoras textuais salvas. */
  function fromAnchors(sig) {
    const anchors = Array.isArray(sig?.anchors) ? sig.anchors : [];
    if (!anchors.length) return null;
    const roots = allRoots();
    for (const a of anchors) {
      for (const root of roots) {
        let nodes = [];
        try {
          nodes = Array.from(root.querySelectorAll(String(a.tag || "*").toLowerCase())).slice(
            0,
            4000,
          );
        } catch {}
        for (const n of nodes) {
          if (ownTextOf(n) !== a.t) continue;
          let p = n;
          for (let i = 0; i < a.depth && p; i++) p = p.parentElement;
          if (!(p instanceof HTMLElement)) continue;
          if (sig.tag && p.tagName !== sig.tag) continue;
          if (!isVisible(p)) continue;
          return p;
        }
      }
    }
    return null;
  }

  /** Assinatura estrutural: seletor por atributos estáveis + caminho nth-child. */
  function signatureOf(el) {
    const parts = [];
    const bag = [];
    for (const a of ["data-e2e", "data-tid", "id"]) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && v.length < 60) bag.push(`[${a}="${cssEscape(v)}"]`.replace(/\\/g, ""));
    }
    const cls = stableClasses(el)
      .slice(0, 3)
      .map((c) => `.${cssEscape(c)}`);
    const selector = bag.length
      ? el.tagName.toLowerCase() + bag.join("")
      : cls.length
        ? el.tagName.toLowerCase() + cls.join("")
        : "";

    let n = el;
    let hops = 0;
    while (n && n.parentElement && hops++ < 24) {
      const p = n.parentElement;
      const idx = Array.prototype.indexOf.call(p.children, n) + 1;
      parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${idx})`);
      n = p;
      if (n === document.body) break;
    }
    return {
      selector,
      path: parts.join(">"),
      tag: el.tagName,
      anchors: anchorsOf(el),
    };
  }

  function fromSignature(sig) {
    if (!sig) return null;
    const roots = allRoots();
    if (sig.selector) {
      for (const d of roots) {
        try {
          const n = d.querySelector(sig.selector);
          if (n instanceof HTMLElement) return n;
        } catch {}
      }
    }
    // âncoras textuais antes do caminho posicional (nth-child quebra a cada re-render)
    const byAnchor = fromAnchors(sig);
    if (byAnchor) return byAnchor;
    if (sig.path) {
      for (const d of roots) {
        try {
          const scope = d.body || d;
          const n = scope.querySelector ? scope.querySelector(sig.path) : null;
          if (n instanceof HTMLElement) return n;
        } catch {}
      }
    }
    return null;
  }

  function elementsOf(doc, sel) {
    try {
      return Array.from(doc.querySelectorAll(sel));
    } catch {
      return [];
    }
  }

  function regionNodes(region) {
    if (!region) return [];
    const ids = Array.isArray(region) ? region : [region];
    const out = [];
    for (const id of ids) {
      let n = null;
      try {
        n = window.PitchaiRegions?.get?.(id) || null;
      } catch {
        n = null;
      }
      if (n) out.push(n);
    }
    return out;
  }

  function regionNode(region) {
    return regionNodes(region)[0] || null;
  }

  /**
   * Pool de candidatos: restrito ao(s) setor(es) quando mapeados.
   *
   * Alvo `loose` recebe a varredura ampla TAMBÉM — anexada depois do setor,
   * nunca no lugar dele. Sem isso o `loose` era letra morta: o reject() do scan
   * deixava passar quem estivesse fora do setor, mas a coleta nunca trazia
   * ninguém de fora para ser deixado passar. Um "Iniciar LIVE" fora do estúdio
   * simplesmente não existia para a busca.
   *
   * A ordem importa duas vezes: o setor entra primeiro, então continua com a
   * preferência na pontuação, e um corte pelo MAX_SCAN só pode cortar a parte
   * ampla — nunca o que veio do setor.
   */
  function candidatePool(selector, region, loose = false) {
    const out = [];
    // Sem o dedup a varredura ampla recolheria o setor inteiro de novo e
    // gastaria o orçamento do MAX_SCAN duas vezes com os mesmos nós.
    const seen = new Set();
    const push = (el) => {
      if (!seen.has(el)) {
        seen.add(el);
        out.push(el);
      }
      return out.length < MAX_SCAN;
    };
    const scopes = regionNodes(region);
    let scopeNodes = 0;
    if (scopes.length) {
      for (const scope of scopes) {
        if (!seen.has(scope)) scopeNodes += 1;
        if (!push(scope)) return out;
        for (const el of elementsOf(scope, selector)) {
          if (!push(el)) return out;
        }
      }
      // Alvo preso ao setor: achou algo lá dentro e está resolvido. Para ele a
      // varredura ampla seria trabalho jogado fora — o reject() descarta tudo
      // que estiver fora do setor, então nenhum candidato novo poderia vencer.
      if (!loose && out.length > scopeNodes) return out;
    }
    for (const d of allRoots()) {
      for (const el of elementsOf(d, selector)) {
        if (!push(el)) return out;
      }
    }
    return out;
  }

  // ---------- detectores ----------
  function scoreChat(el) {
    const kids = el.children;
    const n = kids.length;
    if (n < 4 || n > 500) return 0;
    if (insidePlayer(el)) return 0;
    if (!isVisible(el)) return 0;
    let s = 0;
    const bag = attrBag(el);
    if (/(comment|chat|message|barrage|danmaku)/.test(bag)) s += 6;
    if (JUNK_CLASS_RX.test(bag)) s -= 4;
    try {
      const st = getComputedStyle(el);
      if (/auto|scroll/.test(st.overflowY)) s += 4;
      if (st.flexDirection === "column") s += 1;
    } catch {}
    let short = 0;
    let authored = 0;
    const sample = Math.min(n, 24);
    for (let i = n - sample; i < n; i++) {
      const t = txt(kids[i]);
      if (!t) continue;
      if (t.length > 1 && t.length < 220) short++;
      if (AUTHOR_RX.test(t) || (kids[i].children && kids[i].children.length >= 2 && t.length < 220))
        authored++;
    }
    if (!sample) return 0;
    s += (short / sample) * 6;
    s += (authored / sample) * 7;
    s += Math.min(n, 60) / 15;
    // um chat não é a página inteira
    try {
      const r = el.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.85 && r.height > window.innerHeight * 0.85) s -= 6;
      if (r.height < 80) s -= 4;
    } catch {}
    return s;
  }

  function childSignature(el) {
    return `${el.tagName}|${stableClasses(el).slice(0, 2).join(".")}`;
  }

  function looksLikeProductCard(el) {
    const t = txt(el);
    if (t.length < 6 || t.length > 500) return false;
    let hasImg = false;
    try {
      hasImg = !!el.querySelector("img, [style*='background-image']");
    } catch {}
    return PRICE_RX.test(t) || (hasImg && t.length > 10);
  }

  function scoreProductList(el) {
    const kids = Array.from(el.children || []);
    if (kids.length < 2 || kids.length > 200) return 0;
    if (!isVisible(el)) return 0;
    if (insidePlayer(el)) return 0;
    const sigs = new Map();
    kids.forEach((k) => sigs.set(childSignature(k), (sigs.get(childSignature(k)) || 0) + 1));
    const dominant = Math.max(...sigs.values());
    if (dominant < 2) return 0;
    const good = kids.filter(looksLikeProductCard).length;
    if (good < 2) return 0;
    let s = 0;
    const bag = attrBag(el);
    if (/(product|goods|shop|vitrine|item-list)/.test(bag)) s += 6;
    if (/(comment|chat|message)/.test(bag)) s -= 6;
    s += (good / kids.length) * 8;
    s += (dominant / kids.length) * 4;
    s += Math.min(good, 20) / 5;
    const priced = kids.filter((k) => PRICE_RX.test(txt(k))).length;
    s += (priced / kids.length) * 4;
    return s;
  }

  function scoreSales(el) {
    const kids = Array.from(el.children || []);
    if (kids.length < 1 || kids.length > 200) return 0;
    if (!isVisible(el)) return 0;
    const hits = kids.filter((k) => SALE_RX.test(txt(k))).length;
    // sem nenhuma evidência de venda não é feed de vendas (era aqui que a
    // vitrine entrava e virava "venda" a cada mudança de DOM)
    if (!hits) return 0;
    let s = 0;
    const bag = attrBag(el);
    if (/(activity|order|sale|venda|pedido|transaction)/.test(bag)) s += 6;
    if (/(comment|chat|message)/.test(bag)) s -= 5;
    if (/(product|goods|showcase|catalog|shelf|vitrine)/.test(bag)) s -= 6;
    if (kids.length) s += (hits / kids.length) * 8;
    s += Math.min(hits, 10) / 2;
    return s;
  }

  function scoreViolation(el) {
    // O Gerenciador atual renderiza "Avisos" como um botão sem texto/aria,
    // contendo somente um triângulo SVG dentro de um badge. A combinação
    // estrutural é específica o bastante e evita depender do XPath antigo.
    try {
      const button = el.matches?.("button") ? el : el.closest?.("button");
      if (
        button &&
        button.closest?.('[data-tid="m4b_badge"]') &&
        button.matches?.('[data-tid="m4b_button"]') &&
        button.querySelector?.('img[src^="data:image/svg+xml"]') &&
        isVisible(button)
      )
        return el === button ? 12 : 10;
    } catch {}
    // Botão atual de "Lembrete de violação" do Gerenciador. Ele é somente um
    // ícone e não expõe texto/aria-label até receber hover, por isso a posição
    // estrutural conhecida é uma evidência necessária nesta versão do TikTok.
    try {
      if (el === byXPath(HINT_XPATHS.violation) && isVisible(el)) return 12;
    } catch {}
    const t = txt(el);
    if (!t || t.length > 160) return 0;
    if (!VIOLATION_RX.test(t) && !VIOLATION_RX.test(attrBag(el))) return 0;
    if (!isVisible(el)) return 0;
    let s = 5;
    if (VIOLATION_RX.test(t)) s += 3;
    if (el.children.length <= 3) s += 2;
    try {
      const c = getComputedStyle(el).color + getComputedStyle(el).backgroundColor;
      if (/rgb\((2[0-5]\d|1[89]\d),\s*\d{1,2},/.test(c)) s += 2;
    } catch {}
    return s;
  }

  function scoreEndLive(el) {
    try {
      const control = el.matches?.(".arco-icon-im_close_chat")
        ? el.closest?.(".cursor-pointer") || el.parentElement
        : el.querySelector?.(".arco-icon-im_close_chat")
          ? el
          : null;
      if (control && isVisible(control)) return el === control ? 12 : 10;
    } catch {}
    const label = `${txt(el)} ${attrBag(el)}`.toLowerCase();
    if (!END_RX.test(label)) return 0;
    if (/cancelar|cancel|voltar/.test(label)) return 0;
    if (!isVisible(el)) return 0;
    let s = 6;
    if (el.tagName === "BUTTON") s += 3;
    if (el.closest && el.closest("aside, footer, header")) s += 3;
    if (txt(el).length <= 30) s += 2;
    // botão vermelho de encerrar é a assinatura visual mais comum
    try {
      const bg = getComputedStyle(el).backgroundColor || "";
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m && +m[1] > 170 && +m[2] < 90 && +m[3] < 90) s += 3;
    } catch {}
    return s;
  }

  function scoreStartLive(el) {
    const label = `${txt(el)} ${attrBag(el)}`.toLowerCase();
    if (!START_RX.test(label) || !isVisible(el)) return 0;
    if (/tutorial|ajuda|agenda|agendar/.test(label)) return 0;
    let s = 6;
    if (el.tagName === "BUTTON" || el.getAttribute?.("role") === "button") s += 3;
    if (txt(el).length <= 36) s += 2;
    return s;
  }

  function scoreChatReply(el) {
    if (!isVisible(el)) return 0;
    const placeholder = el.getAttribute?.("placeholder") || "";
    const role = el.getAttribute?.("role") || "";
    const label = `${placeholder} ${attrBag(el)} ${role} ${txt(el)}`.toLowerCase();
    const isEditor =
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable ||
      role === "textbox";
    if (!isEditor) return 0;
    if (/pesquisar|buscar|search|filtro|produto|id do produto/.test(label)) return 0;
    let s = 4;
    if (/digite|escreva|mensagem|coment[áa]rio|responder|chat|reply|message/.test(label)) s += 6;
    if (el.tagName === "TEXTAREA" || el.isContentEditable) s += 2;
    return s;
  }

  // cada alvo pertence a um SETOR (ver regions.js) e só é aceito dentro dele
  const TARGETS = {
    chat: { pool: "ul, ol, div", score: scoreChat, min: 9, sample: true, region: "chat" },
    chatReply: {
      pool: "input, textarea, [contenteditable='true'], [role='textbox']",
      score: scoreChatReply,
      min: 5,
      region: "chat",
    },
    products: { pool: "ul, ol, div, section", score: scoreProductList, min: 8, region: "products" },
    sales: { pool: "ul, ol, div, section", score: scoreSales, min: 6, region: "activity" },
    violation: {
      pool: "span, div, button, p",
      score: scoreViolation,
      min: 6,
      region: ["topbar", "studio"],
      loose: true,
    },
    endLive: {
      pool: "button, [role='button'], a, div.cursor-pointer, .arco-icon-im_close_chat",
      score: scoreEndLive,
      min: 7,
      region: ["studio", "topbar"],
      loose: true,
    },
    startLive: {
      pool: "button, [role='button'], a",
      score: scoreStartLive,
      min: 7,
      region: ["studio", "topbar"],
      loose: true,
    },
  };

  // dicas legadas (XPaths antigos) — entram só como candidatos extras
  const HINT_XPATHS = {
    chat: "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[2]/div[2]/div[3]/div/div[2]",
    sales:
      "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[2]/div[3]/div[2]/div/div[2]/div/div/div/div[1]/div/div[1]/div/div/div",
    violation:
      "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[1]/div/div[2]/span/button/span/span",
    endLive: "/html/body/div[2]/div/div[2]/aside/div/div/div/div/div[1]/button",
    products: "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[1]/div/div[3]",
  };

  function byXPath(path) {
    try {
      const r = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return r.singleNodeValue instanceof HTMLElement ? r.singleNodeValue : null;
    } catch {
      return null;
    }
  }

  // ---------- estado ----------
  const state = {};
  for (const k of Object.keys(TARGETS)) {
    state[k] = { node: null, score: 0, via: null, at: 0, evidence: "" };
  }
  let cache = {};
  let cacheLoaded = false;
  let manual = {};
  let manualLoaded = false;
  const listeners = new Set();

  function loadCache() {
    return new Promise((res) => {
      if (cacheLoaded) return res(cache);
      try {
        chrome.storage.local.get([CACHE_KEY], (r) => {
          const raw = r?.[CACHE_KEY] || {};
          cache = raw.host === location.host ? raw.sig || {} : {};
          cacheLoaded = true;
          res(cache);
        });
      } catch {
        cacheLoaded = true;
        res(cache);
      }
    });
  }
  function saveCache() {
    try {
      chrome.storage.local.set({ [CACHE_KEY]: { host: location.host, sig: cache } });
    } catch {}
  }

  function loadManual() {
    return new Promise((res) => {
      if (manualLoaded) return res(manual);
      manual = {};
      manualLoaded = true;
      try {
        chrome.storage.local.remove(MANUAL_KEY);
      } catch {}
      res(manual);
    });
  }
  function saveManual() {
    try {
      chrome.storage.local.remove(MANUAL_KEY);
    } catch {}
  }

  function emit() {
    listeners.forEach((cb) => {
      try {
        cb(status());
      } catch {}
    });
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Desempate do chat: o container que mais cresce em ~3s é o chat de verdade. */
  async function pickGrowing(cands) {
    const counts = cands.map((c) => c.el.children.length);
    await sleep(1000);
    const mid = cands.map((c) => c.el.children.length);
    await sleep(1000);
    const end = cands.map((c) => c.el.children.length);
    let best = null,
      bestVal = -Infinity;
    cands.forEach((c, i) => {
      const growth = Math.max(0, end[i] - counts[i]) + Math.max(0, mid[i] - counts[i]) * 0.5;
      const val = c.score + Math.min(growth, 10) * 1.2;
      if (val > bestVal) {
        bestVal = val;
        best = { ...c, score: val, grew: growth > 0 };
      }
    });
    return best;
  }

  async function scan(target) {
    const def = TARGETS[target];
    if (!def) return null;
    const seen = new Set();
    const scored = [];

    // garante que os setores estejam resolvidos antes de procurar o alvo
    try {
      await window.PitchaiRegions?.resolveAll?.({ force: false });
    } catch {}
    const scopes = regionNodes(def.region);
    const scope = scopes[0] || null;
    const inRegion = (el) => {
      if (!scopes.length) return true;
      try {
        return scopes.some((s) => s === el || s.contains(el));
      } catch {
        return false;
      }
    };
    // alvos "loose" (violação, encerrar) podem estar fora do setor — só perdem bônus
    // (a barra/tray da própria extensão fica sempre de fora)
    const reject = (el) => isOwnUI(el) || (!def.loose && scopes.length && !inRegion(el));

    const hint = HINT_XPATHS[target] ? byXPath(HINT_XPATHS[target]) : null;
    if (hint && !reject(hint)) {
      const s = def.score(hint);
      if (s >= def.min) scored.push({ el: hint, score: s + 1, via: "hint-xpath" });
      seen.add(hint);
    }

    const pool = candidatePool(def.pool, def.region, def.loose);
    for (const el of pool) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (reject(el)) continue;
      let s = 0;
      try {
        s = def.score(el);
      } catch {
        s = 0;
      }
      if (s <= 0) continue;
      if (inRegion(el) && scope) s += 4; // bônus por estar no setor certo
      if (s >= def.min)
        scored.push({ el, score: s, via: scope && inRegion(el) ? "setor" : "auto-scan" });
    }

    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);

    let winner = scored[0];
    if (def.sample && scored.length > 1 && scored[1].score > scored[0].score - 4) {
      const top = scored.slice(0, 4);
      const picked = await pickGrowing(top);
      if (picked) winner = picked;
    }
    return winner;
  }

  function setResult(target, el, score, via, evidence) {
    state[target] = { node: el, score, via, at: Date.now(), evidence: evidence || "" };
    if (el && via !== "manual") {
      cache[target] = signatureOf(el);
      saveCache();
    }
    emit();
  }

  /** Compatibilidade com versões antigas: apontamentos agora são ignorados. */
  async function setManual() {
    await loadManual();
    return false;
  }
  async function clearManual(target) {
    await loadManual();
    if (target) delete manual[target];
    else manual = {};
    saveManual();
    if (target) invalidate(target);
  }

  const inflight = {};

  async function resolve(target, { force = false } = {}) {
    const st = state[target];
    if (!force && st.node && st.node.isConnected) return st.node;
    if (inflight[target]) return inflight[target];

    inflight[target] = (async () => {
      await loadManual();
      await loadCache();
      const def = TARGETS[target];
      if (manual[target]) {
        const el = fromSignature(manual[target]);
        if (el) {
          setResult(target, el, 99, "manual", "apontado pelo usuário");
          return el;
        }
      }
      if (!force && cache[target]) {
        const el = fromSignature(cache[target]);
        if (el) {
          let s = 0;
          try {
            s = def.score(el);
          } catch {}
          if (s >= def.min) {
            setResult(target, el, s, "cache", "assinatura salva");
            return el;
          }
        }
      }
      const found = await scan(target);
      if (found) {
        setResult(target, found.el, found.score, found.via, `score ${found.score.toFixed(1)}`);
        return found.el;
      }
      setResult(target, null, 0, null, "não encontrado");
      return null;
    })().finally(() => {
      delete inflight[target];
    });

    return inflight[target];
  }

  function invalidate(target) {
    if (!state[target]) return;
    state[target] = { node: null, score: 0, via: null, at: 0, evidence: "invalidado" };
    delete cache[target];
    saveCache();
    emit();
  }

  async function remapAll() {
    Object.keys(TARGETS).forEach((k) => {
      delete cache[k];
    });
    saveCache();
    const out = {};
    for (const k of Object.keys(TARGETS)) {
      out[k] = !!(await resolve(k, { force: true }));
    }
    return out;
  }

  function status() {
    const out = {};
    for (const k of Object.keys(TARGETS)) {
      const s = state[k];
      out[k] = {
        found: !!(s.node && s.node.isConnected),
        via: s.via,
        score: Math.round((s.score || 0) * 10) / 10,
        at: s.at,
        evidence: s.evidence,
        region: Array.isArray(TARGETS[k].region)
          ? TARGETS[k].region.join("/")
          : TARGETS[k].region || null,
        regionFound: regionNodes(TARGETS[k].region).length > 0,
        healthy: healthOf(k).ok,
        hasManual: !!manual[k],
      };
    }
    return out;
  }

  // ---------- auto-cura ----------
  /**
   * Revalida cada alvo: além de existir no DOM, precisa continuar "parecendo"
   * o que deveria ser (score acima do mínimo). Se degradar, remapeia sozinho.
   */
  function healthOf(target) {
    const def = TARGETS[target];
    const st = state[target];
    if (!def || !st?.node) return { ok: false, score: 0, reason: "sem nó" };
    if (!st.node.isConnected) return { ok: false, score: 0, reason: "removido do DOM" };
    if (!isVisible(st.node)) return { ok: false, score: 0, reason: "invisível" };
    let sc = 0;
    try {
      sc = def.score(st.node);
    } catch {
      sc = 0;
    }
    if (st.via === "manual") return { ok: true, score: sc, reason: "manual" };
    // tolera oscilação (chat vazio por alguns segundos, vitrine filtrada…)
    const floor = def.min * 0.55;
    return { ok: sc >= floor, score: sc, reason: sc >= floor ? "ok" : "score caiu" };
  }

  let healing = false;
  async function healAll({ force = false } = {}) {
    if (healing) return;
    healing = true;
    try {
      for (const k of Object.keys(TARGETS)) {
        const h = healthOf(k);
        if (h.ok && !force) continue;
        const before = state[k].node;
        invalidate(k);
        const found = await resolve(k, { force: true }).catch(() => null);
        if (!found && before) {
          // não achou nada melhor — devolve o antigo em vez de ficar sem alvo
          if (before.isConnected) setResult(k, before, 0, "fallback", "mantido até achar outro");
        }
      }
    } finally {
      healing = false;
    }
  }

  let watchdog = null;
  let mo = null;
  let churnTimer = null;
  let unsubRegions = null;

  function startWatchdog() {
    if (watchdog) return;
    watchdog = setInterval(() => {
      healAll().catch(() => {});
    }, 15000);

    // re-render pesado do TikTok → remapeia logo, sem esperar o intervalo
    try {
      mo = new MutationObserver((records) => {
        let removedTracked = false;
        for (const r of records) {
          if (!r.removedNodes || !r.removedNodes.length) continue;
          for (const k of Object.keys(TARGETS)) {
            const n = state[k].node;
            if (!n) continue;
            for (const rm of r.removedNodes) {
              if (rm === n || (rm.contains && rm.contains(n))) {
                removedTracked = true;
                break;
              }
            }
            if (removedTracked) break;
          }
          if (removedTracked) break;
        }
        if (!removedTracked) return;
        clearTimeout(churnTimer);
        churnTimer = setTimeout(() => {
          healAll().catch(() => {});
        }, 800);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch {}

    // setor mudou de lugar → os alvos daquele setor precisam ser reavaliados
    try {
      unsubRegions =
        window.PitchaiRegions?.onChange?.(() => {
          clearTimeout(churnTimer);
          churnTimer = setTimeout(() => {
            healAll().catch(() => {});
          }, 1200);
        }) || null;
    } catch {}

    try {
      window.PitchaiRegions?.startWatcher?.();
    } catch {}
  }

  function stopWatchdog() {
    if (watchdog) {
      clearInterval(watchdog);
      watchdog = null;
    }
    if (mo) {
      try {
        mo.disconnect();
      } catch {}
      mo = null;
    }
    if (unsubRegions) {
      try {
        unsubRegions();
      } catch {}
      unsubRegions = null;
    }
    clearTimeout(churnTimer);
  }

  /** Exporta os apontamentos manuais (assinaturas de seletor) deste host. */
  async function exportManual() {
    await loadManual();
    return JSON.parse(JSON.stringify(manual || {}));
  }
  /** Substitui os apontamentos manuais e reaplica. */
  async function importManual(sig) {
    manual = {};
    manualLoaded = true;
    saveManual();
    return remapAll();
  }
  /** Relê do storage (usado quando o painel importa/baixa um mapeamento). */
  async function reloadManual() {
    manualLoaded = false;
    manual = {};
    await loadManual();
    Object.keys(manual).forEach((t) => {
      try {
        invalidate(t);
      } catch {}
    });
    return remapAll();
  }

  window.PitchaiDomMap = {
    resolve,
    invalidate,
    remapAll,
    status,
    setManual,
    clearManual,
    exportManual,
    importManual,
    reloadManual,
    hasManual(target) {
      return !!manual[target];
    },
    startWatchdog,
    stopWatchdog,
    healAll,
    health: healthOf,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    util: {
      PRICE_RX,
      SALE_RX,
      VIOLATION_RX,
      allDocs,
      allRoots,
      isOwnUI,
      isVisible,
      txt,
      ownTextOf,
      signatureOf,
      anchorsOf,
      fromSignature,
      looksLikeProductCard,
    },
  };
})();

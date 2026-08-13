// Pitch AI — mapeamento por SETORES do Console de LIVE do TikTok
// Divide a tela em regiões (produtos, estúdio, chat, atividade, análise) para que
// o scraping de cada alvo aconteça só dentro do setor correto.
// Expõe window.PitchaiRegions
(function () {
  if (window.PitchaiRegions) return;

  const CACHE_KEY = "pitchai_regions_v1";
  const MANUAL_KEY = "pitchai_regions_manual_v1";
  const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;

  /**
   * Regras declarativas de setor.
   * anchors  → textos de cabeçalho/controles exclusivos daquele setor
   * content  → evidência mínima que o container do setor precisa ter
   * geometry → posição esperada (fração da viewport) usada como desempate
   */
  const REGIONS = {
    products: {
      label: "Produtos / vitrine",
      anchors: [
        /^produtos?$/i,
        /pesquisar\s+id\s+ou\s+nome\s+do\s+produto/i,
        /todas\s+as\s+categorias/i,
        /todo\s+o\s+estoque/i,
        /lista\s+de\s+produtos\s+nesta\s+live/i,
      ],
      minAnchors: 2,
      content: (el) => countMatches(el, PRICE_RX) >= 1,
      geometry: { x: [0, 0.45], y: [0, 1] },
      hintXPath: "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[1]/div/div[3]",
    },
    studio: {
      label: "Estúdio / controles da LIVE",
      anchors: [
        /^v[íi]deo$/i,
        /^roteiro$/i,
        /adicionar\s+roteiro/i,
        /iniciar\s+live/i,
        /encerrar\s+live/i,
        /sem\s+feed\s+de\s+v[íi]deo/i,
      ],
      minAnchors: 2,
      content: () => true,
      geometry: { x: [0.25, 0.8], y: [0, 0.5] },
      hintXPath: null,
    },
    chat: {
      label: "Chat da LIVE",
      anchors: [
        /^chat$/i,
        /todos\s+os\s+coment[áa]rios/i,
        /relacionados\s+ao\s+produto/i,
        /os\s+coment[áa]rios\s+dos\s+espectadores/i,
        /digite\s+algo/i,
      ],
      minAnchors: 2,
      content: () => true,
      geometry: { x: [0.25, 0.8], y: [0.2, 1] },
      hintXPath:
        "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[2]/div[2]/div[3]/div/div[2]",
    },
    activity: {
      label: "Atividade / pedidos",
      anchors: [
        /^atividade$/i,
        /todas\s+as\s+atividades/i,
        /pedidos\s+feitos\s+durante\s+a\s+sua\s+live/i,
        /atividades\s+dos\s+espectadores/i,
      ],
      minAnchors: 1,
      content: () => true,
      geometry: { x: [0.6, 1], y: [0.25, 1] },
      hintXPath: null,
    },
    analytics: {
      label: "Análise da transmissão",
      anchors: [
        /an[áa]lise\s+de\s+transmiss[õo]es/i,
        /gmv\s+atribu[íi]do/i,
        /itens\s+atribu[íi]dos\s+vendidos/i,
        /espectadores\s+atuais/i,
        /cliques\s+no\s+produto/i,
        /porcentagem\s+de\s+visitantes/i,
      ],
      minAnchors: 2,
      content: () => true,
      geometry: { x: [0.6, 1], y: [0, 0.6] },
      hintXPath: null,
    },
    topbar: {
      label: "Barra superior / avisos",
      anchors: [
        /gerenciador\s+de\s+live/i,
        /central\s+de\s+integridade/i,
        /^avisos?$/i,
        /viola[çc][ãa]o/i,
        /encerrar\s+live/i,
        /^ajuda$/i,
      ],
      minAnchors: 1,
      content: () => true,
      geometry: { x: [0, 1], y: [0, 0.18] },
      hintXPath: null,
    },
  };

  const IDS = Object.keys(REGIONS);

  // ---------- utils ----------
  function roots() {
    try {
      const u = window.PitchaiDomMap?.util;
      if (u?.allRoots) return u.allRoots();
    } catch {}
    return [document];
  }

  function txt(el) {
    try {
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }

  function ownText(el) {
    let s = "";
    try {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) s += n.nodeValue || "";
      }
    } catch {}
    return s.replace(/\s+/g, " ").trim();
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) !== 0;
    } catch {
      return false;
    }
  }

  function countMatches(el, rx) {
    let n = 0;
    try {
      const kids = el.querySelectorAll("*");
      for (let i = 0; i < kids.length && i < 1500; i++) {
        if (rx.test(ownText(kids[i]))) n++;
      }
    } catch {}
    return n;
  }

  function byXPath(path) {
    try {
      const r = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return r.singleNodeValue instanceof HTMLElement ? r.singleNodeValue : null;
    } catch {
      return null;
    }
  }

  function geometryScore(el, geo) {
    if (!geo) return 0;
    try {
      const r = el.getBoundingClientRect();
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      const cx = (r.left + r.width / 2) / w;
      const cy = (r.top + r.height / 2) / h;
      let s = 0;
      if (cx >= geo.x[0] && cx <= geo.x[1]) s += 3;
      if (cy >= geo.y[0] && cy <= geo.y[1]) s += 2;
      return s;
    } catch {
      return 0;
    }
  }

  /** Coleta elementos-folha cujo texto próprio bate com alguma âncora de setor. */
  function collectAnchors() {
    const found = {};
    IDS.forEach((id) => (found[id] = []));
    for (const root of roots()) {
      let all = [];
      try {
        all = Array.from(root.querySelectorAll("h1,h2,h3,h4,span,div,p,button,a,input,label"));
      } catch {}
      for (let i = 0; i < all.length && i < 6000; i++) {
        const el = all[i];
        let t = ownText(el);
        if (!t && el.tagName === "INPUT") t = (el.getAttribute("placeholder") || "").trim();
        if (!t || t.length > 80) continue;
        if (!visible(el)) continue;
        for (const id of IDS) {
          if (REGIONS[id].anchors.some((rx) => rx.test(t))) found[id].push(el);
        }
      }
    }
    return found;
  }

  /**
   * Sobe do elemento-âncora até o maior ancestral que ainda não engloba
   * âncoras de outro setor. Esse ancestral é o container do setor.
   */
  function containerFor(id, anchorEls, foreignEls) {
    let best = null;
    for (const anchor of anchorEls.slice(0, 6)) {
      let node = anchor;
      let last = null;
      let hops = 0;
      while (node && node.parentElement && hops++ < 20) {
        const parent = node.parentElement;
        if (parent === document.body || parent.tagName === "HTML") break;
        const engulfsForeign = foreignEls.some((f) => {
          try {
            return parent.contains(f);
          } catch {
            return false;
          }
        });
        if (engulfsForeign) break;
        last = parent;
        node = parent;
      }
      if (!last) continue;
      const mine = anchorEls.filter((a) => {
        try {
          return last.contains(a);
        } catch {
          return false;
        }
      }).length;
      const def = REGIONS[id];
      let score = mine * 2 + geometryScore(last, def.geometry);
      try {
        if (!def.content(last)) score -= 4;
      } catch {}
      try {
        const r = last.getBoundingClientRect();
        if (r.width < 120 || r.height < 80) score -= 4;
        if (
          r.width > (window.innerWidth || 1) * 0.95 &&
          r.height > (window.innerHeight || 1) * 0.95
        )
          score -= 8;
      } catch {}
      if (!best || score > best.score) best = { node: last, score, anchors: mine };
    }
    return best;
  }

  // ---------- estado ----------
  const state = {};
  IDS.forEach((id) => (state[id] = { node: null, score: 0, via: null, at: 0, anchors: 0 }));
  let manual = {};
  let manualLoaded = false;
  const listeners = new Set();

  function loadManual() {
    return new Promise((res) => {
      if (manualLoaded) return res(manual);
      try {
        chrome.storage.local.get([MANUAL_KEY], (r) => {
          const raw = r?.[MANUAL_KEY] || {};
          manual = raw.host === location.host ? raw.sig || {} : {};
          manualLoaded = true;
          res(manual);
        });
      } catch {
        manualLoaded = true;
        res(manual);
      }
    });
  }
  function saveManual() {
    try {
      chrome.storage.local.set({ [MANUAL_KEY]: { host: location.host, sig: manual } });
    } catch {}
  }
  function saveCache() {
    const sig = {};
    IDS.forEach((id) => {
      const n = state[id].node;
      if (n && window.PitchaiDomMap?.util?.signatureOf) {
        try {
          sig[id] = window.PitchaiDomMap.util.signatureOf(n);
        } catch {}
      }
    });
    try {
      chrome.storage.local.set({ [CACHE_KEY]: { host: location.host, sig } });
    } catch {}
  }
  function loadCache() {
    return new Promise((res) => {
      try {
        chrome.storage.local.get([CACHE_KEY], (r) => {
          const raw = r?.[CACHE_KEY] || {};
          res(raw.host === location.host ? raw.sig || {} : {});
        });
      } catch {
        res({});
      }
    });
  }

  function emit() {
    const st = status();
    listeners.forEach((cb) => {
      try {
        cb(st);
      } catch {}
    });
  }

  let lastResolve = 0;
  let resolving = null;

  async function resolveAll({ force = false } = {}) {
    if (resolving) return resolving;
    if (!force && Date.now() - lastResolve < 4000 && IDS.some((id) => alive(id))) return status();
    resolving = (async () => {
      await loadManual();
      const cache = force ? {} : await loadCache();
      const anchors = collectAnchors();

      for (const id of IDS) {
        // 1) manual tem prioridade
        if (manual[id]) {
          const el = window.PitchaiDomMap?.util ? fromSig(manual[id]) : null;
          if (el) {
            state[id] = { node: el, score: 99, via: "manual", at: Date.now(), anchors: 0 };
            continue;
          }
        }
        // 2) cache válido — só aceita se as âncoras do setor ainda estiverem dentro
        if (cache[id]) {
          const el = fromSig(cache[id]);
          const mineNow = anchors[id] || [];
          const inside = el
            ? mineNow.filter((a) => {
                try {
                  return el.contains(a);
                } catch {
                  return false;
                }
              }).length
            : 0;
          const needs = REGIONS[id].minAnchors || 1;
          if (
            el &&
            visible(el) &&
            (inside >= needs || (!mineNow.length && inside === 0 && contentOk(id, el)))
          ) {
            state[id] = {
              node: el,
              score: 50 + inside,
              via: "cache",
              at: Date.now(),
              anchors: inside,
            };
            continue;
          }
        }
        // 3) âncoras
        const mine = anchors[id] || [];
        const foreign = IDS.filter((o) => o !== id).flatMap((o) => anchors[o] || []);
        let best = null;
        if (mine.length >= (REGIONS[id].minAnchors || 1)) best = containerFor(id, mine, foreign);
        else if (mine.length) best = containerFor(id, mine, foreign);
        if (best && best.score > 0) {
          state[id] = {
            node: best.node,
            score: best.score,
            via: "âncora",
            at: Date.now(),
            anchors: best.anchors,
          };
          continue;
        }
        // 4) dica de XPath legado
        const hint = REGIONS[id].hintXPath ? byXPath(REGIONS[id].hintXPath) : null;
        if (hint && visible(hint)) {
          state[id] = { node: hint, score: 4, via: "hint-xpath", at: Date.now(), anchors: 0 };
          continue;
        }
        state[id] = { node: null, score: 0, via: null, at: Date.now(), anchors: 0 };
      }
      lastResolve = Date.now();
      saveCache();
      emit();
      return status();
    })().finally(() => {
      resolving = null;
    });
    return resolving;
  }

  function fromSig(sig) {
    if (!sig) return null;
    for (const root of roots()) {
      if (sig.selector) {
        try {
          const n = root.querySelector(sig.selector);
          if (n instanceof HTMLElement) return n;
        } catch {}
      }
      if (sig.path) {
        try {
          const scope = root.body || root;
          const n = scope.querySelector ? scope.querySelector(sig.path) : null;
          if (n instanceof HTMLElement) return n;
        } catch {}
      }
    }
    return null;
  }

  function contentOk(id, el) {
    try {
      return !!REGIONS[id].content(el);
    } catch {
      return false;
    }
  }

  function alive(id) {
    const n = state[id]?.node;
    return !!(n && n.isConnected);
  }

  function get(id) {
    return alive(id) ? state[id].node : null;
  }

  async function node(id, opts) {
    if (alive(id) && !opts?.force) return state[id].node;
    await resolveAll({ force: !!opts?.force });
    return get(id);
  }

  function contains(id, el) {
    const r = get(id);
    if (!r || !(el instanceof Node)) return false;
    try {
      return r === el || r.contains(el);
    } catch {
      return false;
    }
  }

  /** Em qual setor esse nó está? (null se em nenhum) */
  function regionOf(el) {
    for (const id of IDS) if (contains(id, el)) return id;
    return null;
  }

  async function setManual(id, el) {
    if (!REGIONS[id] || !(el instanceof HTMLElement)) return false;
    await loadManual();
    try {
      manual[id] = window.PitchaiDomMap.util.signatureOf(el);
    } catch {
      return false;
    }
    saveManual();
    state[id] = { node: el, score: 99, via: "manual", at: Date.now(), anchors: 0 };
    emit();
    return true;
  }

  async function clearManual(id) {
    await loadManual();
    if (id) delete manual[id];
    else manual = {};
    saveManual();
    return resolveAll({ force: true });
  }

  function status() {
    const out = {};
    for (const id of IDS) {
      const s = state[id];
      out[id] = {
        label: REGIONS[id].label,
        found: alive(id),
        via: s.via,
        score: Math.round((s.score || 0) * 10) / 10,
        at: s.at,
      };
    }
    return out;
  }

  /** Métricas do setor Análise (GMV, espectadores, etc.). */
  function readAnalytics() {
    const root = get("analytics");
    if (!root) return null;
    const out = {};
    let cells = [];
    try {
      cells = Array.from(root.querySelectorAll("div,span,p,li"));
    } catch {}
    const LABELS = [
      ["gmv", /gmv/i],
      ["itensVendidos", /itens\s+atribu[íi]dos\s+vendidos/i],
      ["espectadores", /espectadores\s+atuais/i],
      ["duracaoMedia", /dura[çc][ãa]o\s+m[ée]dia/i],
      ["cliquesProduto", /cliques\s+no\s+produto/i],
      ["percentVisitantes", /porcentagem\s+de\s+visitantes/i],
    ];
    for (const el of cells) {
      const t = ownText(el);
      if (!t || t.length > 60) continue;
      const hit = LABELS.find(([, rx]) => rx.test(t));
      if (!hit) continue;
      const box = el.parentElement || el;
      const val = txt(box).replace(t, "").trim();
      if (val && val !== "--") out[hit[0]] = val.slice(0, 32);
    }
    return Object.keys(out).length ? out : null;
  }

  /** Um setor "vivo" mas que perdeu suas âncoras virou outra coisa — remapeia. */
  function drifted(id) {
    const n = get(id);
    if (!n) return true;
    if (state[id].via === "manual") return false;
    if (!visible(n)) return true;
    try {
      const r = n.getBoundingClientRect();
      if (r.width < 80 || r.height < 60) return true;
    } catch {}
    return false;
  }

  let watcher = null;
  function startWatcher() {
    if (watcher) return;
    watcher = setInterval(() => {
      if (IDS.some((id) => !alive(id) || drifted(id))) {
        lastResolve = 0;
        resolveAll({ force: false }).catch(() => {});
      }
    }, 15000);
    try {
      window.addEventListener(
        "resize",
        () => {
          lastResolve = 0;
        },
        { passive: true },
      );
    } catch {}
  }

  async function exportManual() {
    await loadManual();
    return JSON.parse(JSON.stringify(manual || {}));
  }
  async function importManual(sig) {
    manual = sig && typeof sig === "object" ? { ...sig } : {};
    manualLoaded = true;
    saveManual();
    return resolveAll({ force: true });
  }
  async function reloadManual() {
    manualLoaded = false;
    manual = {};
    await loadManual();
    return resolveAll({ force: true });
  }

  window.PitchaiRegions = {
    IDS,
    REGIONS,
    resolveAll,
    node,
    get,
    contains,
    regionOf,
    setManual,
    clearManual,
    exportManual,
    importManual,
    reloadManual,
    status,
    drifted,
    readAnalytics,
    startWatcher,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
})();

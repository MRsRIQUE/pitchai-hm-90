/**
 * Pitch AI — mapeamento por SETORES do Console de LIVE do TikTok
 * Divide a tela em regiões (produtos, estúdio, chat, atividade, análise) para que
 * o scraping de cada alvo aconteça só dentro do setor correto.
 *
 * Este módulo fornece a API para o content script usar.
 */

import { RegionID, RegionConfig, RegionState, RegionAnalytics } from "../types";

// ============================================================================
// Constantes
// ============================================================================

const CACHE_KEY = "pitchai_regions_v1";
const MANUAL_KEY = "pitchai_regions_manual_v1";
const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;

// ============================================================================
// Definição das Regiões
// ============================================================================

/**
 * Regras declarativas de setor.
 * anchors → textos de cabeçalho/controles exclusivos daquele setor
 * content → evidência mínima que o container do setor precisa ter
 * geometry → posição esperada (fração da viewport) usada como desempate
 */
export const REGIONS: Record<RegionID, RegionConfig> = {
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
    content: (el: Element): boolean => countMatches(el, PRICE_RX) >= 1,
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
    content: (): boolean => true,
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
    content: (): boolean => true,
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
    content: (): boolean => true,
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
    content: (): boolean => true,
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
    content: (): boolean => true,
    geometry: { x: [0, 1], y: [0, 0.18] },
    hintXPath: null,
  },
};

export const IDS: RegionID[] = Object.keys(REGIONS) as RegionID[];

// ============================================================================
// Utilitários
// ============================================================================

/**
 * Obtém todos os documentos (página principal + iframes)
 */
export function roots(): (Document | HTMLDocument)[] {
  try {
    const u = (window as unknown as { PitchaiDomMap?: { util?: { allRoots?: () => Document[] } } })
      .PitchaiDomMap?.util;
    if (u?.allRoots) return u.allRoots();
  } catch {
    // Ignora erros
  }
  return [document];
}

/**
 * Extrai texto de um elemento
 */
export function txt(el: Element): string {
  try {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

/**
 * Extrai texto próprio (somente nós de texto diretos)
 */
export function ownText(el: Element): string {
  let s = "";
  try {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue || "";
    }
  } catch {
    // Ignora erros
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Verifica se um elemento está visível
 */
export function visible(el: Element): boolean {
  if (!el || !el.isConnected) return false;
  try {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    const s = getComputedStyle(el as HTMLElement);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) !== 0;
  } catch {
    return false;
  }
}

/**
 * Conta ocorrências de um regex no texto dos elementos filhos
 */
export function countMatches(el: Element, rx: RegExp): number {
  let n = 0;
  try {
    const kids = el.querySelectorAll("*");
    for (let i = 0; i < kids.length && i < 1500; i++) {
      if (rx.test(ownText(kids[i]))) n++;
    }
  } catch {
    // Ignora erros
  }
  return n;
}

/**
 * Busca elemento por XPath
 */
export function byXPath(path: string): HTMLElement | null {
  try {
    const r = document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return r.singleNodeValue instanceof HTMLElement ? r.singleNodeValue : null;
  } catch {
    return null;
  }
}

/**
 * Calcula score de geometria
 */
export function geometryScore(
  el: Element,
  geo: { x: [number, number]; y: [number, number] } | undefined,
): number {
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

// ============================================================================
// Coleta de Âncoras
// ============================================================================

/**
 * Coleta elementos-folha cujo texto próprio bate com alguma âncora de setor.
 */
export function collectAnchors(): Record<RegionID, Element[]> {
  const found: Record<RegionID, Element[]> = {} as Record<RegionID, Element[]>;
  IDS.forEach((id) => (found[id] = []));

  for (const root of roots()) {
    let all: Element[] = [];
    try {
      all = Array.from(
        root.querySelectorAll<Element>("h1,h2,h3,h4,span,div,p,button,a,input,label"),
      );
    } catch {
      // Ignora erros
    }

    for (let i = 0; i < all.length && i < 6000; i++) {
      const el = all[i];
      let t = ownText(el);
      if (!t && el.tagName === "INPUT") {
        t = (el.getAttribute("placeholder") || "").trim();
      }
      if (!t || t.length > 80) continue;
      if (!visible(el)) continue;

      for (const id of IDS) {
        if (REGIONS[id].anchors.some((rx) => rx.test(t))) {
          found[id].push(el);
        }
      }
    }
  }
  return found;
}

// ============================================================================
// Encontrar Container do Setor
// ============================================================================

/**
 * Sobe do elemento-âncora até o maior ancestral que ainda não engloba
 * âncoras de outro setor. Esse ancestral é o container do setor.
 */
export function containerFor(
  id: RegionID,
  anchorEls: Element[],
  foreignEls: Element[],
): { node: Element; score: number; anchors: number } | null {
  let best: { node: Element; score: number; anchors: number } | null = null;

  for (const anchor of anchorEls.slice(0, 6)) {
    let node: Element | null = anchor;
    let last: Element | null = null;
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
    } catch {
      // Ignora erros
    }

    try {
      const r = last.getBoundingClientRect();
      if (r.width < 120 || r.height < 80) score -= 4;
      if (r.width > (window.innerWidth || 1) * 0.95 && r.height > (window.innerHeight || 1) * 0.95)
        score -= 8;
    } catch {
      // Ignora erros
    }

    if (!best || score > best.score) {
      best = { node: last, score, anchors: mine };
    }
  }
  return best;
}

// ============================================================================
// Estado das Regiões
// ============================================================================

interface RegionInternalState {
  node: Element | null;
  score: number;
  via: string | null;
  at: number;
  anchors: number;
}

const state: Record<RegionID, RegionInternalState> = {} as Record<RegionID, RegionInternalState>;
IDS.forEach((id) => (state[id] = { node: null, score: 0, via: null, at: 0, anchors: 0 }));

let manual: Partial<Record<RegionID, unknown>> = {};
let manualLoaded = false;
const listeners = new Set<(status: Record<RegionID, RegionState>) => void>();

// ============================================================================
// Persistência
// ============================================================================

/**
 * Carrega configurações manuais do armazenamento
 */
async function loadManual(): Promise<Partial<Record<RegionID, unknown>>> {
  return new Promise((res) => {
    if (manualLoaded) return res(manual);
    try {
      (
        chrome.storage.local as {
          get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
        }
      ).get([MANUAL_KEY], (r) => {
        const raw = (r?.[MANUAL_KEY] as Record<string, unknown> | undefined) || {};
        manual = (raw.host === location.host ? raw.sig : {}) as Partial<Record<RegionID, unknown>>;
        manualLoaded = true;
        res(manual);
      });
    } catch {
      manualLoaded = true;
      res(manual);
    }
  });
}

/**
 * Salva configurações manuais
 */
function saveManual(): void {
  try {
    (chrome.storage.local as { set: (items: Record<string, unknown>) => void }).set({
      [MANUAL_KEY]: { host: location.host, sig: manual },
    });
  } catch {
    // Ignora erros
  }
}

/**
 * Salva cache das regiões
 */
function saveCache(): void {
  const sig: Partial<Record<RegionID, unknown>> = {};
  IDS.forEach((id) => {
    const n = state[id].node;
    const sigFn = (
      window as unknown as { PitchaiDomMap?: { util?: { signatureOf?: (el: Element) => unknown } } }
    ).PitchaiDomMap?.util?.signatureOf;
    if (n && sigFn) {
      try {
        sig[id] = sigFn(n);
      } catch {
        // Ignora erros
      }
    }
  });
  try {
    (chrome.storage.local as { set: (items: Record<string, unknown>) => void }).set({
      [CACHE_KEY]: { host: location.host, sig },
    });
  } catch {
    // Ignora erros
  }
}

/**
 * Carrega cache das regiões
 */
async function loadCache(): Promise<Partial<Record<RegionID, unknown>>> {
  return new Promise((res) => {
    try {
      (
        chrome.storage.local as {
          get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
        }
      ).get([CACHE_KEY], (r) => {
        const raw = (r?.[CACHE_KEY] as Record<string, unknown> | undefined) || {};
        res((raw.host === location.host ? raw.sig : {}) as Partial<Record<RegionID, unknown>>);
      });
    } catch {
      res({});
    }
  });
}

// ============================================================================
// Resolução das Regiões
// ============================================================================

function emit(): void {
  const st = status();
  listeners.forEach((cb) => {
    try {
      cb(st);
    } catch {
      // Ignora erros
    }
  });
}

let lastResolve = 0;
let resolving: Promise<Record<RegionID, RegionState>> | null = null;

/**
 * Resolve todas as regiões
 */
export async function resolveAll(
  options: { force?: boolean } = {},
): Promise<Record<RegionID, RegionState>> {
  if (resolving) return resolving;
  if (!options.force && Date.now() - lastResolve < 4000 && IDS.some((id) => alive(id))) {
    return status();
  }

  resolving = (async () => {
    await loadManual();
    const cache = options.force ? {} : await loadCache();
    const anchors = collectAnchors();

    for (const id of IDS) {
      // 1) manual tem prioridade
      if (manual[id]) {
        const el = fromSig(manual[id]);
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
          ? mineNow.filter((a: Element) => {
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
      let best: { node: Element; score: number; anchors: number } | null = null;
      if (mine.length >= (REGIONS[id].minAnchors || 1)) {
        best = containerFor(id, mine, foreign);
      } else if (mine.length) {
        best = containerFor(id, mine, foreign);
      }

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
      const hint = REGIONS[id].hintXPath ? byXPath(REGIONS[id].hintXPath!) : null;
      if (hint && visible(hint)) {
        state[id] = {
          node: hint,
          score: 4,
          via: "hint-xpath",
          at: Date.now(),
          anchors: 0,
        };
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

/**
 * Converte assinatura para elemento
 */
function fromSig(sig: unknown): Element | null {
  if (!sig) return null;
  const sigObj = sig as Record<string, string>;

  for (const root of roots()) {
    if (sigObj.selector) {
      try {
        const n = root.querySelector(sigObj.selector);
        if (n instanceof HTMLElement) return n;
      } catch {
        // Ignora erros
      }
    }
    if (sigObj.path) {
      try {
        const scope = root.body || root;
        const n = (scope as HTMLElement).querySelector?.(sigObj.path);
        if (n instanceof HTMLElement) return n;
      } catch {
        // Ignora erros
      }
    }
  }
  return null;
}

/**
 * Verifica se o conteúdo do setor está OK
 */
function contentOk(id: RegionID, el: Element): boolean {
  try {
    return !!REGIONS[id].content(el);
  } catch {
    return false;
  }
}

/**
 * Verifica se a região está viva (elemento conectado)
 */
function alive(id: RegionID): boolean {
  const n = state[id]?.node;
  return !!(n && n.isConnected);
}

// ============================================================================
// API Pública
// ============================================================================

/**
 * Obtém o nó da região
 */
export function get(id: RegionID): Element | null {
  return alive(id) ? state[id].node : null;
}

/**
 * Obtém o nó da região (assíncrono, com resolução)
 */
export async function node(id: RegionID, opts?: { force?: boolean }): Promise<Element | null> {
  if (alive(id) && !opts?.force) return state[id].node;
  await resolveAll({ force: !!opts?.force });
  return get(id);
}

/**
 * Verifica se um elemento está dentro de uma região
 */
export function contains(id: RegionID, el: Element | Node): boolean {
  const r = get(id);
  if (!r || !(el instanceof Node)) return false;
  try {
    return r === el || r.contains(el);
  } catch {
    return false;
  }
}

/**
 * Em qual setor esse nó está? (null se em nenhum)
 */
export function regionOf(el: Element | Node): RegionID | null {
  for (const id of IDS) {
    if (contains(id, el)) return id;
  }
  return null;
}

/**
 * Define manualmente uma região
 */
export async function setManual(id: RegionID, el: Element): Promise<boolean> {
  if (!REGIONS[id] || !(el instanceof HTMLElement)) return false;
  await loadManual();
  try {
    const sigFn = (
      window as unknown as { PitchaiDomMap?: { util?: { signatureOf?: (el: Element) => unknown } } }
    ).PitchaiDomMap?.util?.signatureOf;
    if (sigFn) manual[id] = sigFn(el);
  } catch {
    return false;
  }
  saveManual();
  state[id] = { node: el, score: 99, via: "manual", at: Date.now(), anchors: 0 };
  emit();
  return true;
}

/**
 * Limpa configuração manual
 */
export async function clearManual(id?: RegionID): Promise<Record<RegionID, RegionState>> {
  await loadManual();
  if (id) delete manual[id];
  else manual = {};
  saveManual();
  return resolveAll({ force: true });
}

/**
 * Obtém status de todas as regiões
 */
export function status(): Record<RegionID, RegionState> {
  const out: Record<RegionID, RegionState> = {} as Record<RegionID, RegionState>;
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

// ============================================================================
// Analytics
// ============================================================================

/** Métricas do setor Análise (GMV, espectadores, etc.). */
export function readAnalytics(): RegionAnalytics | null {
  const root = get("analytics");
  if (!root) return null;

  const out: Record<string, string> = {};
  let cells: Element[] = [];
  try {
    cells = Array.from(root.querySelectorAll("div,span,p,li"));
  } catch {
    cells = [];
  }

  const LABELS: Array<[keyof RegionAnalytics, RegExp]> = [
    ["gmv", /gmv/i],
    ["itensVendidos", /itens\s+atribu[íi]dos\s+vendidos/i],
    ["espectadores", /espectadores\s+atuais/i],
    ["duracaoMedia", /dura[çc][ãa]o\s+m[ée]dia/i],
    ["cliquesProduto", /cliques\s+no\s+produto/i],
    ["percentVisitantes", /porcentagem\s+de\s+visitantes/i],
  ];

  const labelCount = (value: string) => LABELS.filter(([, rx]) => rx.test(value)).length;
  for (const el of cells) {
    const t = ownText(el);
    if (!t || t.length > 60) continue;
    const hit = LABELS.find(([, rx]) => rx.test(t));
    if (!hit) continue;
    let box = el;
    for (let depth = 0; depth < 4 && box.parentElement; depth++) {
      const candidate = box.parentElement;
      const value = txt(candidate);
      if (value.length > 140 || labelCount(value) > 1) break;
      box = candidate;
    }
    const val = txt(box).replace(t, " ").replace(/\s+/g, " ").trim();
    if (val && val !== "--" && val.length <= 64) out[hit[0] as string] = val;
  }

  return Object.keys(out).length ? (out as unknown as RegionAnalytics) : null;
}

// ============================================================================
// Watcher
// ============================================================================

/** Um setor "vivo" mas que perdeu suas âncoras virou outra coisa — remapeia. */
export function drifted(id: RegionID): boolean {
  const n = get(id);
  if (!n) return true;
  if (state[id].via === "manual") return false;
  if (!visible(n)) return true;
  try {
    const r = (n as HTMLElement).getBoundingClientRect();
    if (r.width < 80 || r.height < 60) return true;
  } catch {
    // Ignora erros
  }
  return false;
}

let watcher: ReturnType<typeof setInterval> | null = null;

/** Inicia o watcher que re-resolve setores quando driftam. */
export function startWatcher(): void {
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
  } catch {
    // Ignora erros
  }
}

// ============================================================================
// API de Exportação/Importação
// ============================================================================

/** Exporta os apontamentos manuais. */
export async function exportManual(): Promise<Partial<Record<RegionID, unknown>>> {
  await loadManual();
  return JSON.parse(JSON.stringify(manual || {}));
}

/** Importa os apontamentos manuais. */
export async function importManual(
  sig: Partial<Record<RegionID, unknown>>,
): Promise<Record<RegionID, RegionState>> {
  manual = sig && typeof sig === "object" ? { ...sig } : {};
  manualLoaded = true;
  saveManual();
  return resolveAll({ force: true });
}

/** Recarrega configurações manuais. */
export async function reloadManual(): Promise<Record<RegionID, RegionState>> {
  manualLoaded = false;
  manual = {};
  await loadManual();
  return resolveAll({ force: true });
}

/** Assina mudanças de status das regiões. */
export function onChange(cb: (status: Record<RegionID, RegionState>) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ============================================================================
// API Pública (window.PitchaiRegions)
// ============================================================================

export const PitchaiRegions = {
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
  onChange,
};

if (typeof window !== "undefined") {
  (window as unknown as { PitchaiRegions?: typeof PitchaiRegions }).PitchaiRegions = PitchaiRegions;
}

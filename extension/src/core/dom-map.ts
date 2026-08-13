/**
 * Pitch AI — auto-mapeamento do DOM do TikTok (sem seletores manuais)
 * Módulo TypeScript para mapeamento automático de elementos do DOM
 */

import {
  TargetID,
  TargetConfig,
  TargetState,
  TargetHealth,
  DomMapStatus,
} from "../types";
import type { RegionID } from "../types";

// ============================================================================
// Constantes
// ============================================================================

const CACHE_KEY = "pitchai_dommap_v1";
const MANUAL_KEY = "pitchai_dommap_manual_v1";
const MAX_SCAN = 6000;

// Regex para detecção
const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;
const AUTHOR_RX = /^[^:]{2,32}:\s?\S/;
const SALE_RX = /(comprou|compra|pedido|order|vendid|adicionou ao carrinho|x\s?\d+)/i;
const VIOLATION_RX = /(viola[çc][ãa]o|violation|infra[çc][ãa]o|aviso|warning|penalidad|restri[çc][ãa]o|adverten|bloqueio|conte[úu]do impr[óo]prio|pol[íi]tica da comunidade)/i;
const END_RX = /(encerrar|finalizar|terminar|encerrar transmiss[ãa]o|finalizar live|end live|end broadcast|stop live|parar (a )?(live|transmiss[ãa]o))/i;
const JUNK_CLASS_RX = /(video|player|nav|header|footer|sidebar-menu|modal-mask)/i;

// ============================================================================
// Tipos Internos
// ============================================================================

interface TargetDefinition {
  pool: string;
  score: (el: Element) => number;
  min: number;
  region?: RegionID | RegionID[];
  sample?: boolean;
  loose?: boolean;
}

interface ScoredElement {
  el: Element;
  score: number;
  via: string;
  grew?: boolean;
}

interface InternalState {
  node: Element | null;
  score: number;
  via: string | null;
  at: number;
  evidence: string;
}

// ============================================================================
// Utilitários
// ============================================================================

/**
 * Obtém todos os documentos (página principal + iframes)
 */
export function allDocs(): (Document | HTMLDocument)[] {
  const docs: (Document | HTMLDocument)[] = [document];
  
  const walk = (doc: Document, depth: number): void => {
    if (depth > 3) return;
    
    let frames: HTMLIFrameElement[] = [];
    try {
      frames = Array.from(doc.querySelectorAll<HTMLIFrameElement>("iframe"));
    } catch {
      frames = [];
    }
    
    for (const f of frames) {
      let d: Document | null = null;
      try {
        d = f.contentDocument;
      } catch {
        d = null;
      }
      if (d && !docs.includes(d as Document)) {
        docs.push(d as Document);
        walk(d as Document, depth + 1);
      }
    }
  };
  
  try {
    walk(document, 0);
  } catch {
    // Ignora erros
  }
  
  return docs;
}

/**
 * Obtém todos os documentos + shadow roots abertos
 */
export function allRoots(): (Document | ShadowRoot)[] {
  const roots: (Document | ShadowRoot)[] = allDocs();
  const seen = new Set<Document | ShadowRoot>(roots);
  const queue = roots.slice();
  let guard = 0;
  
  while (queue.length && guard++ < 4000) {
    const root = queue.shift() as Document | ShadowRoot | undefined;
    if (!root) continue;
    
    let hosts: Element[] = [];
    try {
      hosts = Array.from(root.querySelectorAll<Element>("*")).slice(0, 4000);
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

/**
 * Verifica se um elemento está visível
 */
export function isVisible(el: Element): boolean {
  if (!el || !el.isConnected) return false;
  try {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 12) return false;
    const s = getComputedStyle(el as HTMLElement);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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
 * Obtém bagagem de atributos do elemento
 */
export function attrBag(el: Element): string {
  try {
    return [
      el.className && typeof el.className === "string" ? el.className : "",
      el.getAttribute("data-e2e") || "",
      el.getAttribute("data-tid") || "",
      el.getAttribute("aria-label") || "",
      el.id || "",
    ]
      .join(" ")
      .toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Verifica se o elemento está dentro de um player de vídeo
 */
export function insidePlayer(el: Element): boolean {
  let n: Element | null = el;
  let hops = 0;
  
  while (n && hops++ < 6) {
    if (n.tagName === "VIDEO") return true;
    const bag = attrBag(n);
    if (/(^|[^a-z])video(player|-player)?([^a-z]|$)|livestream-player|xgplayer/.test(bag)) {
      return true;
    }
    n = n.parentElement;
  }
  
  try {
    if ((el as HTMLElement).querySelector("video")) return true;
  } catch {
    // Ignora erros
  }
  
  return false;
}

/**
 * Obtém classes estáveis (filtra hashes e classes curtas)
 */
export function stableClasses(el: Element): string[] {
  let list: string[] = [];
  try {
    list = Array.from(el.classList || []);
  } catch {
    list = [];
  }
  
  return list.filter(
    (c) =>
      c.length >= 4 &&
      c.length <= 40 &&
      /[a-z]/i.test(c) &&
      !/^[a-z]{1,3}[0-9a-f]{4,}$/i.test(c) &&
      !/^css-/.test(c),
  );
}

/**
 * Escapa string para uso em seletor CSS
 */
export function cssEscape(s: string): string {
  try {
    return CSS.escape(s);
  } catch {
    return String(s).replace(/[^\w-]/g, "\\$&");
  }
}

const VOLATILE_TXT_RX = /^\s*$|^[\d.,%+-]+$|\d{1,2}[:h]\d{2}|(R\$|US\$|\$|€|£)\s?\d|\b(agora|há|ago|min|seg|hoje)\b/i;

/**
 * Obtém texto próprio (somente nós de texto diretos)
 */
export function ownTextOf(el: Element): string {
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
 * Calcula profundidade entre ancestral e nó
 */
export function depthBetween(ancestor: Element, node: Element): number {
  let d = 0;
  let n: Element | null = node;
  
  while (n && n !== ancestor && d < 25) {
    n = n.parentElement;
    d++;
  }
  
  return n === ancestor ? d : -1;
}

// ============================================================================
// Âncoras Textuais
// ============================================================================

/**
 * Extrai âncoras textuais de um elemento
 * Âncoras são rótulos estáveis dentro do container que sobrevivem a mudanças de classe/posição
 */
export function anchorsOf(el: Element): Array<{ t: string; depth: number; tag: string }> {
  const out: Array<{ t: string; depth: number; tag: string }> = [];
  let kids: Element[] = [];
  
  try {
    kids = Array.from(el.querySelectorAll<Element>("h1,h2,h3,h4,span,div,p,button,label,a")).slice(0, 600);
  } catch {
    kids = [];
  }
  
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

/**
 * Reencontra o container a partir das âncoras textuais salvas
 */
export function fromAnchors(sig: { tag?: string; anchors?: Array<{ t: string; depth: number; tag: string }> }): Element | null {
  const anchors = Array.isArray(sig?.anchors) ? sig.anchors : [];
  if (!anchors.length) return null;
  
  const roots = allRoots();
  
  for (const a of anchors) {
    for (const root of roots) {
      let nodes: Element[] = [];
      try {
        nodes = Array.from(root.querySelectorAll<Element>((a.tag || "*").toLowerCase())).slice(0, 4000);
      } catch {
        nodes = [];
      }
      
      for (const n of nodes) {
        if (ownTextOf(n) !== a.t) continue;
        let p: Element | null = n;
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

// ============================================================================
// Assinatura Estrutural
// ============================================================================

/**
 * Cria assinatura estrutural de um elemento (seletor + caminho nth-child)
 */
export function signatureOf(el: Element): {
  selector: string;
  path: string;
  tag: string;
  anchors: Array<{ t: string; depth: number; tag: string }>;
} {
  const parts: string[] = [];
  const bag: string[] = [];
  
  for (const a of ["data-e2e", "data-tid", "id"] as const) {
    const v = el.getAttribute?.(a);
    if (v && v.length < 60) {
      bag.push(`[${a}="${cssEscape(v)}"]`.replace(/\\/g, ""));
    }
  }
  
  const cls = stableClasses(el)
    .slice(0, 3)
    .map((c) => `.${cssEscape(c)}`);
  
  const selector = bag.length
    ? el.tagName.toLowerCase() + bag.join("")
    : cls.length
      ? el.tagName.toLowerCase() + cls.join("")
      : "";
  
  let n: Element | null = el;
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

/**
 * Reencontra elemento a partir de assinatura
 */
export function fromSignature(sig: ReturnType<typeof signatureOf> | null): Element | null {
  if (!sig) return null;
  
  const roots = allRoots();
  
  // Tentar por seletor
  if (sig.selector) {
    for (const d of roots) {
      try {
        const n = d.querySelector<HTMLElement>(sig.selector);
        if (n instanceof HTMLElement) return n;
      } catch {
        // Ignora erros
      }
    }
  }
  
  // Tentar por âncoras textuais
  const byAnchor = fromAnchors(sig);
  if (byAnchor) return byAnchor;
  
  // Tentar por caminho posicional
  if (sig.path) {
    for (const d of roots) {
      try {
        const scope = (d as Document).body || (d as unknown as HTMLElement);
        const n = (scope as HTMLElement).querySelector?.<HTMLElement>(sig.path);
        if (n instanceof HTMLElement) return n;
      } catch {
        // Ignora erros
      }
    }
  }
  
  return null;
}

// ============================================================================
// Funções de Utilidade para Elementos
// ============================================================================

/**
 * Obtém elementos de um documento por seletor
 */
export function elementsOf(scope: Document | ShadowRoot | Element, sel: string): Element[] {
  try {
    return Array.from(scope.querySelectorAll<Element>(sel));
  } catch {
    return [];
  }
}

/**
 * Obtém nós de região
 */
export function regionNodes(region: RegionID | RegionID[] | undefined): Element[] {
  if (!region) return [];

  const ids = Array.isArray(region) ? region : [region];
  const out: Element[] = [];

  for (const id of ids) {
    let n: Element | null = null;
    try {
      n = (window as unknown as { PitchaiRegions?: { get?: (id: RegionID) => Element | null } }).PitchaiRegions?.get?.(id) || null;
    } catch {
      n = null;
    }
    if (n) out.push(n);
  }

  return out;
}

/**
 * Obtém nó de região
 */
export function regionNode(region: RegionID | RegionID[] | undefined): Element | null {
  return regionNodes(region)[0] || null;
}

// ============================================================================
// Pool de Candidatos
// ============================================================================

/**
 * Obtém pool de candidatos restrito ao(s) setor(es) quando mapeados
 */
export function candidatePool(selector: string, region?: RegionID | RegionID[]): Element[] {
  const out: Element[] = [];
  const scopes = regionNodes(region);
  
  if (scopes.length) {
    for (const scope of scopes) {
      out.push(scope);
      for (const el of elementsOf(scope, selector)) {
        out.push(el);
        if (out.length >= MAX_SCAN) return out;
      }
    }
    if (out.length > scopes.length) return out;
  }
  
  for (const d of allRoots()) {
    const list = elementsOf(d, selector);
    for (const el of list) {
      out.push(el);
      if (out.length >= MAX_SCAN) return out;
    }
  }
  
  return out;
}

// ============================================================================
// Funções de Score
// ============================================================================

/**
 * Calcula score para chat
 */
export function scoreChat(el: Element): number {
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
    const st = getComputedStyle(el as HTMLElement);
    if (/auto|scroll/.test(st.overflowY)) s += 4;
    if (st.flexDirection === "column") s += 1;
  } catch {
    // Ignora erros
  }
  
  let short = 0;
  let authored = 0;
  const sample = Math.min(n, 24);
  
  for (let i = n - sample; i < n; i++) {
    const t = txt(kids[i]);
    if (!t) continue;
    if (t.length > 1 && t.length < 220) short++;
    if (AUTHOR_RX.test(t) || (kids[i].children && kids[i].children.length >= 2 && t.length < 220)) {
      authored++;
    }
  }
  
  if (!sample) return 0;
  
  s += (short / sample) * 6;
  s += (authored / sample) * 7;
  s += Math.min(n, 60) / 15;
  
  // Um chat não é a página inteira
  try {
    const r = el.getBoundingClientRect();
    if (r.width > window.innerWidth * 0.85 && r.height > window.innerHeight * 0.85) s -= 6;
    if (r.height < 80) s -= 4;
  } catch {
    // Ignora erros
  }
  
  return s;
}

/**
 * Assinatura de elemento filho
 */
export function childSignature(el: Element): string {
  return `${el.tagName}|${stableClasses(el).slice(0, 2).join(".")}`;
}

/**
 * Verifica se elemento parece ser um card de produto
 */
export function looksLikeProductCard(el: Element): boolean {
  const t = txt(el);
  if (t.length < 6 || t.length > 500) return false;
  
  let hasImg = false;
  try {
    hasImg = !!el.querySelector("img, [style*='background-image']");
  } catch {
    // Ignora erros
  }
  
  return PRICE_RX.test(t) || (hasImg && t.length > 10);
}

/**
 * Calcula score para lista de produtos
 */
export function scoreProductList(el: Element): number {
  const kids = Array.from(el.children || []);
  
  if (kids.length < 2 || kids.length > 200) return 0;
  if (!isVisible(el)) return 0;
  if (insidePlayer(el)) return 0;
  
  const sigs = new Map<string, number>();
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

/**
 * Calcula score para feed de vendas
 */
export function scoreSales(el: Element): number {
  const kids = Array.from(el.children || []);
  
  if (kids.length < 1 || kids.length > 200) return 0;
  if (!isVisible(el)) return 0;
  
  const hits = kids.filter((k) => SALE_RX.test(txt(k))).length;
  // Sem nenhuma evidência de venda não é feed de vendas
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

/**
 * Calcula score para violação
 */
export function scoreViolation(el: Element): number {
  const t = txt(el);
  if (!t || t.length > 160) return 0;
  if (!VIOLATION_RX.test(t) && !VIOLATION_RX.test(attrBag(el))) return 0;
  if (!isVisible(el)) return 0;
  
  let s = 5;
  if (VIOLATION_RX.test(t)) s += 3;
  if (el.children.length <= 3) s += 2;
  
  try {
    const c = getComputedStyle(el as HTMLElement).color + getComputedStyle(el as HTMLElement).backgroundColor;
    if (/rgb\((2[0-5]\d|1[89]\d),\s*\d{1,2},/.test(c)) s += 2;
  } catch {
    // Ignora erros
  }
  
  return s;
}

/**
 * Calcula score para botão de encerrar live
 */
export function scoreEndLive(el: Element): number {
  const label = `${txt(el)} ${attrBag(el)}`.toLowerCase();
  if (!END_RX.test(label)) return 0;
  if (/cancelar|cancel|voltar/.test(label)) return 0;
  if (!isVisible(el)) return 0;
  
  let s = 6;
  if (el.tagName === "BUTTON") s += 3;
  if ((el as HTMLElement).closest?.("aside, footer, header")) s += 3;
  if (txt(el).length <= 30) s += 2;
  
  // Botão vermelho de encerrar é a assinatura visual mais comum
  try {
    const bg = getComputedStyle(el as HTMLElement).backgroundColor || "";
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m && +m[1] > 170 && +m[2] < 90 && +m[3] < 90) s += 3;
  } catch {
    // Ignora erros
  }
  
  return s;
}

// ============================================================================
// Definição dos Alvos
// ============================================================================

/**
 * Cada alvo pertence a um SETOR e só é aceito dentro dele
 */
const TARGETS: Record<TargetID, TargetDefinition> = {
  chat: { pool: "ul, ol, div", score: scoreChat, min: 9, sample: true, region: "chat" },
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
    pool: "button, [role='button'], a",
    score: scoreEndLive,
    min: 7,
    region: ["studio", "topbar"],
    loose: true,
  },
};

// Dicas legadas (XPaths antigos) — entram só como candidatos extras
const HINT_XPATHS: Record<TargetID, string | undefined> = {
  chat: "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[2]/div[2]/div[3]/div/div[2]",
  sales: "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[2]/div[3]/div[2]/div/div[2]/div/div/div/div[1]/div/div[1]/div/div/div",
  violation: "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[1]/div/div[2]/span/button/span/span",
  endLive: "/html/body/div[2]/div/div[2]/aside/div/div/div/div/div[1]/button",
  products: "/html/body/div[2]/div/div[2]/main/div/div/div/div/div/div/div[1]/div/div[3]",
};

/**
 * Busca elemento por XPath
 */
export function byXPath(path: string): HTMLElement | null {
  try {
    const r = document.evaluate(
      path,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    return r.singleNodeValue instanceof HTMLElement ? r.singleNodeValue : null;
  } catch {
    return null;
  }
}

// ============================================================================
// Estado e Cache
// ============================================================================

const state: Record<TargetID, InternalState> = {} as Record<TargetID, InternalState>;

// Inicializa estado
Object.keys(TARGETS).forEach((k) => {
  state[k as TargetID] = { node: null, score: 0, via: null, at: 0, evidence: "" };
});

let cache: Partial<Record<TargetID, ReturnType<typeof signatureOf>>> = {};
let cacheLoaded = false;
let manual: Partial<Record<TargetID, ReturnType<typeof signatureOf>>> = {};
let manualLoaded = false;
const listeners = new Set<(status: DomMapStatus) => void>();

// ============================================================================
// Persistência
// ============================================================================

/**
 * Carrega cache do armazenamento
 */
async function loadCache(): Promise<Partial<Record<TargetID, ReturnType<typeof signatureOf>>>> {
  return new Promise((res) => {
    if (cacheLoaded) return res(cache);
    try {
      (chrome.storage.local as { get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void }).get(
        [CACHE_KEY],
        (r) => {
          const raw = r?.[CACHE_KEY] as Record<string, unknown> | undefined || {};
          cache = (raw.host === location.host ? raw.sig : {}) as Partial<Record<TargetID, ReturnType<typeof signatureOf>>>;
          cacheLoaded = true;
          res(cache);
        },
      );
    } catch {
      cacheLoaded = true;
      res(cache);
    }
  });
}

/**
 * Salva cache no armazenamento
 */
function saveCache(): void {
  try {
    (chrome.storage.local as { set: (items: Record<string, unknown>) => void }).set({
      [CACHE_KEY]: { host: location.host, sig: cache },
    });
  } catch {
    // Ignora erros
  }
}

/**
 * Carrega configurações manuais
 */
async function loadManual(): Promise<Partial<Record<TargetID, ReturnType<typeof signatureOf>>>> {
  return new Promise((res) => {
    if (manualLoaded) return res(manual);
    try {
      (chrome.storage.local as { get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void }).get(
        [MANUAL_KEY],
        (r) => {
          const raw = r?.[MANUAL_KEY] as Record<string, unknown> | undefined || {};
          manual = (raw.host === location.host ? raw.sig : {}) as Partial<Record<TargetID, ReturnType<typeof signatureOf>>>;
          manualLoaded = true;
          res(manual);
        },
      );
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

// ============================================================================
// Emissão de Eventos
// ============================================================================

function emit(): void {
  listeners.forEach((cb) => {
    try {
      cb(status());
    } catch {
      // Ignora erros
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ============================================================================
// Desempate do Chat
// ============================================================================

/**
 * Desempate do chat: o container que mais cresce em ~3s é o chat de verdade
 */
async function pickGrowing(cands: ScoredElement[]): Promise<ScoredElement | null> {
  const counts = cands.map((c) => (c.el as HTMLElement).children.length);
  await sleep(1000);
  const mid = cands.map((c) => (c.el as HTMLElement).children.length);
  await sleep(1000);
  const end = cands.map((c) => (c.el as HTMLElement).children.length);
  
  let best: ScoredElement | null = null;
  let bestVal = -Infinity;
  
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

// ============================================================================
// Scan de Alvos
// ============================================================================

/**
 * Realiza scan para encontrar um alvo
 */
async function scan(target: TargetID): Promise<ScoredElement | null> {
  const def = TARGETS[target];
  if (!def) return null;
  
  const seen = new Set<Element>();
  const scored: ScoredElement[] = [];
  
  // Garante que os setores estejam resolvidos antes de procurar o alvo
  try {
    await (window as unknown as { PitchaiRegions?: { resolveAll?: (options: { force: boolean }) => Promise<unknown> } }).PitchaiRegions?.resolveAll?.({ force: false });
  } catch {
    // Ignora erros
  }
  
  const scopes = regionNodes(def.region);
  const scope = scopes[0] || null;
  
  const inRegion = (el: Element): boolean => {
    if (!scopes.length) return true;
    try {
      return scopes.some((s) => s === el || s.contains(el));
    } catch {
      return false;
    }
  };
  
  // Alvos "loose" (violação, encerrar) podem estar fora do setor — só perdem bônus
  const reject = (el: Element): boolean => !def.loose && scopes.length > 0 && !inRegion(el);
  
  // Verificar dica de XPath
  const hint = HINT_XPATHS[target] ? byXPath(HINT_XPATHS[target]!) : null;
  if (hint && !reject(hint)) {
    const s = def.score(hint);
    if (s >= def.min) scored.push({ el: hint, score: s + 1, via: "hint-xpath" });
    seen.add(hint);
  }
  
  // Verificar pool de candidatos
  const pool = candidatePool(def.pool, def.region);
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
    if (inRegion(el) && scope) s += 4; // Bônus por estar no setor certo
    if (s >= def.min) scored.push({ el, score: s, via: scope && inRegion(el) ? "setor" : "auto-scan" });
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

// ============================================================================
// Gerenciamento de Estado
// ============================================================================

function setResult(
  target: TargetID,
  el: Element | null,
  score: number,
  via: string | null,
  evidence: string,
): void {
  state[target] = { node: el, score, via, at: Date.now(), evidence: evidence || "" };
  if (el && via !== "manual") {
    cache[target] = signatureOf(el);
    saveCache();
  }
  emit();
}

/**
 * Define manualmente um alvo
 */
export async function setManual(target: TargetID, el: Element): Promise<boolean> {
  if (!TARGETS[target] || !(el instanceof HTMLElement)) return false;
  await loadManual();
  manual[target] = signatureOf(el);
  saveManual();
  setResult(target, el, 99, "manual", "apontado pelo usuário");
  return true;
}

/**
 * Limpa configuração manual
 */
export async function clearManual(target?: TargetID): Promise<void> {
  await loadManual();
  if (target) delete manual[target];
  else manual = {};
  saveManual();
  if (target) invalidate(target);
}

// ============================================================================
// Resolução de Alvos
// ============================================================================

const inflight: Partial<Record<TargetID, Promise<Element | null>>> = {};

/**
 * Resolve um alvo
 */
export async function resolve(
  target: TargetID,
  options: { force?: boolean } = {},
): Promise<Element | null> {
  const st = state[target];
  if (!options.force && st.node && st.node.isConnected) return st.node;
  const existing = inflight[target];
  if (existing) return existing;
  
  inflight[target] = (async () => {
    await loadManual();
    await loadCache();
    const def = TARGETS[target];
    
    // 1. Verificar manual
    if (manual[target]) {
      const el = fromSignature(manual[target]);
      if (el) {
        setResult(target, el, 99, "manual", "apontado pelo usuário");
        return el;
      }
    }
    
    // 2. Verificar cache
    if (!options.force && cache[target]) {
      const el = fromSignature(cache[target]);
      if (el) {
        let s = 0;
        try {
          s = def.score(el);
        } catch {
          s = 0;
        }
        if (s >= def.min) {
          setResult(target, el, s, "cache", "assinatura salva");
          return el;
        }
      }
    }
    
    // 3. Realizar scan
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

/**
 * Invalida um alvo
 */
export function invalidate(target: TargetID): void {
  if (!state[target]) return;
  state[target] = { node: null, score: 0, via: null, at: 0, evidence: "invalidado" };
  delete cache[target];
  saveCache();
  emit();
}

/**
 * Re-mapeia todos os alvos
 */
export async function remapAll(): Promise<Record<TargetID, boolean>> {
  Object.keys(TARGETS).forEach((k) => {
    delete cache[k as TargetID];
  });
  saveCache();
  
  const out: Record<TargetID, boolean> = {} as Record<TargetID, boolean>;
  for (const k of Object.keys(TARGETS) as TargetID[]) {
    out[k] = !!(await resolve(k, { force: true }));
  }
  return out;
}

/**
 * Obtém status de todos os alvos
 */
export function status(): DomMapStatus {
  const out: DomMapStatus = {} as DomMapStatus;
  
  for (const k of Object.keys(TARGETS) as TargetID[]) {
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

// ============================================================================
// Auto-cura
// ============================================================================

/**
 * Verifica saúde de um alvo
 */
export function healthOf(target: TargetID): TargetHealth {
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
  
  // Tolerância para oscilação
  const floor = def.min * 0.55;
  return { ok: sc >= floor, score: sc, reason: sc >= floor ? "ok" : "score caiu" };
}

let healing = false;

/**
 * Revalida todos os alvos
 */
export async function healAll(options: { force?: boolean } = {}): Promise<void> {
  if (healing) return;
  healing = true;
  
  try {
    for (const k of Object.keys(TARGETS) as TargetID[]) {
      const h = healthOf(k);
      if (h.ok && !options.force) continue;
      const before = state[k].node;
      invalidate(k);
      const found = await resolve(k, { force: true }).catch(() => null);
      if (!found && before) {
        // Não achou nada melhor — devolve o antigo
        if (before.isConnected) setResult(k, before, 0, "fallback", "mantido até achar outro");
      }
    }
  } finally {
    healing = false;
  }
}

// ============================================================================
// Watchdog
// ============================================================================

let watchdog: ReturnType<typeof setInterval> | null = null;
let mo: MutationObserver | null = null;
let churnTimer: ReturnType<typeof setTimeout> | null = null;
let unsubRegions: (() => void) | null = null;

/**
 * Inicia o watchdog para monitorar mudanças no DOM
 */
export function startWatchdog(): void {
  if (watchdog) return;
  
  watchdog = setInterval(() => {
    healAll().catch(() => {});
  }, 15000);
  
  // Re-render pesado do TikTok → remapeia logo
  try {
    mo = new MutationObserver((records) => {
      let removedTracked = false;
      
      for (const r of records) {
        if (!r.removedNodes || !r.removedNodes.length) continue;
        
        for (const k of Object.keys(TARGETS) as TargetID[]) {
          const n = state[k].node;
          if (!n) continue;
          
          for (const rm of r.removedNodes) {
            if (rm === n || (rm as Element).contains?.(n)) {
              removedTracked = true;
              break;
            }
          }
          if (removedTracked) break;
        }
        if (removedTracked) break;
      }
      
      if (!removedTracked) return;
      
      clearTimeout(churnTimer as unknown as number);
      churnTimer = setTimeout(() => {
        healAll().catch(() => {});
      }, 800);
    });
    
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch {
    // Ignora erros
  }
  
  // Setor mudou de lugar → alvos daquele setor precisam ser reavaliados
  try {
    unsubRegions = (window as unknown as { PitchaiRegions?: { onChange?: (cb: () => void) => () => void } }).PitchaiRegions?.onChange?.(() => {
      clearTimeout(churnTimer as unknown as number);
      churnTimer = setTimeout(() => {
        healAll().catch(() => {});
      }, 1200);
    }) || null;
  } catch {
    // Ignora erros
  }
  
  try {
    (window as unknown as { PitchaiRegions?: { startWatcher?: () => void } }).PitchaiRegions?.startWatcher?.();
  } catch {
    // Ignora erros
  }
}

/**
 * Para o watchdog
 */
export function stopWatchdog(): void {
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
  if (mo) {
    try {
      mo.disconnect();
    } catch {
      // Ignora erros
    }
    mo = null;
  }
  if (unsubRegions) {
    try {
      unsubRegions();
    } catch {
      // Ignora erros
    }
    unsubRegions = null;
  }
  if (churnTimer) {
    clearTimeout(churnTimer);
    churnTimer = null;
  }
}

// ============================================================================
// API de Exportação/Importação
// ============================================================================

/**
 * Exporta os apontamentos manuais
 */
export async function exportManual(): Promise<Partial<Record<TargetID, ReturnType<typeof signatureOf>>>> {
  await loadManual();
  return JSON.parse(JSON.stringify(manual || {}));
}

/**
 * Importa os apontamentos manuais
 */
export async function importManual(sig: Partial<Record<TargetID, ReturnType<typeof signatureOf>>>): Promise<Record<TargetID, boolean>> {
  manual = sig && typeof sig === "object" ? { ...sig } : {};
  manualLoaded = true;
  saveManual();
  
  Object.keys(manual).forEach((t) => {
    try {
      invalidate(t as TargetID);
    } catch {
      // Ignora erros
    }
  });
  
  return remapAll();
}

/**
 * Recarrega configurações manuais
 */
export async function reloadManual(): Promise<Record<TargetID, boolean>> {
  manualLoaded = false;
  manual = {};
  await loadManual();
  
  Object.keys(manual).forEach((t) => {
    try {
      invalidate(t as TargetID);
    } catch {
      // Ignora erros
    }
  });
  
  return remapAll();
}

// ============================================================================
// Inicialização
// ============================================================================

/**
 * Inicializa o módulo DomMap
 */
export function initDomMap(): void {
  // Marca que o módulo foi inicializado
  (window as unknown as { PitchaiDomMap?: boolean }).PitchaiDomMap = true;
}

// ============================================================================
// API Pública
// ============================================================================

/**
 * Obtém se um alvo tem configuração manual
 */
export function hasManual(target: TargetID): boolean {
  return !!manual[target];
}

/**
 * Assina mudanças de status
 */
export function onChange(cb: (status: DomMapStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Exporta utilitários
export const util = {
  PRICE_RX,
  SALE_RX,
  allDocs,
  allRoots,
  isVisible,
  txt,
  ownTextOf,
  signatureOf,
  anchorsOf,
  fromSignature,
  looksLikeProductCard,
};

// Cria a API pública
export const PitchaiDomMap = {
  resolve,
  invalidate,
  remapAll,
  status,
  setManual,
  clearManual,
  exportManual,
  importManual,
  reloadManual,
  hasManual,
  startWatchdog,
  stopWatchdog,
  healAll,
  health: healthOf,
  onChange,
  util,
};

// Inicializa automaticamente
initDomMap();

// Exporta para o window
declare global {
  interface Window {
    PitchaiDomMap?: typeof PitchaiDomMap;
  }
}

if (typeof window !== "undefined") {
  window.PitchaiDomMap = PitchaiDomMap;
}

// Exporta tipos
export type { TargetID, TargetConfig, TargetState, TargetHealth, DomMapStatus };

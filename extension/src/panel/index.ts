/**
 * Pitch AI Panel - Painel de controle da extensão
 * Gerencia configurações, produtos, voz, demo e diagnóstico
 */

import { Config, Product, DEFAULT_CONFIG, parseConfig } from "../types";

// ============================================================================
// Constantes
// ============================================================================

const KEY = "pitchai.config.v1";
const STORAGE_KEY = KEY;
const MAP_STATUS_KEY = "pitchai.dommap.status";
const DM_MANUAL_KEY = "pitchai_dommap_manual_v1";
const RG_MANUAL_KEY = "pitchai_regions_manual_v1";

// ============================================================================
// API Base
// ============================================================================

function resolveApiBase(): string {
  if (window.location.origin && window.location.origin.includes("run.app")) {
    return window.location.origin;
  }
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return window.location.origin;
  }
  return "https://pitchai-hm.vercel.app";
}

const API_BASE = resolveApiBase();

// ============================================================================
// Assinatura de Requisições
// ============================================================================

/**
 * Assinatura criptográfica HMAC para proteger requisições
 */
async function signRequest(token: string, endpoint: string): Promise<Record<string, string>> {
  if (!token) return {};

  const ts = Date.now().toString();
  const nonce = Math.random().toString(36).substring(2, 10);

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(token),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}:${nonce}:${endpoint}`));

    const sigHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return {
      "X-PitchAI-Signature": sigHex,
      "X-PitchAI-Timestamp": ts,
      "X-PitchAI-Nonce": nonce,
      "X-PitchAI-Token": token,
      Authorization: `Bearer ${token}`,
    };
  } catch {
    return { Authorization: `Bearer ${token}` };
  }
}

// ============================================================================
// Criptografia de Armazenamento
// ============================================================================

const CRYPTO_SALT = "pitchai_ext_v2_salt";

function stableStorageSeed(): string {
  return `${CRYPTO_SALT}:extension:${chrome.runtime?.id || "pitchai"}`;
}

async function getStorageKey(): Promise<CryptoKey | null> {
  try {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(stableStorageSeed()),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode("pitchai_secure_salt_2026"),
        iterations: 10000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    return null;
  }
}

async function encryptConfigObj(obj: unknown): Promise<unknown> {
  try {
    const raw = JSON.stringify(obj);
    const cryptoKey = await getStorageKey();
    if (!cryptoKey) return obj;

    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(raw));

    return {
      __enc: Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      __iv: Array.from(iv)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
      __v: 2,
    };
  } catch {
    return obj;
  }
}

async function decryptConfigObj(data: unknown): Promise<unknown> {
  if (!data || typeof data !== "object") return data;
  const dataObj = data as Record<string, unknown>;

  if (!dataObj.__enc || !dataObj.__iv) return data;

  try {
    const cryptoKey = await getStorageKey();
    if (!cryptoKey) return data;

    const iv = new Uint8Array(
      (dataObj.__iv as string).match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [],
    );
    const encBuf = new Uint8Array(
      (dataObj.__enc as string).match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [],
    );

    const decBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encBuf);
    const decStr = new TextDecoder().decode(decBuf);
    return JSON.parse(decStr);
  } catch {
    return data;
  }
}

// ============================================================================
// Configuração
// ============================================================================

const VOICES: [string, string][] = [
  ["nova", "Nova · Feminina jovem"],
  ["shimmer", "Shimmer · Feminina calorosa"],
  ["coral", "Coral · Feminina expressiva"],
  ["alloy", "Alloy · Neutra"],
  ["echo", "Echo · Masculina séria"],
  ["onyx", "Onyx · Masculina grave"],
  ["fable", "Fable · Narrador britânico"],
  ["sage", "Sage · Neutra tranquila"],
];

// ============================================================================
// Utilitários
// ============================================================================

function get(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), obj);
}

function set(obj: Record<string, unknown>, path: string, val: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] ??= {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = val;
}

function normalizeConfig(raw: unknown): Config {
  const stored = (raw as Partial<Config>) || {};
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    autoFixar: { ...DEFAULT_CONFIG.autoFixar, ...(stored.autoFixar || {}) },
    pitchBank: { ...DEFAULT_CONFIG.pitchBank, ...(stored.pitchBank || {}) },
    voz: {
      ...DEFAULT_CONFIG.voz,
      ...(stored.voz || {}),
      monitor: { ...DEFAULT_CONFIG.voz.monitor, ...(stored.voz?.monitor || {}) },
      pushToTalk: { ...DEFAULT_CONFIG.voz.pushToTalk, ...(stored.voz?.pushToTalk || {}) },
    },
    vozContextos: { ...DEFAULT_CONFIG.vozContextos, ...(stored.vozContextos || {}) },
    filtros: { ...DEFAULT_CONFIG.filtros, ...(stored.filtros || {}) },
    demo: { ...DEFAULT_CONFIG.demo, ...(stored.demo || {}) },
    produtos: Array.isArray(stored.produtos) ? stored.produtos : [],
  };
}

async function load(): Promise<Config> {
  return new Promise((res) => {
    (
      chrome.storage.local as {
        get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
      }
    ).get([KEY], async (r) => {
      const dec = await decryptConfigObj(r[KEY]);
      res(normalizeConfig(dec));
    });
  });
}

/**
 * Gravação incremental: relê o storage e mescla só o que o painel mudou.
 */
function save(cfg: Config, opts?: { products?: boolean }): void {
  (
    chrome.storage.local as {
      get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
    }
  ).get([KEY], async (r) => {
    const dec = await decryptConfigObj(r[KEY]);
    const stored = normalizeConfig(dec);
    const merged = normalizeConfig({ ...stored, ...cfg });
    if (!opts?.products && Array.isArray(stored.produtos)) {
      merged.produtos = stored.produtos;
    }
    const enc = await encryptConfigObj(merged);
    (chrome.storage.local as { set: (items: Record<string, unknown>) => void }).set({ [KEY]: enc });
  });
}

// ============================================================================
// Funções de Produtos
// ============================================================================

const BAD_PRODUCT_RX =
  /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live|^(?:carrinho|adicionado ao carrinho|cliques?|fixar|desafixar|editar|excluir|remover)(?:\s*\d+)?$)/i;

function productKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupProducts(): void {
  const before = cfg.produtos?.length || 0;
  const seen = new Set<string>();

  cfg.produtos = (cfg.produtos || []).filter((p) => {
    const key = productKey(p.name);
    if (!key || key.length < 4 || BAD_PRODUCT_RX.test(p.name || "")) return false;
    if (p.demo && !cfg.demo?.enabled) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!cfg.produtos.some((p) => p.active) && cfg.produtos[0]) {
    cfg.produtos[0].active = true;
  }

  if (cfg.produtos.length !== before) save(cfg, { products: true });
}

function sendDemoCommand(action: string): number {
  const ts = Date.now();
  (chrome.storage.local as { set: (items: Record<string, unknown>) => void }).set({
    "pitchai.demo.cmd": { action, ts },
  });
  return ts;
}

// ============================================================================
// Renderização
// ============================================================================

let cfg: Config;

function fillVoiceSelects(): void {
  document.querySelectorAll<HTMLSelectElement>("select[data-vc]").forEach((sel) => {
    sel.innerHTML = "";
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "— usar voz global —";
    sel.appendChild(optNone);

    VOICES.forEach(([id, label]) => {
      const o = document.createElement("option");
      o.value = id;
      o.textContent = label;
      sel.appendChild(o);
    });
  });
}

function render(): void {
  cleanupProducts();

  document.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
    const key = el.getAttribute("data-key");
    if (!key) return;

    const val = get(cfg, key);
    if (el.classList.contains("pnl-toggle")) {
      el.classList.toggle("on", !!val);
    } else if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "checkbox") {
      (el as HTMLInputElement).checked = !!val;
    } else if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
      (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = (val ??
        "") as string;
    }
  });

  const voiceSelect = document.getElementById("pnl-voice") as HTMLSelectElement;
  if (voiceSelect) voiceSelect.value = cfg.voz.id;

  const speedInput = document.getElementById("pnl-speed") as HTMLInputElement;
  const speedVal = document.getElementById("pnl-speed-val");
  if (speedInput) speedInput.value = String(cfg.voz.speed);
  if (speedVal) speedVal.textContent = Number(cfg.voz.speed).toFixed(2) + "x";

  const gainInput = document.getElementById("pnl-gain") as HTMLInputElement;
  const gainVal = document.getElementById("pnl-gain-val");
  if (gainInput) gainInput.value = String(cfg.voz.gain ?? 1);
  if (gainVal) gainVal.textContent = Number(cfg.voz.gain ?? 1).toFixed(2) + "x";

  const blacklistInput = document.getElementById("pnl-blacklist") as HTMLTextAreaElement;
  if (blacklistInput) {
    blacklistInput.value = (cfg.filtros?.blacklist || []).join("\n");
  }

  const whitelistInput = document.getElementById("pnl-whitelist") as HTMLTextAreaElement;
  if (whitelistInput) {
    whitelistInput.value = (cfg.filtros?.whitelist || []).join("\n");
  }

  document.querySelectorAll<HTMLSelectElement>("select[data-vc]").forEach((sel) => {
    const k = sel.getAttribute("data-vc");
    if (!k) return;
    const v = cfg.vozContextos?.[k as keyof typeof cfg.vozContextos];
    sel.value = v?.id || "";
  });

  renderProducts();
  renderAutofixPicker();
}

function produtosSelecionados(): Product[] {
  const ids = Array.isArray(cfg.autoFixar?.ids) ? cfg.autoFixar.ids : [];
  return (cfg.produtos || []).filter((p) => ids.includes(p.id || ""));
}

function syncSelectedProductNames(): void {
  cfg.autoFixar ??= { ...DEFAULT_CONFIG.autoFixar };
  cfg.autoFixar.names = produtosSelecionados().map((p) => p.name);
}

function renderAutofixPicker(): void {
  const sel = document.getElementById("pnl-autofix-pick") as HTMLSelectElement;
  const hint = document.getElementById("pnl-autofix-hint");

  const list = (cfg.produtos || []).filter((p) => p?.name && productKey(p.name).length >= 4);
  const current = cfg.autoFixar?.query || "";
  if (sel) {
    sel.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = list.length ? "— escolher produto —" : "— nenhum produto lido ainda —";
    sel.appendChild(none);

    list.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id || p.name;
      o.textContent = p.price ? `${p.name} · ${p.price}` : p.name;
      sel.appendChild(o);
    });

    const currentProduct = list.find(
      (p) => p.name === current || p.id === current || cfg.autoFixar?.ids?.includes(p.id || ""),
    );
    sel.value = currentProduct?.id || "";
  }

  if (hint) {
    const sel2 = produtosSelecionados();
    if (!list.length) {
      hint.textContent = "Abra a live e toque em 🔄 para ler a vitrine automaticamente.";
    } else if (sel2.length) {
      hint.textContent = `Selecionados para fixar: ${sel2.length} — ${sel2.map((p) => p.name).join(", ")}`;
    } else {
      hint.textContent = `${list.length} produto(s) lidos. Marque abaixo quais serão autofixados.`;
    }
  }
}

function renderProducts(): void {
  const box = document.getElementById("pnl-products");
  if (!box) return;

  box.innerHTML = "";

  if (!cfg.produtos.length) {
    const p = document.createElement("p");
    p.textContent = "Nenhum produto ainda.";
    box.appendChild(p);
    return;
  }

  if (!Array.isArray(cfg.autoFixar.ids)) cfg.autoFixar.ids = [];

  const hint = document.createElement("p");
  hint.className = "pnl-sub";
  hint.textContent =
    "Marque os produtos que podem ser fixados. Sem nenhum marcado, a automação fica aguardando.";
  box.appendChild(hint);

  cfg.produtos.forEach((prod, i) => {
    const row = document.createElement("div");
    row.className = "pnl-prod";

    const wrap = document.createElement("label");
    wrap.style.cssText =
      "display:flex;align-items:center;gap:6px;font-size:11px;white-space:nowrap";

    const pick = document.createElement("input");
    pick.type = "checkbox";
    pick.checked = cfg.autoFixar.ids.includes(prod.id || "");
    pick.onchange = () => {
      const ids = new Set(cfg.autoFixar.ids);
      if (pick.checked) ids.add(prod.id || "");
      else ids.delete(prod.id || "");
      cfg.autoFixar.ids = Array.from(ids);
      syncSelectedProductNames();
      save(cfg);
      renderAutofixPicker();
    };

    const txt = document.createElement("span");
    txt.textContent = "fixar";
    wrap.append(pick, txt);

    const input = document.createElement("input");
    input.type = "text";
    input.value = prod.name;
    input.oninput = () => {
      if (cfg.produtos[i]) {
        cfg.produtos[i].name = input.value;
        syncSelectedProductNames();
        save(cfg, { products: true });
      }
    };

    const del = document.createElement("button");
    del.className = "pnl-btn ghost";
    del.textContent = "✕";
    del.onclick = () => {
      cfg.autoFixar.ids = cfg.autoFixar.ids.filter((id) => id !== (prod.id || ""));
      cfg.produtos.splice(i, 1);
      syncSelectedProductNames();
      save(cfg, { products: true });
      render();
    };

    row.append(wrap, input, del);
    box.appendChild(row);
  });
}

function parseLines(t: string): string[] {
  return String(t || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ============================================================================
// Funções de Catálogo
// ============================================================================

function waitForCatalogUpdate(beforeCount: number, commandTs: number): Promise<Config | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    let done = false;

    const finish = (updated: Config | null): void => {
      if (done) return;
      done = true;
      clearInterval(poll);
      try {
        (
          chrome.storage as {
            onChanged?: {
              removeListener?: (
                listener: (changes: Record<string, { newValue?: unknown }>) => void,
              ) => void;
            };
          }
        ).onChanged?.removeListener?.(listener);
      } catch {
        // Ignora erros
      }
      resolve(updated);
    };

    const listener = async (changes: Record<string, { newValue?: unknown }>): Promise<void> => {
      const ack = changes["pitchai.demo.ack"]?.newValue as
        { action?: string; ts?: number } | undefined;
      if (ack?.action === "catalogo" && Number(ack.ts || 0) >= commandTs) {
        finish(await load());
        return;
      }
      const updated = changes[KEY]?.newValue;
      if (!updated) return;
      const normalized = normalizeConfig(await decryptConfigObj(updated));
      if ((normalized.produtos || []).length > beforeCount) {
        finish(normalized);
      }
    };

    try {
      (
        chrome.storage as {
          onChanged?: {
            addListener?: (
              listener: (changes: Record<string, { newValue?: unknown }>) => void,
            ) => void;
          };
        }
      ).onChanged?.addListener?.(listener);
    } catch {
      // Ignora erros
    }

    const poll = setInterval(async () => {
      const current = await load();
      if ((current.produtos || []).length > beforeCount || Date.now() - start > 9000) {
        finish(current);
      }
    }, 500);
  });
}

async function reloadCatalog(btn: HTMLElement | null): Promise<void> {
  const hint = document.getElementById("pnl-autofix-hint");
  const before = (cfg.produtos || []).length;
  const label = btn?.textContent;

  if (btn) {
    (btn as HTMLButtonElement).disabled = true;
    btn.textContent = "Lendo vitrine…";
  }
  if (hint) hint.textContent = "Lendo vitrine…";

  const commandTs = sendDemoCommand("catalogo");
  const updated = await waitForCatalogUpdate(before, commandTs);
  cfg = updated || (await load());
  render();

  const after = (cfg.produtos || []).length;

  if (btn) {
    (btn as HTMLButtonElement).disabled = false;
    btn.textContent = label || "";
  }

  if (hint) {
    if (!after) {
      hint.textContent = "Nenhum produto encontrado — abra a página da live e tente de novo.";
    } else if (after > before) {
      hint.textContent = `✓ ${after} produto(s) na vitrine (+${after - before} novo(s)).`;
    } else {
      hint.textContent = `✓ vitrine atualizada — ${after} produto(s).`;
    }
  }
}

// ============================================================================
// Studio da Live
// ============================================================================

const video = document.getElementById("pnl-video") as HTMLVideoElement;
const info = document.getElementById("pnl-src-info");
const timeEl = document.getElementById("pnl-live-time");
const agendaInfo = document.getElementById("pnl-agenda-info");

let stream: MediaStream | null = null;
let fileUrl: string | null = null;
let live = false;
let elapsed = 0;
let tick: ReturnType<typeof setInterval> | null = null;

const fmt = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

const stopTracks = (): void => {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
};

const attach = (s: MediaStream): void => {
  stopTracks();
  stream = s;
  if (video) {
    video.srcObject = s;
    video.removeAttribute("src");
    video.muted = true;
    video.play().catch(() => {});
  }
};

// ============================================================================
// Diagnóstico
// ============================================================================

const MAP_LABELS = {
  chat: "Chat da live",
  products: "Vitrine de produtos",
  sales: "Vendas",
  violation: "Avisos / violações",
  endLive: "Botão encerrar LIVE",
};

const VIA_LABEL: Record<string, string> = {
  cache: "assinatura salva",
  manual: "apontado por você",
  rede: "lido da API do TikTok",
  "hint-xpath": "detecção automática",
  "auto-scan": "detecção automática",
};

const REGION_LABELS = {
  products: "Setor PRODUTOS",
  studio: "Setor ESTÚDIO",
  chat: "Setor CHAT",
  activity: "Setor ATIVIDADE",
  analytics: "Setor ANÁLISE",
};

function row(label: string, ok: boolean, right: string): string {
  return `<div class="pnl-diag-row">
  <span>${label}</span>
  <span class="pnl-status ${ok ? "ok" : "off"}">${right}</span>
</div>`;
}

function renderMap(st: unknown): void {
  const box = document.getElementById("pnl-map");
  if (!box) return;

  const stObj = st as {
    targets?: Record<string, unknown>;
    regions?: Record<string, unknown>;
    analytics?: unknown;
  };
  const targets = stObj?.targets || {};
  const regions = stObj?.regions || {};
  const analytics = stObj?.analytics || null;

  const regionRows = Object.keys(REGION_LABELS)
    .map((k) => {
      const r = regions[k] as { found?: boolean; via?: string; score?: number } | undefined;
      const ok = !!r?.found;
      const via = ok ? (r.via === "manual" ? "apontado por você" : "detectado") : "não encontrado";
      const score = ok && typeof r.score === "number" ? ` · score ${r.score}` : "";
      return row(REGION_LABELS[k as keyof typeof REGION_LABELS], ok, `${via}${score}`);
    })
    .join("");

  const targetRows = Object.keys(MAP_LABELS)
    .map((k) => {
      const t = targets[k] as
        | { found?: boolean; via?: string; score?: number; evidence?: string; healthy?: boolean }
        | undefined;
      const ok = !!t?.found;
      const via = ok
        ? VIA_LABEL[t.via || ""] || t.via || "detectado"
        : "não encontrado — aponte na tela";
      const score = typeof t?.score === "number" && !t.evidence ? ` · score ${t.score}` : "";
      const warn = ok && t.healthy === false ? " · recuperando…" : "";
      const detail = ok && t.evidence ? ` · ${t.evidence}` : "";
      return row(
        MAP_LABELS[k as keyof typeof MAP_LABELS],
        ok,
        `${via}${ok ? score + detail : ""}${warn}`,
      );
    })
    .join("");

  const metrics =
    analytics && typeof analytics === "object" && Object.keys(analytics).length
      ? `<p class="pnl-sub" style="margin:10px 0 2px">Métricas da live</p>` +
        Object.entries(analytics as Record<string, string>)
          .map(([k, v]) => row(k, true, String(v)))
          .join("")
      : "";

  box.innerHTML =
    `<p class="pnl-sub" style="margin:0 0 2px">Setores da página</p>${regionRows}` +
    `<p class="pnl-sub" style="margin:10px 0 2px">Alvos dentro dos setores</p>${targetRows}` +
    metrics;
}

let salesState: string | null = null;

function pollMap(): void {
  try {
    (
      chrome.storage.local as {
        get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
      }
    ).get([MAP_STATUS_KEY, "pitchai.sales.state"], (r) => {
      salesState = (r?.["pitchai.sales.state"] as string | null) || null;
      renderMap(r?.[MAP_STATUS_KEY]);
    });
  } catch {
    // Ignora erros
  }
}

// ============================================================================
// Inicialização
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  cfg = await load();

  try {
    const verEl = document.querySelector(".pnl-ver");
    if (verEl) {
      verEl.textContent = "v" + (chrome.runtime.getManifest() as { version?: string }).version;
    }
  } catch {
    // Ignora erros
  }

  fillVoiceSelects();
  render();

  // Event listeners para configurações
  document.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
    const key = el.getAttribute("data-key");
    if (!key) return;

    if (el.classList.contains("pnl-toggle")) {
      el.addEventListener("click", () => {
        set(cfg, key, !get(cfg, key));
        save(cfg);
        el.classList.toggle("on");
      });
    } else if (el.tagName === "SELECT") {
      el.addEventListener("change", () => {
        const raw = (el as HTMLSelectElement).value;
        const num = Number(raw);
        set(cfg, key, raw !== "" && !Number.isNaN(num) ? num : raw);
        save(cfg);
      });
    } else if (el.tagName === "INPUT") {
      el.addEventListener("input", () => {
        const numeric =
          (el as HTMLInputElement).type === "number" || (el as HTMLInputElement).type === "range";
        const v = numeric ? +(el as HTMLInputElement).value : (el as HTMLInputElement).value;
        set(cfg, key, v);
        save(cfg);
      });
    }
  });

  // Event listeners para auto-fixar
  const autofixPick = document.getElementById("pnl-autofix-pick");
  autofixPick?.addEventListener("change", (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (!value) return;

    cfg.autoFixar ??= { ...DEFAULT_CONFIG.autoFixar };
    const prod = (cfg.produtos || []).find((p) => p.id === value || p.name === value);
    const name = prod?.name || value;
    cfg.autoFixar.query = name;

    if (prod?.id) {
      cfg.autoFixar.ids = [prod.id];
    }

    syncSelectedProductNames();
    save(cfg);

    const inp = document.querySelector<HTMLInputElement>('input[data-key="autoFixar.query"]');
    if (inp) inp.value = name;

    renderProducts();
    renderAutofixPicker();
  });

  // Botões de recarregar catálogo
  const autofixReload = document.getElementById("pnl-autofix-reload");
  autofixReload?.addEventListener("click", (e) => reloadCatalog(null));

  const autofixLoad = document.getElementById("pnl-autofix-load");
  autofixLoad?.addEventListener("click", (e) => reloadCatalog(e.currentTarget as HTMLElement));

  // Botões de demo
  document.querySelectorAll<HTMLElement>("[data-demo]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-demo");
      if (!action) return;

      sendDemoCommand(action);
      const hint = document.getElementById("pnl-demo-hint");
      if (hint) hint.textContent = `Enviando "${action}"…`;
    });
  });

  // Resposta real da barra do Pitch AI
  try {
    (
      chrome.storage as {
        onChanged?: {
          addListener?: (
            listener: (changes: Record<string, { newValue?: unknown }>) => void,
          ) => void;
        };
      }
    ).onChanged?.addListener?.((changes) => {
      const ack = changes["pitchai.demo.ack"]?.newValue as
        { ok?: boolean; message?: string } | undefined;
      const hint = document.getElementById("pnl-demo-hint");
      if (!ack || !hint) return;

      hint.textContent = `${ack.ok ? "✓" : "✗"} ${ack.message}`;
      hint.style.color = ack.ok ? "#00E676" : "#FF6B35";
    });
  } catch {
    // Ignora erros
  }

  // Event listeners para voz
  const voiceSelect = document.getElementById("pnl-voice");
  voiceSelect?.addEventListener("change", (e) => {
    cfg.voz.id = (e.target as HTMLSelectElement).value;
    save(cfg);
  });

  const speedInput = document.getElementById("pnl-speed");
  speedInput?.addEventListener("input", (e) => {
    cfg.voz.speed = +(e.target as HTMLInputElement).value;
    const speedVal = document.getElementById("pnl-speed-val");
    if (speedVal) speedVal.textContent = cfg.voz.speed.toFixed(2) + "x";
    save(cfg);
  });

  const gainInput = document.getElementById("pnl-gain");
  gainInput?.addEventListener("input", (e) => {
    cfg.voz.gain = +(e.target as HTMLInputElement).value;
    const gainVal = document.getElementById("pnl-gain-val");
    if (gainVal) gainVal.textContent = cfg.voz.gain.toFixed(2) + "x";
    save(cfg);
  });

  // Studio da live
  const srcCam = document.getElementById("pnl-src-cam");
  srcCam?.addEventListener("click", async () => {
    try {
      attach(
        await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 } },
          audio: true,
        }),
      );
      if (info) info.textContent = "Fonte: câmera";
    } catch {
      if (info) info.textContent = "Não foi possível acessar a câmera";
    }
  });

  const srcScreen = document.getElementById("pnl-src-screen");
  srcScreen?.addEventListener("click", async () => {
    try {
      attach(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }));
      if (info) info.textContent = "Fonte: tela compartilhada";
    } catch {
      if (info) info.textContent = "Compartilhamento cancelado";
    }
  });

  const srcFile = document.getElementById("pnl-src-file");
  srcFile?.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;

      stopTracks();
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      fileUrl = URL.createObjectURL(f);

      if (video) {
        video.srcObject = null;
        video.src = fileUrl;
        video.loop = true;
        video.muted = false;
      }

      if (info) info.textContent = "Arquivo: " + f.name;
    };
    input.click();
  });

  function startLive(): void {
    if (!video?.srcObject && !video?.src) {
      if (info) info.textContent = "Escolha primeiro a fonte de vídeo";
      return;
    }

    live = true;
    elapsed = 0;
    video.play().catch(() => {});

    clearInterval(tick as unknown as number);
    tick = setInterval(() => {
      elapsed++;
      if (timeEl) timeEl.textContent = fmt(elapsed);
      if (cfg.encerrarTempo?.enabled && elapsed >= (cfg.encerrarTempo.minutes || 1) * 60) {
        stopLive("timer");
      }
    }, 1000);

    if (info) info.textContent = "● AO VIVO";
  }

  function stopLive(reason?: string): void {
    live = false;
    clearInterval(tick as unknown as number);
    tick = null;
    if (video) video.pause();
    if (info) {
      info.textContent = reason === "timer" ? "Live encerrada pelo temporizador" : "Live encerrada";
    }
  }

  const liveStart = document.getElementById("pnl-live-start");
  liveStart?.addEventListener("click", () => startLive());

  const liveStop = document.getElementById("pnl-live-stop");
  liveStop?.addEventListener("click", () => stopLive());

  // Agendamento
  setInterval(() => {
    if (live || !cfg.agendar?.enabled || !cfg.agendar.at) {
      if (agendaInfo) agendaInfo.textContent = "";
      return;
    }

    const ts = new Date(cfg.agendar.at).getTime();
    if (!ts) return;

    const falta = Math.ceil((ts - Date.now()) / 1000);
    if (falta > 0) {
      if (agendaInfo) agendaInfo.textContent = `Começa em ${fmt(falta)}. Deixe o painel aberto.`;
    } else {
      if (agendaInfo) agendaInfo.textContent = "Iniciando…";
      startLive();
    }
  }, 1000);

  window.addEventListener("beforeunload", () => {
    stopTracks();
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  });

  // Contextos de voz
  document.querySelectorAll<HTMLSelectElement>("select[data-vc]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const k = sel.getAttribute("data-vc");
      if (!k) return;

      cfg.vozContextos = cfg.vozContextos || {};
      cfg.vozContextos[k as keyof typeof cfg.vozContextos] = sel.value
        ? { id: sel.value, speed: cfg.voz.speed || 1 }
        : null;
      save(cfg);
    });
  });

  const syncTextarea = (id: string, path: string): void => {
    const el = document.getElementById(id);
    el?.addEventListener("input", (e) => {
      set(cfg, path, parseLines((e.target as HTMLTextAreaElement).value));
      save(cfg);
    });
  };

  syncTextarea("pnl-blacklist", "filtros.blacklist");
  syncTextarea("pnl-whitelist", "filtros.whitelist");

  // Diagnóstico
  pollMap();
  setInterval(pollMap, 4000);

  const ackEl = document.getElementById("pnl-map-ack");

  function showAck(ack: { ok?: boolean; message?: string }): void {
    if (!ackEl || !ack) return;
    ackEl.textContent = ack.message || "";
    ackEl.style.color = ack.ok ? "#00E676" : "#FF6B35";
  }

  try {
    (
      chrome.storage.local as {
        get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
      }
    ).get(["pitchai.demo.ack"], (r) =>
      showAck((r?.["pitchai.demo.ack"] as { ok?: boolean; message?: string }) || {}),
    );

    (
      chrome.storage as {
        onChanged?: {
          addListener?: (
            listener: (changes: Record<string, { newValue?: unknown }>) => void,
          ) => void;
        };
      }
    ).onChanged?.addListener?.((changes) => {
      if (changes["pitchai.demo.ack"]) {
        showAck(
          (changes["pitchai.demo.ack"]?.newValue as { ok?: boolean; message?: string }) || {},
        );
      }
    });
  } catch {
    // Ignora erros
  }

  // Botões de comando
  document.querySelectorAll<HTMLElement>("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (ackEl) {
        ackEl.textContent = "Executando…";
        ackEl.style.color = "#9aa0b4";
      }
      const cmd = btn.getAttribute("data-cmd");
      if (cmd) {
        sendDemoCommand(cmd);
        setTimeout(pollMap, 1500);
      }
    });
  });

  const remapBtn = document.getElementById("pnl-remap");
  remapBtn?.addEventListener("click", () => {
    if (ackEl) {
      ackEl.textContent = "Remapeando…";
      ackEl.style.color = "#9aa0b4";
    }
    sendDemoCommand("remap");
    setTimeout(pollMap, 1500);
  });

  // Exportar / importar apontamentos
  const mapJson = document.getElementById("pnl-map-json") as HTMLTextAreaElement;
  const mapIo = document.getElementById("pnl-map-io");

  function setIo(msg: string, kind: "err" | "ok" | "info"): void {
    if (!mapIo) return;
    mapIo.textContent = msg;
    mapIo.style.color = kind === "err" ? "#FF6B35" : kind === "ok" ? "#00E676" : "#9aa0b4";
  }

  const exportBtn = document.getElementById("pnl-map-export");
  exportBtn?.addEventListener("click", () => {
    try {
      (
        chrome.storage.local as {
          get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
        }
      ).get([DM_MANUAL_KEY, RG_MANUAL_KEY, MAP_STATUS_KEY], (r) => {
        const dm = (r?.[DM_MANUAL_KEY] as { host?: string; sig?: unknown } | undefined) || {};
        const rg = (r?.[RG_MANUAL_KEY] as { host?: string; sig?: unknown } | undefined) || {};
        const payload = {
          version: 1,
          host: dm.host || rg.host || "shop.tiktok.com",
          exportedAt: Date.now(),
          targets: dm.sig || {},
          regions: rg.sig || {},
          status: r?.[MAP_STATUS_KEY] || {},
        };
        const text = JSON.stringify(payload, null, 2);

        if (mapJson) {
          mapJson.value = text;
          mapJson.select?.();
        }

        navigator.clipboard
          ?.writeText(text)
          .then(() => setIo("✓ copiado — é só colar no chat do Pitch AI", "ok"))
          .catch(() => setIo("gerado abaixo — copie manualmente", "ok"));
      });
    } catch {
      setIo("não consegui ler o mapeamento", "err");
    }
  });

  const importBtn = document.getElementById("pnl-map-import");
  importBtn?.addEventListener("click", () => {
    let data: unknown;
    try {
      data = JSON.parse(mapJson?.value || "");
    } catch {
      return setIo("JSON inválido", "err");
    }

    if (!data || typeof data !== "object") return setIo("formato não reconhecido", "err");
    const dataObj = data as Record<string, unknown>;
    if (dataObj.version !== 1) return setIo("formato não reconhecido (esperado version: 1)", "err");

    const host =
      typeof dataObj.host === "string" && dataObj.host ? dataObj.host : "shop.tiktok.com";
    const clean = (o: unknown): Record<string, unknown> =>
      o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};

    try {
      (
        chrome.storage.local as {
          set: (items: Record<string, unknown>, callback?: () => void) => void;
        }
      ).set(
        {
          [DM_MANUAL_KEY]: { host, sig: clean(dataObj.targets) },
          [RG_MANUAL_KEY]: { host, sig: clean(dataObj.regions) },
        },
        () => {
          const n =
            Object.keys(clean(dataObj.targets)).length + Object.keys(clean(dataObj.regions)).length;
          setIo(`✓ ${n} apontamento(s) importado(s) — reaplicando…`, "ok");
          setTimeout(pollMap, 2500);
        },
      );
    } catch {
      setIo("não consegui salvar", "err");
    }
  });

  // Adicionar produto
  const addBtn = document.getElementById("pnl-add");
  addBtn?.addEventListener("click", () => {
    cfg.produtos.push({
      id: crypto.randomUUID(),
      name: "Novo produto",
      description: "",
      price: "",
      active: cfg.produtos.length === 0,
    });
    save(cfg, { products: true });
    render();
  });

  // Abrir web
  const webBtn = document.getElementById("pnl-web");
  webBtn?.addEventListener("click", () => {
    window.open("https://pitchai-hm.vercel.app/app", "_blank");
  });

  // Sync token
  const tokenInput = document.getElementById("pnl-sync-token") as HTMLInputElement;
  const statusEl = document.getElementById("pnl-sync-status");
  const credsEl = document.getElementById("pnl-sync-state");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async function renderCreds(): Promise<void> {
    if (!credsEl) return;

    const t = (cfg.syncToken || "").trim();
    if (!t) {
      credsEl.textContent = "⚠ IA desligada — sem Sync token";
      credsEl.style.color = "#FF6B35";
      return;
    }

    if (!UUID_RE.test(t)) {
      credsEl.textContent = "⚠ token com formato inválido";
      credsEl.style.color = "#FF6B35";
      return;
    }

    credsEl.textContent = "Verificando token...";
    credsEl.style.color = "#A1A1AA";

    try {
      const headers = await signRequest(t, "verify");
      const res = await fetch(`${API_BASE}/api/public/live/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ token: t }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.valid && !data.locked) {
        const plan = (data.plan as string | undefined) || "free";
        const remainingChat = (data.remainingChat as number | undefined) ?? 0;
        const remainingTts = (data.remainingTts as number | undefined) ?? 0;

        credsEl.textContent = `✓ Plano ${plan.toUpperCase()} · Cota restante: ${remainingChat} msgs / ${remainingTts} voz`;
        credsEl.style.color = "#00E676";
      } else if (data.reason === "quota_exceeded") {
        const plan = (data.plan as string | undefined) || "free";
        const chatLimit = (data.chatLimit as number | undefined) ?? 0;
        credsEl.textContent = `🔒 Cota do plano '${plan}' esgotada (${data.remainingChat}/${chatLimit} msgs). Faça upgrade!`;
        credsEl.style.color = "#FF6B35";
      } else if (data.valid) {
        credsEl.textContent =
          (data as { message?: string }).message ||
          "Código válido, mas a licença está temporariamente bloqueada.";
        credsEl.style.color = "#FF6B35";
      } else {
        credsEl.textContent = `🔒 Token inválido ou revogado (${(data as { message?: string }).message || "Acesso negado"})`;
        credsEl.style.color = "#FF3B3B";
      }
    } catch {
      credsEl.textContent = "🔒 Licença não confirmada — conecte-se à internet para liberar";
      credsEl.style.color = "#FF3B3B";
    }
  }

  let verifyTimer: ReturnType<typeof setTimeout> | undefined;
  if (tokenInput) {
    tokenInput.value = cfg.syncToken || "";
    renderCreds();
    tokenInput.addEventListener("input", () => {
      cfg.syncToken = tokenInput.value.trim();
      save(cfg);
      if (verifyTimer) clearTimeout(verifyTimer);
      verifyTimer = setTimeout(renderCreds, 450);
    });
  }

  function setStatus(msg: string, kind: "err" | "ok" | "info"): void {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.color = kind === "err" ? "#FF3B3B" : kind === "ok" ? "#00E676" : "";
    if (msg) {
      setTimeout(() => {
        if (statusEl) statusEl.textContent = "";
      }, 3500);
    }
  }

  const pullBtn = document.getElementById("pnl-pull");
  pullBtn?.addEventListener("click", async () => {
    if (!cfg.syncToken) return setStatus("cole o token primeiro", "err");
    setStatus("puxando…", "info");

    try {
      const r = await fetch(`${API_BASE}/api/public/live/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", token: cfg.syncToken }),
      });

      const data = await r.json();
      if (!r.ok) return setStatus(data?.error || "falhou", "err");

      cfg = {
        ...DEFAULT_CONFIG,
        ...((data as { config?: Partial<Config> }).config || {}),
        syncToken: cfg.syncToken,
      };
      save(cfg);
      render();

      if (tokenInput) tokenInput.value = cfg.syncToken || "";
      setStatus("✓ config puxada", "ok");
    } catch {
      setStatus("erro de rede", "err");
    }
  });

  const pushBtn = document.getElementById("pnl-push");
  pushBtn?.addEventListener("click", async () => {
    if (!cfg.syncToken) return setStatus("cole o token primeiro", "err");
    setStatus("enviando…", "info");

    try {
      const { syncToken, ...toSend } = cfg;
      const r = await fetch(`${API_BASE}/api/public/live/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push", token: cfg.syncToken, config: toSend }),
      });

      const data = await r.json();
      if (!r.ok) return setStatus((data as { error?: string }).error || "falhou", "err");
      setStatus("✓ enviado", "ok");
    } catch {
      setStatus("erro de rede", "err");
    }
  });

  // Listener para mudanças na configuração
  try {
    (
      chrome.storage as {
        onChanged?: {
          addListener?: (
            listener: (changes: Record<string, { newValue?: unknown }>) => void,
          ) => void;
        };
      }
    ).onChanged?.addListener?.(async (changes) => {
      if (changes[KEY]?.newValue) {
        const previousToken = cfg.syncToken || "";
        cfg = parseConfig(await decryptConfigObj(changes[KEY].newValue));
        render();
        if (document.activeElement !== tokenInput) {
          if (tokenInput) tokenInput.value = cfg.syncToken || "";
        }
        if ((cfg.syncToken || "") !== previousToken) {
          if (verifyTimer) clearTimeout(verifyTimer);
          verifyTimer = setTimeout(renderCreds, 250);
        }
      }
    });
  } catch {
    // Ignora erros
  }
});

// Exporta para uso em outros módulos
export {
  cfg,
  load,
  save,
  sendDemoCommand,
  cleanupProducts,
  render,
  fillVoiceSelects,
  renderProducts,
  renderAutofixPicker,
  reloadCatalog,
  API_BASE,
  signRequest,
  encryptConfigObj,
  decryptConfigObj,
};

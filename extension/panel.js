(function () {
  const KEY = "pitchai.config.v1";
  const PENDING_SYNC_KEY = "pitchai.pendingSyncToken";
  const SYNC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function resolveApiBase() {
    if (window.location.origin && window.location.origin.includes("run.app")) {
      return window.location.origin;
    }
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return window.location.origin;
    }
    return "https://pitchai-hm.vercel.app";
  }
  const API_BASE = resolveApiBase();

  const TOKEN_STATUS_KEY = "pitchai.token.status";
  function saveTokenStatus(tokenRemaining, tokenLimit, plan) {
    try {
      chrome.storage.local.set({
        [TOKEN_STATUS_KEY]: {
          tokenRemaining: Number(tokenRemaining) || 0,
          tokenLimit: Number(tokenLimit) || 0,
          plan: plan || "free",
        },
      });
    } catch {}
  }
  // Estado do vínculo publicado por quem acabou de falar com o verify.
  const DEVICE_STATUS_KEY = "pitchai.device.status";

  function loadDeviceStatus() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([DEVICE_STATUS_KEY], (r) =>
          resolve(r?.[DEVICE_STATUS_KEY] || null),
        );
      } catch {
        resolve(null);
      }
    });
  }

  /** "19/08 às 14h32" — o vendedor precisa da hora exata, não de um "amanhã". */
  function momentoBR(iso) {
    if (!iso) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return at
      .toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
      .replace(", ", " às ")
      .replace(":", "h");
  }

  function renderDeviceBinding(st) {
    const stateEl = document.getElementById("pnl-device-state");
    const detailEl = document.getElementById("pnl-device-detail");
    const btn = document.getElementById("pnl-device-action");
    if (!stateEl || !detailEl || !btn) return;

    if (!st) {
      stateEl.textContent = "Verificando o vínculo...";
      detailEl.textContent = "Assim que a licença for confirmada, o estado aparece aqui.";
      btn.hidden = true;
      return;
    }

    if (st.vinculo === "esta") {
      // "observar" e "off" não barram ninguém. Dizer só "vinculado" prometeria
      // uma trava que não está valendo.
      const so =
        st.modo && st.modo !== "exigir" ? ` (modo ${st.modo}: ninguém é barrado ainda)` : "";
      stateEl.textContent = `✅ Vinculado a este navegador${so}`;
      const desde = momentoBR(st.boundAt);
      detailEl.textContent = desde
        ? `A licença está ativa aqui desde ${desde}. Para usar em outro navegador, desvincule na sua conta — uma vez por dia.`
        : "A licença está ativa neste navegador. Para usar em outro, desvincule na sua conta — uma vez por dia.";
      btn.hidden = false;
      btn.classList.remove("danger");
      btn.textContent = "Desvincular ↗";
      return;
    }

    if (st.vinculo === "outra") {
      stateEl.textContent = "⛔ Vinculado a outro navegador";
      // A mensagem do servidor já traz a hora da próxima liberação e trata o
      // caso da reinstalação; texto nosso aqui inventaria data.
      detailEl.textContent = st.message || "Esta licença já está ativa em outro navegador.";
      btn.hidden = false;
      btn.classList.add("danger");
      btn.textContent = st.canReleaseAt
        ? `Liberar em ${momentoBR(st.canReleaseAt)}`
        : "Desvincular navegador ↗";
      return;
    }

    if (st.vinculo === "desconhecido") {
      // A licença não foi confirmada. Afirmar "nenhum navegador vinculado" seria
      // inventar: o servidor não respondeu sobre o vínculo.
      stateEl.textContent = "Vínculo não confirmado";
      detailEl.textContent =
        st.motivoTexto || "Não foi possível determinar o vínculo desta instalação.";
      btn.hidden = true;
      return;
    }

    stateEl.textContent = "Nenhum navegador vinculado";
    detailEl.textContent =
      "O primeiro navegador que abrir a extensão com o seu código passa a ser o vinculado.";
    btn.hidden = true;
  }

  function loadTokenStatus() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([TOKEN_STATUS_KEY], (r) => resolve(r?.[TOKEN_STATUS_KEY] || null));
      } catch {
        resolve(null);
      }
    });
  }

  // ---------- Identidade da instalação (1 extensão por conta) ----------
  // O painel LÊ este id, NUNCA o cria. Desde a v0.19 o único criador é o
  // service worker; isso também funciona antes de abrir uma página do TikTok.
  const INSTALL_ID_KEY = "pitchai_install_id";
  let installIdCache = "";

  async function readInstallId() {
    // O achado fica em cache; a AUSÊNCIA não. O painel costuma abrir antes de o
    // content script ter criado o id, e guardar o vazio o deixaria sem cabeçalho
    // pelo resto da sessão.
    if (installIdCache) return installIdCache;
    try {
      const resposta = await chrome.runtime.sendMessage({ type: "PITCHAI_GET_INSTALL_ID" });
      const id = String(resposta?.installId || "").toLowerCase();
      if (SYNC_UUID_RE.test(id)) {
        installIdCache = id;
        return installIdCache;
      }
    } catch {}
    const stored = await new Promise((resolve) => {
      try {
        chrome.storage.local.get([INSTALL_ID_KEY], (res) => resolve(res?.[INSTALL_ID_KEY]));
      } catch {
        resolve(null);
      }
    });
    if (typeof stored === "string" && SYNC_UUID_RE.test(stored)) {
      installIdCache = stored.toLowerCase();
    }
    return installIdCache;
  }

  async function installHeaders() {
    try {
      const id = await readInstallId();
      return id ? { "X-PitchAI-Install": id } : {};
    } catch {
      return {};
    }
  }

  async function publishDeviceBindingFromVerify(data) {
    const installId = await readInstallId();
    const conhecido = data?.deviceKnown === true;
    const mismatch = data?.reason === "device_mismatch";
    const vinculo = mismatch
      ? "outra"
      : conhecido && data?.deviceIsThis === true
        ? "esta"
        : conhecido
          ? "nenhuma"
          : "desconhecido";
    try {
      await chrome.storage.local.set({
        [DEVICE_STATUS_KEY]: {
          installId,
          vinculo,
          motivo: data?.reason || "",
          motivoTexto: data?.message || "O servidor não informou o vínculo desta instalação.",
          modo: data?.deviceBindingMode || "",
          boundAt: data?.boundAt || null,
          canReleaseAt: data?.canReleaseAt || null,
          message: mismatch ? data?.message || "" : "",
          at: Date.now(),
        },
      });
    } catch {}
  }

  async function signRequest(token, endpoint) {
    // Acompanha a chamada, mas fica FORA da assinatura.
    const install = await installHeaders();
    if (!token) return install;
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
      const sigBuf = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(`${ts}:${nonce}:${endpoint}`),
      );
      const sigHex = Array.from(new Uint8Array(sigBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return {
        ...install,
        "X-PitchAI-Signature": sigHex,
        "X-PitchAI-Timestamp": ts,
        "X-PitchAI-Nonce": nonce,
        "X-PitchAI-Token": token,
        Authorization: `Bearer ${token}`,
      };
    } catch {
      return { ...install, Authorization: `Bearer ${token}` };
    }
  }

  // Criptografia de armazenamento seguro (AES-GCM 256-bit).
  // Salt persistido por instalação + PBKDF2 600_000 iterações (OWASP 2023).
  const CRYPTO_SALT_STORAGE_KEY = "_crypto_salt_v2";
  const PBKDF2_ITERATIONS = 600000;

  async function getOrCreateSalt() {
    const stored = await new Promise((resolve) => {
      try {
        chrome.storage.local.get([CRYPTO_SALT_STORAGE_KEY], (res) =>
          resolve(res && res[CRYPTO_SALT_STORAGE_KEY]),
        );
      } catch {
        resolve(null);
      }
    });
    if (stored && typeof stored === "string") {
      const bytes = new Uint8Array((stored.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)));
      if (bytes.length === 16) return bytes;
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(salt)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      chrome.storage.local.set({ [CRYPTO_SALT_STORAGE_KEY]: hex });
    } catch {}
    return salt;
  }

  // PBKDF2 com 600k iterações custa ~300ms. Sem cache, cada save fazia duas
  // derivações (ler + gravar) e o clique no toggle parecia travado.
  const cryptoKeyCache = new Map();

  function getStorageKey(seed) {
    const extensionId = chrome.runtime?.id || "pitchai";
    const keySeed = seed || `pitchai-extension:${extensionId}`;
    const cached = cryptoKeyCache.get(keySeed);
    if (cached) return cached;
    const pending = (async () => {
      try {
        const enc = new TextEncoder();
        const salt = await getOrCreateSalt();
        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          enc.encode(keySeed),
          { name: "PBKDF2" },
          false,
          ["deriveKey"],
        );
        return await crypto.subtle.deriveKey(
          { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        );
      } catch {
        return null;
      }
    })();
    cryptoKeyCache.set(keySeed, pending);
    // Não guarda falha no cache: se a derivação falhou, tenta de novo depois.
    pending.then((k) => {
      if (!k) cryptoKeyCache.delete(keySeed);
    });
    return pending;
  }

  async function encryptConfigObj(obj) {
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

  async function decryptConfigObj(data) {
    if (!data || typeof data !== "object" || !data.__enc || !data.__iv) return data;
    const extensionId = chrome.runtime?.id || "pitchai";
    const seeds = [
      `pitchai-extension:${extensionId}`,
      window.location?.origin,
      `chrome-extension://${extensionId}`,
      "https://shop.tiktok.com",
    ].filter((seed, index, all) => seed && all.indexOf(seed) === index);
    for (let index = 0; index < seeds.length; index += 1) {
      try {
        const cryptoKey = await getStorageKey(seeds[index]);
        if (!cryptoKey) continue;
        const iv = new Uint8Array(data.__iv.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
        const encBuf = new Uint8Array(data.__enc.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
        const decBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encBuf);
        const decoded = JSON.parse(new TextDecoder().decode(decBuf));
        if (index > 0) {
          const migrated = await encryptConfigObj(decoded);
          chrome.storage.local.set({ [KEY]: migrated });
        }
        return decoded;
      } catch {}
    }
    return {};
  }
  const VOICES = [
    ["nova", "Nova · Feminina jovem"],
    ["shimmer", "Shimmer · Feminina calorosa"],
    ["coral", "Coral · Feminina expressiva"],
    ["alloy", "Alloy · Neutra"],
    ["echo", "Echo · Masculina séria"],
    ["onyx", "Onyx · Masculina grave"],
    ["fable", "Fable · Narrador britânico"],
    ["sage", "Sage · Neutra tranquila"],
  ];
  const DEFAULTS = {
    iaLigada: true,
    respostasIA: true,
    responderNoChat: false,
    respostasIntervaloSec: 8,
    revisarAntesDeEnviar: false,
    pitchBank: {
      enabled: true,
      variants: 12,
      ttlMinutes: 60,
      minIntervalSec: 45,
      maxIntervalSec: 75,
      cacheReplies: true,
    },
    protecaoGeral: false,
    violacao: true,
    autoMod: true,
    notificacoesVenda: true,
    saudacoes: { enabled: true, minIntervalSec: 60 },
    cta: { enabled: true },
    autoFixar: { enabled: false, query: "", minSec: 20, maxSec: 60, ids: [], names: [] },
    encerrarTempo: { enabled: false, minutes: 120 },
    agendar: { enabled: false, at: "" },
    voz: {
      id: "nova",
      speed: 1.0,
      gain: 1.0,
      monitor: { enabled: false, volume: 0.6 },
      pushToTalk: { enabled: false, key: "Space" },
    },

    // Som do vídeo da fonte virtual. `level` é fração (o motor trabalha em
    // 0..1); a tela mostra porcentagem porque "12%" é o que o vendedor entende.
    midia: { videoMuted: false, duckIA: { enabled: true, level: 0.12 } },

    vozContextos: { default: null, greeting: null, offer: null, farewell: null },
    // usarListaPadrao começa LIGADO: a live nasce protegida sem o vendedor
    // precisar digitar palavrão por palavrão (lista em blocklist.js).
    filtros: { blacklist: [], whitelist: [], usarListaPadrao: true },
    produtos: [],
    demo: { enabled: false, velocidade: 1, comChat: true, comVendas: true, comViolacao: false },
    syncToken: "",
  };

  const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const set = (obj, path, val) => {
    const parts = path.split(".");
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] ??= {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  };

  function normalizeConfig(raw) {
    const stored = raw || {};
    return {
      ...DEFAULTS,
      ...stored,
      autoFixar: { ...DEFAULTS.autoFixar, ...(stored.autoFixar || {}) },
      voz: {
        ...DEFAULTS.voz,
        ...(stored.voz || {}),
        monitor: { ...DEFAULTS.voz.monitor, ...(stored.voz?.monitor || {}) },
        pushToTalk: { ...DEFAULTS.voz.pushToTalk, ...(stored.voz?.pushToTalk || {}) },
      },
      midia: {
        ...DEFAULTS.midia,
        ...(stored.midia || {}),
        // Config antiga (sem a chave) nasce com o abaixamento ligado.
        duckIA: { ...DEFAULTS.midia.duckIA, ...(stored.midia?.duckIA || {}) },
      },
      vozContextos: { ...DEFAULTS.vozContextos, ...(stored.vozContextos || {}) },
      filtros: {
        ...DEFAULTS.filtros,
        ...(stored.filtros || {}),
        blacklist: Array.isArray(stored.filtros?.blacklist) ? stored.filtros.blacklist : [],
        whitelist: Array.isArray(stored.filtros?.whitelist) ? stored.filtros.whitelist : [],
        // Só fica desligada se o usuário desligou de propósito; config antiga
        // (sem a chave) continua protegida.
        usarListaPadrao: stored.filtros?.usarListaPadrao !== false,
      },
      demo: { ...DEFAULTS.demo, ...(stored.demo || {}) },
      produtos: Array.isArray(stored.produtos) ? stored.produtos : [],
    };
  }

  async function load() {
    return new Promise((res) =>
      chrome.storage.local.get([KEY], async (r) => {
        const dec = await decryptConfigObj(r[KEY]);
        res(normalizeConfig(dec));
      }),
    );
  }
  /**
   * Gravação incremental de verdade.
   *
   * Antes o save regravava a config INTEIRA que o painel tinha em memória
   * (`{ ...stored, ...cfg }`). Se a barra da live tivesse acabado de mudar algo
   * — o botão Proteção, por exemplo — o próximo save do painel revertia a
   * mudança. Agora só os caminhos que o painel mexeu (`"voz.speed"`,
   * `"filtros.blacklist"`, `"produtos"`…) são aplicados por cima do que está
   * no storage naquele instante.
   *
   * @param {string|string[]} paths caminho(s) alterado(s) pelo painel
   */
  const pendingSave = new Map();
  let saveTimer = null;
  // Última config que o próprio painel gravou. O eco desse save volta pelo
  // onChanged; comparar o conteúdo (em vez de usar uma janela de tempo) evita
  // re-renderizar por cima do que o usuário está digitando sem perder uma
  // mudança que a barra faça logo em seguida.
  let lastSelfPayload = "";

  const cloneValue = (v) => (v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);

  function save(paths) {
    // Compat: alguma chamada antiga no formato save(cfg) grava tudo.
    if (paths && typeof paths === "object" && !Array.isArray(paths)) return saveAll();
    const list = Array.isArray(paths) ? paths : [paths];
    // O valor é capturado AGORA (e não no flush) para não perder o que o
    // usuário digitou caso a barra grave algo no meio do caminho.
    list.forEach((p) => {
      if (typeof p === "string" && p) pendingSave.set(p, cloneValue(get(cfg, p)));
    });
    if (!pendingSave.size) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 120);
  }

  async function flushSave() {
    if (!pendingSave.size) return;
    const patch = Array.from(pendingSave.entries());
    pendingSave.clear();
    const r = await new Promise((res) => chrome.storage.local.get([KEY], res));
    const stored = normalizeConfig(await decryptConfigObj(r[KEY]));
    patch.forEach(([path, value]) => {
      if (value !== undefined) set(stored, path, value);
    });
    await writeConfig(stored);
  }

  /** Grava a config inteira. Só para o "⬇ Sincronizar", que troca tudo mesmo. */
  async function saveAll() {
    clearTimeout(saveTimer);
    pendingSave.clear();
    await writeConfig(normalizeConfig(cfg));
  }

  async function writeConfig(obj) {
    lastSelfPayload = JSON.stringify(obj);
    const enc = await encryptConfigObj(obj);
    chrome.storage.local.set({ [KEY]: enc });
  }

  const BAD_PRODUCT_RX =
    /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live|^(?:carrinho|adicionado ao carrinho|cliques?|fixar|desafixar|editar|excluir|remover)(?:\s*\d+)?$)/i;
  function productKey(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  // Quantos produtos a última limpeza descartou só por causa do nome curto.
  // O usuário precisa saber disso: sem o aviso o item "some" da lista sem motivo.
  let shortNameDrops = 0;

  function cleanupProducts() {
    const before = cfg.produtos?.length || 0;
    const seen = new Set();
    let curtos = 0;
    cfg.produtos = (cfg.produtos || []).filter((p) => {
      const key = productKey(p.name);
      if (BAD_PRODUCT_RX.test(p.name || "")) return false;
      // O auto-fixar acha o produto pesquisando pelo nome na vitrine do TikTok;
      // com menos de 4 letras a busca casa com qualquer coisa.
      if (!key || key.length < 4) {
        if (String(p?.name || "").trim()) curtos += 1;
        return false;
      }
      if (p.demo && !cfg.demo?.enabled) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    shortNameDrops = curtos;
    if (!cfg.produtos.some((p) => p.active) && cfg.produtos[0]) cfg.produtos[0].active = true;
    if (cfg.produtos.length !== before) save("produtos");
  }
  function sendDemoCommand(action) {
    const ts = Date.now();
    chrome.storage.local.set({ "pitchai.demo.cmd": { action, ts } });
    return ts;
  }

  let cfg;

  function fillVoiceSelects() {
    document.querySelectorAll("select[data-vc]").forEach((sel) => {
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

  // ---------- Lista padrão de palavras bloqueadas (blocklist.js) ----------
  const BLOCKLIST = typeof window !== "undefined" ? window.PitchAIBlocklist : null;
  const CAT_LABELS = {
    palavroes: "Palavrões e ofensas",
    odio: "Discurso de ódio",
    sexual: "Conteúdo sexual",
    risco_tiktok: "Risco de punição no TikTok",
  };

  /** Termos da lista padrão, sem duplicar (as categorias podem se repetir). */
  function defaultTerms() {
    const todas = BLOCKLIST?.TODAS;
    return Array.isArray(todas) ? Array.from(new Set(todas)) : [];
  }

  /** Resumo por categoria + lista completa em modo leitura. */
  function renderBlocklistInfo() {
    const totalEl = document.getElementById("pnl-bl-total");
    const catsEl = document.getElementById("pnl-bl-cats");
    const fullEl = document.getElementById("pnl-bl-full");
    if (!catsEl && !totalEl && !fullEl) return;

    const categorias = BLOCKLIST?.CATEGORIAS || {};
    const nomes = Object.keys(categorias);

    if (totalEl) totalEl.textContent = String(defaultTerms().length);

    if (catsEl) {
      catsEl.innerHTML = "";
      nomes.forEach((k) => {
        const box = document.createElement("div");
        box.className = "pnl-bl-cat";
        const label = document.createElement("span");
        label.textContent = CAT_LABELS[k] || k;
        const count = document.createElement("b");
        count.textContent = `${(categorias[k] || []).length} termos`;
        box.append(label, count);
        catsEl.appendChild(box);
      });
      if (!nomes.length) {
        const warn = document.createElement("p");
        warn.className = "pnl-sub";
        warn.textContent = "Não consegui carregar a lista padrão (blocklist.js).";
        catsEl.appendChild(warn);
      }
    }

    if (fullEl && !fullEl.dataset.filled) {
      fullEl.innerHTML = "";
      nomes.forEach((k) => {
        const group = document.createElement("div");
        group.className = "pnl-bl-group";
        const title = document.createElement("h4");
        title.textContent = `${CAT_LABELS[k] || k} · ${(categorias[k] || []).length}`;
        const terms = document.createElement("div");
        terms.className = "pnl-bl-terms";
        (categorias[k] || []).forEach((t) => {
          const chip = document.createElement("span");
          chip.className = "pnl-bl-term";
          chip.textContent = t;
          terms.appendChild(chip);
        });
        group.append(title, terms);
        fullEl.appendChild(group);
      });
      if (nomes.length) fullEl.dataset.filled = "1";
    }
  }

  // ---------- Som do vídeo da fonte virtual ----------
  // O motor (media-injector.js) fala em fração de volume: 1 = 100%, 0.12 = 12%.
  const DUCK_LEVEL_PADRAO = 0.12;
  const duckPct = () => {
    const n = Number(cfg?.midia?.duckIA?.level);
    const fracao = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DUCK_LEVEL_PADRAO;
    return Math.round(fracao * 100);
  };
  const midiaCfg = () => {
    cfg.midia = { ...DEFAULTS.midia, ...(cfg.midia || {}) };
    cfg.midia.duckIA = { ...DEFAULTS.midia.duckIA, ...(cfg.midia.duckIA || {}) };
    return cfg.midia;
  };

  /** Espelha na tela o mute e o abaixamento guardados na config. */
  function renderMediaAudio() {
    const muted = !!cfg?.midia?.videoMuted;
    const btn = document.getElementById("pnl-media-mute");
    if (btn) {
      btn.textContent = muted ? "🔇 Som do vídeo mudo" : "🔊 Som do vídeo ligado";
      btn.classList.toggle("danger", muted);
      btn.setAttribute("aria-pressed", muted ? "true" : "false");
    }
    const duckOn = cfg?.midia?.duckIA?.enabled !== false;
    document.getElementById("pnl-media-duck")?.classList.toggle("on", duckOn);
    const range = document.getElementById("pnl-media-duck-level");
    const nivel = duckPct();
    if (range) {
      // Não puxa o cursor de volta enquanto o vendedor está arrastando.
      if (document.activeElement !== range) range.value = String(nivel);
      range.disabled = !duckOn;
    }
    const val = document.getElementById("pnl-media-duck-val");
    if (val) val.textContent = `${nivel}%`;
    const wrap = document.getElementById("pnl-media-duck-wrap");
    if (wrap) wrap.style.opacity = duckOn ? "" : "0.45";
  }

  function render() {
    cleanupProducts();
    document.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      const val = get(cfg, key);
      if (el.classList.contains("pnl-toggle")) el.classList.toggle("on", !!val);
      else if (el.type === "checkbox") el.checked = !!val;
      else el.value = val ?? "";
    });
    document.getElementById("pnl-voice").value = cfg.voz.id;
    document.getElementById("pnl-speed").value = cfg.voz.speed;
    document.getElementById("pnl-speed-val").textContent = Number(cfg.voz.speed).toFixed(2) + "x";
    document.getElementById("pnl-gain").value = cfg.voz.gain ?? 1;
    document.getElementById("pnl-gain-val").textContent =
      Number(cfg.voz.gain ?? 1).toFixed(2) + "x";

    document.getElementById("pnl-blacklist").value = (cfg.filtros?.blacklist || []).join("\n");
    document.getElementById("pnl-whitelist").value = (cfg.filtros?.whitelist || []).join("\n");

    document.querySelectorAll("select[data-vc]").forEach((sel) => {
      const k = sel.getAttribute("data-vc");
      const v = cfg.vozContextos?.[k];
      sel.value = v?.id || "";
    });

    renderBlocklistInfo();
    renderMediaAudio();
    renderProducts();
    renderAutofixPicker();
  }

  function produtosSelecionados() {
    const ids = Array.isArray(cfg.autoFixar?.ids) ? cfg.autoFixar.ids : [];
    return (cfg.produtos || []).filter((p) => ids.includes(p.id));
  }
  function syncSelectedProductNames() {
    cfg.autoFixar ??= { ...DEFAULTS.autoFixar };
    cfg.autoFixar.names = produtosSelecionados().map((p) => p.name);
  }

  /**
   * Produtos que podem ir para o <select> do auto-fixar: o TikTok só encontra o
   * produto pelo nome, então nomes com menos de 4 letras são inúteis na busca.
   * Isso NÃO quer dizer que não há produtos — a lista completa continua válida.
   */
  function pickableProducts() {
    return (cfg.produtos || []).filter((p) => p?.name && productKey(p.name).length >= 4);
  }

  // Timer que devolve o hint ao resumo real depois de uma mensagem temporária
  // ("✓ vitrine atualizada…"). Fica no escopo do módulo porque o auto-scrape do
  // boot chama reloadCatalog antes do corpo do DOMContentLoaded terminar.
  let hintTimer = null;

  /**
   * O hint precisa refletir `cfg.produtos` (a mesma fonte da lista de produtos).
   * Antes ele saía do filtro de nome curto e do `return` antecipado quando o
   * <select> não existia no HTML — por isso o painel dizia "nenhum produto lido"
   * com a lista cheia logo abaixo.
   */
  function renderAutofixHint() {
    const hint = document.getElementById("pnl-autofix-hint");
    if (!hint) return;
    const total = (cfg.produtos || []).length;
    const noRodizio = produtosSelecionados();
    // Descartados na limpeza + os que ainda estão na lista mas o TikTok não acha.
    const curtos = shortNameDrops + (total - pickableProducts().length);
    const avisoCurtos = curtos
      ? ` ${curtos} item(ns) com nome curto demais para o TikTok localizar foram deixados de fora — o nome precisa de pelo menos 4 letras.`
      : "";

    if (!total) {
      hint.textContent =
        "Nenhum produto lido ainda. Abra a live e toque em 🔄 para ler a vitrine." + avisoCurtos;
      return;
    }
    const msg = noRodizio.length
      ? `${total} produto(s) na vitrine · rodízio com ${noRodizio.length}: ${noRodizio
          .map((p) => p.name)
          .join(", ")}`
      : `${total} produto(s) na vitrine. Nenhum marcado no rodízio — a IA vai alternar todos.`;
    hint.textContent = msg + avisoCurtos;
  }

  function renderAutofixPicker() {
    renderAutofixHint();
    const sel = document.getElementById("pnl-autofix-pick");
    if (!sel) return;
    const list = pickableProducts();
    const current = cfg.autoFixar?.query || "";
    sel.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = list.length
      ? "— escolher produto —"
      : (cfg.produtos || []).length
        ? "— nenhum produto com nome pesquisável —"
        : "— nenhum produto lido ainda —";
    sel.appendChild(none);
    list.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id || p.name;
      o.textContent = p.price ? `${p.name} · ${p.price}` : p.name;
      sel.appendChild(o);
    });
    const currentProduct = list.find(
      (p) => p.name === current || p.id === current || cfg.autoFixar?.ids?.includes(p.id),
    );
    sel.value = currentProduct?.id || "";
  }

  function renderProducts() {
    const box = document.getElementById("pnl-products");
    box.innerHTML = "";
    if (!cfg.produtos.length) {
      const empty = document.createElement("div");
      empty.className = "pnl-empty";
      empty.innerHTML =
        '<div class="pnl-empty-icon">🛍️</div>' +
        "<strong>Nenhum produto lido ainda</strong>" +
        "<span>Abra sua LIVE no TikTok Shop e clique em <b>“Atualizar Vitrine Agora”</b> acima. " +
        "Os produtos aparecem aqui automaticamente. Você também pode adicionar um manualmente.</span>";
      box.appendChild(empty);
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
      pick.checked = cfg.autoFixar.ids.includes(prod.id);
      pick.onchange = () => {
        const ids = new Set(cfg.autoFixar.ids);
        if (pick.checked) ids.add(prod.id);
        else ids.delete(prod.id);
        cfg.autoFixar.ids = Array.from(ids);
        syncSelectedProductNames();
        save(["autoFixar.ids", "autoFixar.names"]);
        renderAutofixPicker();
      };
      const txt = document.createElement("span");
      txt.textContent = "fixar";
      wrap.append(pick, txt);
      const input = document.createElement("input");
      input.type = "text";
      input.value = prod.name;
      input.oninput = () => {
        cfg.produtos[i].name = input.value;
        syncSelectedProductNames();
        save(["produtos", "autoFixar.names"]);
        renderAutofixHint();
      };
      const del = document.createElement("button");
      del.className = "pnl-btn ghost";
      del.textContent = "✕";
      del.onclick = () => {
        cfg.autoFixar.ids = cfg.autoFixar.ids.filter((id) => id !== prod.id);
        cfg.produtos.splice(i, 1);
        syncSelectedProductNames();
        save(["produtos", "autoFixar.ids", "autoFixar.names"]);
        render();
      };
      row.append(wrap, input, del);
      box.appendChild(row);
    });
  }

  function parseLines(t) {
    return String(t || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    cfg = await load();
    const pendingToken = await new Promise((resolve) => {
      try {
        chrome.storage.local.get([PENDING_SYNC_KEY], (result) =>
          resolve(result?.[PENDING_SYNC_KEY] || ""),
        );
      } catch {
        resolve("");
      }
    });
    if (SYNC_UUID_RE.test(String(pendingToken))) {
      cfg.syncToken = String(pendingToken);
      const encrypted = await encryptConfigObj(cfg);
      await chrome.storage.local.set({ [KEY]: encrypted });
      await chrome.storage.local.remove(PENDING_SYNC_KEY);
    }
    try {
      const verEl = document.querySelector(".pnl-ver");
      if (verEl) verEl.textContent = "v" + chrome.runtime.getManifest().version;
    } catch {}
    fillVoiceSelects();
    render();

    // ---------- Troca de abas ----------
    // Antes as abas não trocavam (não havia handler). Agora troca ao clicar.
    document.querySelectorAll(".pnl-tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = btn.getAttribute("data-tab");
        if (!target) return;
        document
          .querySelectorAll(".pnl-tab-btn")
          .forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".pnl-tab-content").forEach((c) => {
          c.classList.toggle("active", c.id === target);
        });
        //fecha o submenu "Mais" se estiver aberto
        const more = document.querySelector(".pnl-more-menu");
        if (more) more.open = false;
        if (e) e.stopPropagation();
      });
    });
    // fecha o "Mais" ao clicar fora dele
    const moreMenu = document.querySelector(".pnl-more-menu");
    moreMenu?.addEventListener("toggle", () => {
      if (!moreMenu.open) return;
      const summary = moreMenu.querySelector("summary");
      const menu = moreMenu.querySelector(".pnl-more-items");
      const rect = summary?.getBoundingClientRect?.();
      if (menu && rect) {
        menu.style.top = `${Math.round(rect.bottom + 4)}px`;
        menu.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`;
      }
    });
    document.addEventListener("click", (e) => {
      const more = document.querySelector(".pnl-more-menu");
      if (!more || !more.open) return;
      if (e.target instanceof Node && more.contains(e.target)) return;
      more.open = false;
    });

    // ---------- Auto-scrape no boot ----------
    // Puxa a vitrine automaticamente quando o painel abre, sem o usuário precisar clicar.
    // Só dispara se já não houver produtos (evita re-raspagem desnecessária).
    // Sem `await`: a leitura pode levar até 9s e antes disso o painel inteiro
    // ficava sem responder aos cliques (os listeners abaixo ainda não existiam).
    if (!cfg.produtos || cfg.produtos.length === 0) {
      const hint = document.getElementById("pnl-autofix-hint");
      if (hint) hint.textContent = "Lendo vitrine…";
      Promise.resolve()
        .then(() => reloadCatalog(null))
        .catch(() => {});
    }

    document.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      if (el.classList.contains("pnl-toggle")) {
        el.addEventListener("click", () => {
          set(cfg, key, !get(cfg, key));
          save(key);
          el.classList.toggle("on");
        });
      } else if (el.tagName === "SELECT") {
        el.addEventListener("change", () => {
          const raw = el.value;
          const num = Number(raw);
          set(cfg, key, raw !== "" && !Number.isNaN(num) ? num : raw);
          save(key);
        });
      } else if (el.tagName === "INPUT") {
        el.addEventListener("input", () => {
          const numeric = el.type === "number" || el.type === "range";
          const v = numeric ? +el.value : el.value;
          set(cfg, key, v);
          save(key);
        });
      }
    });

    document.getElementById("pnl-autofix-pick")?.addEventListener("change", (e) => {
      const value = e.target.value;
      if (!value) return;
      cfg.autoFixar ??= { ...DEFAULTS.autoFixar };
      const prod = (cfg.produtos || []).find((p) => p.id === value || p.name === value);
      const name = prod?.name || value;
      cfg.autoFixar.query = name;
      if (prod?.id) {
        cfg.autoFixar.ids = [prod.id];
      }
      syncSelectedProductNames();
      save(["autoFixar.query", "autoFixar.ids", "autoFixar.names"]);
      const inp = document.querySelector('input[data-key="autoFixar.query"]');
      if (inp) inp.value = name;
      renderProducts();
      renderAutofixPicker();
    });
    /**
     * Espera a barra da live gravar a vitrine.
     *
     * O listener antigo lia `changes[KEY].newValue` cru — que é o blob
     * criptografado `{__enc,__iv}`. `normalizeConfig` desse blob devolvia a
     * config toda vazia (produtos: []), e depois de 1,2s isso era aceito como
     * resultado: o painel perdia produtos e token da memória e escrevia
     * "Nenhum produto encontrado" mesmo com a vitrine cheia no storage.
     * Agora sempre descriptografamos antes de olhar.
     */
    function waitForCatalogUpdate(beforeCount) {
      return new Promise((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (updated) => {
          if (done) return;
          done = true;
          clearInterval(poll);
          try {
            chrome.storage.onChanged.removeListener(listener);
          } catch {}
          resolve(updated || null);
        };
        const listener = async (changes) => {
          if (done || !changes[KEY]?.newValue) return;
          const normalized = normalizeConfig(await decryptConfigObj(changes[KEY].newValue));
          if ((normalized.produtos || []).length > beforeCount || Date.now() - start > 1200) {
            finish(normalized);
          }
        };
        try {
          chrome.storage.onChanged.addListener(listener);
        } catch {}
        const poll = setInterval(async () => {
          const current = await load();
          if ((current.produtos || []).length > beforeCount || Date.now() - start > 9000) {
            finish(current);
          }
        }, 500);
      });
    }

    async function reloadCatalog(btn) {
      const hint = document.getElementById("pnl-autofix-hint");
      const before = (cfg.produtos || []).length;
      const label = btn?.textContent;
      clearTimeout(hintTimer);
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Lendo vitrine…";
      }
      if (hint) hint.textContent = "Lendo vitrine…";
      const commandTs = sendDemoCommand("catalogo");
      const updated = await waitForCatalogUpdate(before, commandTs);
      cfg = updated || (await load());
      render();
      const after = (cfg.produtos || []).length;
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
      if (hint) {
        // "Nenhum produto" só quando cfg.produtos está realmente vazio; o
        // timeout da leitura não apaga o que já estava salvo.
        if (!after) {
          hint.textContent = "Nenhum produto encontrado — abra a página da live e tente de novo.";
        } else if (after > before) {
          hint.textContent = `✓ ${after} produto(s) na vitrine (+${after - before} novo(s)).`;
        } else {
          hint.textContent = `✓ vitrine atualizada — ${after} produto(s).`;
        }
        // Depois de 6s volta para o resumo real (rodízio, nomes curtos etc.).
        clearTimeout(hintTimer);
        hintTimer = setTimeout(renderAutofixHint, 6000);
      }
    }
    document
      .getElementById("pnl-autofix-reload")
      ?.addEventListener("click", (e) => reloadCatalog(null));
    document
      .getElementById("pnl-autofix-load")
      ?.addEventListener("click", (e) => reloadCatalog(e.currentTarget));

    document.querySelectorAll("[data-demo]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-demo");
        sendDemoCommand(action);
        const hint = document.getElementById("pnl-demo-hint");
        if (hint)
          hint.textContent =
            action === "tour" ? "Iniciando demonstração guiada…" : `Executando "${action}"…`;
      });
    });

    // Resposta real da barra do Pitch AI (sucesso ou erro) para os botões do demo
    try {
      chrome.storage.onChanged.addListener((changes) => {
        const ack = changes["pitchai.demo.ack"]?.newValue;
        const hint = document.getElementById("pnl-demo-hint");
        if (!ack || !hint) return;
        hint.textContent = `${ack.ok ? "✓" : "✗"} ${ack.message}`;
        hint.style.color = ack.ok ? "#00E676" : "#FF6B35";
        const tourBtn = document.getElementById("pnl-demo-tour");
        if (tourBtn && ack.action === "tour") {
          const finished = /concluída|não concluiu/i.test(ack.message || "");
          tourBtn.textContent = finished ? "↻ Repetir teste completo" : "⏳ Teste em andamento";
          tourBtn.disabled = !finished;
        }
      });
    } catch {}

    document.getElementById("pnl-voice").addEventListener("change", (e) => {
      cfg.voz.id = e.target.value;
      save("voz.id");
    });
    document.getElementById("pnl-speed").addEventListener("input", (e) => {
      cfg.voz.speed = +e.target.value;
      document.getElementById("pnl-speed-val").textContent = cfg.voz.speed.toFixed(2) + "x";
      save("voz.speed");
    });
    document.getElementById("pnl-gain").addEventListener("input", (e) => {
      cfg.voz.gain = +e.target.value;
      document.getElementById("pnl-gain-val").textContent = cfg.voz.gain.toFixed(2) + "x";
      save("voz.gain");
    });

    // ---------- Studio da live ----------
    const video = document.getElementById("pnl-video");
    const info = document.getElementById("pnl-src-info");
    const timeEl = document.getElementById("pnl-live-time");
    const agendaInfo = document.getElementById("pnl-agenda-info");
    let stream = null;
    let fileUrl = null;
    let live = false;
    let elapsed = 0;
    let tick = null;
    const mediaFiles = { video: null, audio: null };

    // ---- Ponte com a fonte virtual (media-injector.js, MAIN world da página) ----
    const MEDIA_CONTROL = "__pitchai_media_control__";
    const MEDIA_ACK = "__pitchai_media_ack__";
    const pendingMedia = new Map();
    let mediaSeq = 0;
    const pageOrigin = (() => {
      try {
        return new URL(document.referrer).origin;
      } catch {
        return "*";
      }
    })();

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.source !== MEDIA_ACK) return;
      const pending = pendingMedia.get(data.requestId);
      if (!pending) return;
      pendingMedia.delete(data.requestId);
      clearTimeout(pending.timer);
      if (data.ok) pending.resolve(data.status || {});
      else pending.reject(new Error(data.error || "Falha ao configurar a fonte virtual"));
    });

    function mediaConfig() {
      const num = (id, fallback) => {
        const value = Number(document.getElementById(id)?.value);
        return Number.isFinite(value) && value > 0 ? value : fallback;
      };
      const checked = (id, fallback) => document.getElementById(id)?.checked ?? fallback;
      return {
        width: num("pnl-media-width", 1280),
        height: num("pnl-media-height", 720),
        fps: num("pnl-media-fps", 30),
        loop: checked("pnl-media-loop", true),
        force: checked("pnl-media-force", true),
        tone: checked("pnl-media-tone", true),
        audioMode: document.getElementById("pnl-media-audio-mode")?.value || "video",
        // O motor aplica estes dois já no "activate": a escolha do vendedor
        // volta sozinha depois de recarregar a aba, sem reenviar comando.
        duckAuto: midiaCfg().duckIA.enabled !== false,
        duckAutoLevel: duckPct() / 100,
      };
    }

    function sendMedia(command, payload = {}) {
      if (window.parent === window) {
        return Promise.reject(
          new Error("Abra o painel dentro da aba do TikTok para usar a fonte virtual"),
        );
      }
      const requestId = `media-${++mediaSeq}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingMedia.delete(requestId);
          reject(new Error("A página do TikTok não respondeu; recarregue a aba"));
        }, 15000);
        pendingMedia.set(requestId, { resolve, reject, timer });
        window.parent.postMessage(
          { source: MEDIA_CONTROL, command, requestId, payload },
          pageOrigin,
        );
      });
    }

    const fmt = (s) => {
      const m = Math.floor(s / 60),
        sec = s % 60;
      return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    };
    const stopTracks = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    const attach = (s) => {
      stopTracks();
      stream = s;
      video.srcObject = s;
      video.removeAttribute("src");
      video.muted = true;
      video.play().catch(() => {});
    };

    document.getElementById("pnl-src-cam").addEventListener("click", async () => {
      try {
        attach(
          await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 } },
            audio: true,
          }),
        );
        info.textContent = "Fonte: câmera";
      } catch {
        info.textContent = "Não foi possível acessar a câmera";
      }
    });
    document.getElementById("pnl-src-screen").addEventListener("click", async () => {
      try {
        attach(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }));
        info.textContent = "Fonte: tela compartilhada";
      } catch {
        info.textContent = "Compartilhamento cancelado";
      }
    });
    document.getElementById("pnl-src-file").addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        stopTracks();
        if (fileUrl) URL.revokeObjectURL(fileUrl);
        fileUrl = URL.createObjectURL(f);
        mediaFiles.video = f;
        video.srcObject = null;
        video.src = fileUrl;
        video.loop = true;
        video.muted = false;
        info.textContent = `Vídeo: ${f.name} — clique em "Usar vídeo no TikTok"`;
      };
      input.click();
    });

    const audioModeSelect = document.getElementById("pnl-media-audio-mode");
    const audioButton = document.getElementById("pnl-src-audio");
    const syncAudioButton = () => {
      if (audioButton) {
        audioButton.style.display = audioModeSelect?.value === "separate" ? "" : "none";
      }
    };
    audioModeSelect?.addEventListener("change", syncAudioButton);
    syncAudioButton();

    audioButton?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        mediaFiles.audio = f;
        info.textContent = `Áudio: ${f.name}`;
      };
      input.click();
    });

    // ---- Som do vídeo: mudo na hora + abaixar quando a IA fala ----
    // São duas pontas: a config (que sobrevive ao recarregar a aba) e o motor
    // da página (que é quem mexe no volume de verdade). Quem faz o mudo mandar
    // sobre o abaixamento é o media-injector.js.

    // Vira true no primeiro clique do vendedor na chave/no nível: a partir daí
    // a escolha dele manda, e um status atrasado não desfaz o que ele fez.
    let duckTocado = false;

    async function pushAudioState(payload, fallbackMsg) {
      try {
        const status = await sendMedia("audio", payload);
        info.textContent = status.message || fallbackMsg;
        renderDiag(status);
      } catch (error) {
        // Painel em aba separada ou fonte virtual desligada: a escolha fica
        // guardada e é reaplicada quando o vídeo entrar no TikTok.
        info.textContent = error.message;
      }
    }

    /**
     * Se o som foi mudado por outro caminho, o painel acompanha em vez de
     * mostrar um botão mentindo — o vendedor confia no que está escrito nele.
     */
    function syncMediaAudioFromStatus(status) {
      if (!status || typeof status !== "object") return;
      const voz = document.getElementById("pnl-media-voice");
      if (voz) voz.hidden = !status.voiceActive;
      let mudou = false;
      if (typeof status.videoMuted === "boolean" && status.videoMuted !== !!cfg.midia?.videoMuted) {
        midiaCfg().videoMuted = status.videoMuted;
        save("midia.videoMuted");
        mudou = true;
      }
      // O abaixamento só é mexido pelo painel, então o status vale para a chave
      // nascer certa — depois que o vendedor clicar, quem manda é a escolha
      // dele (senão um status atrasado desfaria o clique).
      if (!duckTocado && typeof status.duckAuto === "boolean") {
        const nivel = Number(status.duckAutoLevel);
        const midia = midiaCfg();
        let duckMudou = false;
        if (status.duckAuto !== midia.duckIA.enabled) {
          midia.duckIA.enabled = status.duckAuto;
          duckMudou = true;
        }
        if (Number.isFinite(nivel) && Math.round(nivel * 100) !== duckPct()) {
          midia.duckIA.level = Math.min(1, Math.max(0, nivel));
          duckMudou = true;
        }
        if (duckMudou) {
          save("midia.duckIA");
          mudou = true;
        }
      }
      if (mudou) renderMediaAudio();
    }

    document.getElementById("pnl-media-mute")?.addEventListener("click", () => {
      const midia = midiaCfg();
      midia.videoMuted = !midia.videoMuted;
      save("midia.videoMuted");
      renderMediaAudio();
      pushAudioState(
        { muted: midia.videoMuted },
        midia.videoMuted ? "Som do vídeo mudo" : "Som do vídeo ligado",
      );
    });

    /**
     * "duckAuto" só troca o padrão da PRÓXIMA fala — não mexe no volume agora.
     * Por isso o aviso na tela fala no futuro ("vai cair"), e não no presente.
     */
    async function pushDuckAuto(fallbackMsg) {
      const midia = midiaCfg();
      try {
        const status = await sendMedia("duckAuto", {
          on: midia.duckIA.enabled !== false,
          level: duckPct() / 100,
        });
        info.textContent = status.message || fallbackMsg;
        renderDiag(status);
      } catch (error) {
        info.textContent = error.message;
      }
    }

    document.getElementById("pnl-media-duck")?.addEventListener("click", () => {
      const midia = midiaCfg();
      duckTocado = true;
      midia.duckIA.enabled = !midia.duckIA.enabled;
      save("midia.duckIA");
      renderMediaAudio();
      pushDuckAuto(
        midia.duckIA.enabled
          ? `O som do vídeo vai cair para ${duckPct()}% enquanto a IA fala.`
          : "O som do vídeo vai continuar no volume normal enquanto a IA fala.",
      );
    });

    // O envio espera o vendedor soltar o cursor: arrastar dispara um "input"
    // por pixel e não vale mandar 40 comandos para a página.
    let duckLevelTimer = null;
    document.getElementById("pnl-media-duck-level")?.addEventListener("input", (e) => {
      const pct = Math.min(100, Math.max(0, Number(e.target.value) || 0));
      duckTocado = true;
      midiaCfg().duckIA.level = pct / 100;
      save("midia.duckIA");
      const val = document.getElementById("pnl-media-duck-val");
      if (val) val.textContent = `${pct}%`;
      clearTimeout(duckLevelTimer);
      duckLevelTimer = setTimeout(
        () => pushDuckAuto(`O som do vídeo vai cair para ${pct}% enquanto a IA fala.`),
        250,
      );
    });

    // Diagnóstico ao vivo da fonte virtual: o motor roda na página, então esta
    // linha é a única forma de ver o que está acontecendo sem abrir o DevTools.
    let diagTimer = null;
    function renderDiag(status) {
      syncMediaAudioFromStatus(status);
      const el = document.getElementById("pnl-media-diag");
      if (!el) return;
      const v = status.video || {};
      el.textContent =
        `fonte ${status.videoSource || "?"} · quadros ${status.framesDrawn ?? "?"} · ` +
        `raf ${status.rafAlive ? "on" : "off"} · decod ${v.decodificados ?? "?"} · ` +
        `t ${v.tempo ?? "?"}s · ready ${v.ready ?? "?"} · ` +
        `${v.paused ? "pausado" : "tocando"}${v.muted ? " (mudo)" : ""} · ` +
        `som ${status.videoMuted ? "mudo" : `${Math.round((status.videoGain ?? 1) * 100)}%`}` +
        `${status.ducking ? " (abaixado)" : ""} · ia ${status.voiceActive ? "falando" : "quieta"} · ` +
        `audio ${status.audioContext || "?"} · ${status.peerConnections ?? 0}pc` +
        (v.erro ? ` · erro: ${v.erro}` : "");
      if (status.videoSource === "element") {
        info.textContent =
          "Fonte trocada para captura direta do vídeo (o canvas não recebia quadros desta GPU).";
      }
    }
    function startDiag() {
      clearInterval(diagTimer);
      diagTimer = setInterval(async () => {
        try {
          renderDiag(await sendMedia("status"));
        } catch {
          /* aba recarregada: o próximo ciclo volta a responder */
        }
      }, 2000);
    }
    function stopDiag() {
      clearInterval(diagTimer);
      diagTimer = null;
      const el = document.getElementById("pnl-media-diag");
      if (el) el.textContent = "";
      // Sem status chegando não dá para saber se a IA está falando; o aviso
      // some para não ficar aceso para sempre.
      const voz = document.getElementById("pnl-media-voice");
      if (voz) voz.hidden = true;
    }

    async function startLive() {
      if (!mediaFiles.video) {
        info.textContent = "Escolha primeiro o vídeo em “⬆ Escolher vídeo”";
        return;
      }
      const config = mediaConfig();
      if (config.audioMode === "separate" && !mediaFiles.audio) {
        info.textContent = "Escolha o arquivo de áudio separado";
        return;
      }

      info.textContent = "Ativando a fonte virtual no TikTok…";
      try {
        const status = await sendMedia("activate", {
          config,
          videoFile: mediaFiles.video,
          audioFile: mediaFiles.audio,
        });
        live = true;
        elapsed = 0;
        video.play().catch(() => {});
        clearInterval(tick);
        tick = setInterval(() => {
          elapsed++;
          // O cronômetro mostra o tempo da LIVE do TikTok (detectado pela
          // barra no gerenciador), não o tempo do vídeo — o vídeo pode ser
          // trocado/reiniciado no meio da transmissão.
          const st = lastLiveState;
          if (st?.active && st.startedAt) {
            timeEl.textContent = fmt(Math.max(0, Math.floor((Date.now() - st.startedAt) / 1000)));
          } else {
            timeEl.textContent = fmt(elapsed);
          }
        }, 1000);
        info.textContent = status.message || "Fonte virtual ativa no TikTok";
        renderDiag(status);
        startDiag();
        // O "activate" já leva o abaixamento (mediaConfig), mas a fonte nasce
        // com o som ligado: se o vendedor tinha deixado mudo, reaplica.
        if (midiaCfg().videoMuted) {
          pushAudioState({ muted: true }, "Som do vídeo mudo");
        }
      } catch (error) {
        info.textContent = error.message;
      }
    }

    async function stopLive() {
      live = false;
      clearInterval(tick);
      tick = null;
      stopDiag();
      video.pause();
      info.textContent = "Restaurando câmera e microfone…";
      try {
        const status = await sendMedia("deactivate");
        info.textContent = status.message || "Fonte virtual desligada";
      } catch (error) {
        info.textContent = error.message;
      }
    }

    document.getElementById("pnl-live-start").addEventListener("click", () => startLive());
    document.getElementById("pnl-live-stop").addEventListener("click", () => stopLive());
    document.getElementById("pnl-media-refresh")?.addEventListener("click", async () => {
      try {
        const status = await sendMedia("refresh");
        info.textContent = status.message || "Lista de fontes atualizada";
      } catch (error) {
        info.textContent = error.message;
      }
    });

    // O agendamento real roda no content script, mesmo com este painel fechado.
    setInterval(() => {
      if (!cfg.agendar?.enabled || !cfg.agendar.at) {
        if (agendaInfo) agendaInfo.textContent = "";
        return;
      }
      const ts = new Date(cfg.agendar.at).getTime();
      if (!ts) return;
      const falta = Math.ceil((ts - Date.now()) / 1000);
      if (falta > 0) agendaInfo.textContent = `Início automático em ${fmt(falta)}.`;
      else agendaInfo.textContent = "Horário atingido · a extensão está iniciando automaticamente.";
    }, 1000);

    window.addEventListener("beforeunload", () => {
      stopTracks();
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    });

    document.querySelectorAll("select[data-vc]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const k = sel.getAttribute("data-vc");
        cfg.vozContextos = cfg.vozContextos || {};
        cfg.vozContextos[k] = sel.value ? { id: sel.value, speed: cfg.voz.speed || 1 } : null;
        save(`vozContextos.${k}`);
      });
    });

    const syncTextarea = (id, path) => {
      document.getElementById(id).addEventListener("input", (e) => {
        set(cfg, path, parseLines(e.target.value));
        save(path);
      });
    };
    syncTextarea("pnl-blacklist", "filtros.blacklist");
    syncTextarea("pnl-whitelist", "filtros.whitelist");

    // ---------- Lista padrão: ver tudo / copiar para o filtro do usuário ----------
    const blShow = document.getElementById("pnl-bl-show");
    const blFull = document.getElementById("pnl-bl-full");
    const blMsg = document.getElementById("pnl-bl-msg");
    blShow?.addEventListener("click", () => {
      if (!blFull) return;
      const open = blFull.hasAttribute("hidden");
      if (open) blFull.removeAttribute("hidden");
      else blFull.setAttribute("hidden", "");
      blShow.setAttribute("aria-expanded", String(open));
      blShow.textContent = open ? "▴ Esconder a lista" : "👁 Ver a lista completa";
    });
    document.getElementById("pnl-bl-copy")?.addEventListener("click", () => {
      const padrao = defaultTerms();
      if (!padrao.length) {
        if (blMsg) blMsg.textContent = "Não consegui carregar a lista padrão.";
        return;
      }
      const atual = Array.isArray(cfg.filtros?.blacklist) ? cfg.filtros.blacklist : [];
      const jaTem = new Set(atual.map((t) => String(t).trim().toLowerCase()));
      const novos = padrao.filter((t) => !jaTem.has(String(t).trim().toLowerCase()));
      cfg.filtros.blacklist = atual.concat(novos);
      save("filtros.blacklist");
      const box = document.getElementById("pnl-blacklist");
      if (box) box.value = cfg.filtros.blacklist.join("\n");
      if (blMsg) {
        blMsg.textContent = novos.length
          ? `✓ ${novos.length} termo(s) copiado(s) para o seu filtro. Para remover algum de verdade, desligue a proteção padrão acima — senão ele continua bloqueado pela lista de fábrica.`
          : "Sua lista já tinha todos os termos padrão.";
      }
    });

    // --- Diagnóstico de detecção ---
    const MAP_STATUS_KEY = "pitchai.dommap.status";
    const MAP_LABELS = {
      chat: "Chat da live",
      chatReply: "Área de resposta do chat",
      products: "Vitrine de produtos",
      sales: "Vendas",
      violation: "Avisos / violações",
      startLive: "Botão iniciar LIVE",
      endLive: "Botão encerrar LIVE",
    };
    const VIA_LABEL = {
      cache: "assinatura salva",
      manual: "apontado por você",
      rede: "lido da API do TikTok",
      "hint-xpath": "detecção automática",
      "auto-scan": "detecção automática",
      setor: "detectado no setor",
    };
    const REGION_LABELS = {
      products: "Setor PRODUTOS",
      studio: "Setor ESTÚDIO",
      chat: "Setor CHAT",
      activity: "Setor ATIVIDADE",
      analytics: "Setor ANÁLISE",
      topbar: "AVISOS E BOTÕES DA LIVE",
    };
    function row(label, ok, right) {
      return `<div class="pnl-diag-row">
        <span>${label}</span>
        <span class="pnl-status ${ok ? "ok" : "off"}">${right}</span>
      </div>`;
    }

    function renderMap(st) {
      const box = document.getElementById("pnl-map");
      if (!box) return;
      const targets = st?.targets || {};
      const regions = st?.regions || {};
      const analytics = st?.analytics || null;

      const regionRows = Object.keys(REGION_LABELS)
        .map((k) => {
          const r = regions[k] || {};
          const ok = !!r.found;
          const via = ok ? "detectado automaticamente" : "procurando automaticamente…";
          const score = ok && typeof r.score === "number" ? ` · score ${r.score}` : "";
          return row(REGION_LABELS[k], ok, `${via}${score}`);
        })
        .join("");

      const targetRows = Object.keys(MAP_LABELS)
        .map((k) => {
          const t = targets[k] || {};
          const ok = !!t.found;
          const via = ok ? VIA_LABEL[t.via] || t.via || "detectado" : "procurando automaticamente…";
          const score = typeof t.score === "number" && !t.evidence ? ` · score ${t.score}` : "";
          const warn = ok && t.healthy === false ? " · recuperando…" : "";
          const detail = ok && t.evidence ? ` · ${t.evidence}` : "";
          if (k === "sales" && salesState === "undetected") {
            return row(MAP_LABELS[k], false, "não detectado · monitoramento desligado");
          }
          return row(MAP_LABELS[k], ok, `${via}${ok ? score + detail : ""}${warn}`);
        })
        .join("");

      const metrics =
        analytics && Object.keys(analytics).length
          ? `<p class="pnl-sub" style="margin:10px 0 2px">Métricas da live</p>` +
            Object.entries(analytics)
              .map(([k, v]) => row(k, true, String(v)))
              .join("")
          : "";

      box.innerHTML =
        `<p class="pnl-sub" style="margin:0 0 2px">Setores da página</p>${regionRows}` +
        `<p class="pnl-sub" style="margin:10px 0 2px">Alvos dentro dos setores</p>${targetRows}` +
        metrics;
    }

    let salesState = null;
    function pollMap() {
      try {
        chrome.storage.local.get([MAP_STATUS_KEY, "pitchai.sales.state"], (r) => {
          salesState = r?.["pitchai.sales.state"] || null;
          renderMap(r?.[MAP_STATUS_KEY]);
        });
      } catch {}
    }

    pollMap();
    setInterval(pollMap, 4000);

    const liveDetectionEl = document.getElementById("pnl-live-detection");
    // Último estado da LIVE publicado pela barra (pitchai.live.state); o
    // cronômetro do painel usa o startedAt dele para mostrar o tempo real da
    // transmissão do TikTok em vez do tempo do vídeo carregado.
    let lastLiveState = null;
    function renderLiveState(state) {
      if (state) lastLiveState = state;
      if (!liveDetectionEl) return;
      if (!state?.known) {
        liveDetectionEl.textContent =
          "Procurando automaticamente Iniciar LIVE, Encerrar LIVE e Avisos…";
        liveDetectionEl.style.color = "#f59e0b";
        return;
      }
      if (state.active) {
        const elapsed = state.startedAt
          ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000))
          : 0;
        liveDetectionEl.textContent = `● LIVE detectada · ${fmt(elapsed)} · automações ativas`;
        liveDetectionEl.style.color = "#22c55e";
      } else {
        liveDetectionEl.textContent = "Pronta · botão Iniciar LIVE detectado automaticamente";
        liveDetectionEl.style.color = "#a78bfa";
      }
      if (state.error) {
        liveDetectionEl.textContent = state.error;
        liveDetectionEl.style.color = "#ef4444";
      }
    }
    function pollLiveState() {
      try {
        chrome.storage.local.get(["pitchai.live.state"], (result) =>
          renderLiveState(result?.["pitchai.live.state"]),
        );
      } catch {}
    }
    pollLiveState();
    setInterval(pollLiveState, 2000);
    document.getElementById("pnl-live-remap")?.addEventListener("click", () => {
      sendDemoCommand("remap");
      if (liveDetectionEl) liveDetectionEl.textContent = "Localizando controles automaticamente…";
      setTimeout(() => {
        pollMap();
        pollLiveState();
      }, 1200);
    });
    const liveActionStatus = document.getElementById("pnl-live-action-status");
    document.getElementById("pnl-tiktok-start")?.addEventListener("click", () => {
      if (liveActionStatus) liveActionStatus.textContent = "Enviando comando ao Gerenciador…";
      sendDemoCommand("live:start");
    });
    document.getElementById("pnl-tiktok-end")?.addEventListener("click", () => {
      if (!window.confirm("Encerrar a LIVE ativa no TikTok agora?")) return;
      if (liveActionStatus) liveActionStatus.textContent = "Solicitando encerramento da LIVE…";
      sendDemoCommand("live:end");
    });

    const ackEl = document.getElementById("pnl-map-ack");
    function showAck(ack) {
      if (!ackEl || !ack) return;
      ackEl.textContent = ack.message || "";
      ackEl.style.color = ack.ok ? "#00E676" : "#FF6B35";
      const autofixStatus = document.getElementById("pnl-autofix-action-status");
      if (autofixStatus && ack.action === "pin:now") {
        autofixStatus.textContent = ack.message || "";
        autofixStatus.style.color = ack.ok ? "#00E676" : "#FF6B35";
      }
      if (liveActionStatus && String(ack.action || "").startsWith("live:")) {
        liveActionStatus.textContent = ack.message || "";
        liveActionStatus.style.color = ack.ok ? "#00E676" : "#FF6B35";
      }
    }
    try {
      chrome.storage.local.get(["pitchai.demo.ack"], (r) => showAck(r?.["pitchai.demo.ack"]));
      chrome.storage.onChanged.addListener((changes) => {
        if (changes["pitchai.demo.ack"]) showAck(changes["pitchai.demo.ack"].newValue);
      });
    } catch {}

    document.querySelectorAll("[data-cmd]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (ackEl) {
          ackEl.textContent = "Executando…";
          ackEl.style.color = "#9aa0b4";
        }
        if (btn.getAttribute("data-cmd") === "pin:now") {
          const autofixStatus = document.getElementById("pnl-autofix-action-status");
          if (autofixStatus) {
            autofixStatus.textContent = "Desfixando e fixando o produto selecionado…";
            autofixStatus.style.color = "#9aa0b4";
          }
        }
        sendDemoCommand(btn.getAttribute("data-cmd"));
        setTimeout(pollMap, 1500);
      });
    });
    document.getElementById("pnl-remap")?.addEventListener("click", () => {
      if (ackEl) {
        ackEl.textContent = "Remapeando…";
        ackEl.style.color = "#9aa0b4";
      }
      sendDemoCommand("remap");
      setTimeout(pollMap, 1500);
    });

    document.getElementById("pnl-add").addEventListener("click", () => {
      cfg.produtos.push({
        id: crypto.randomUUID(),
        name: "Novo produto",
        description: "",
        price: "",
        active: cfg.produtos.length === 0,
      });
      save("produtos");
      render();
    });
    let webTarget = "/app";
    document.getElementById("pnl-web").addEventListener("click", () => {
      window.open(new URL(webTarget, API_BASE).href, "_blank");
    });

    // Sync token + pull/push
    const tokenInput = document.getElementById("pnl-sync-token");
    // Reaproveita a barrinha de estado para mensagens rápidas (não há #pnl-sync-status no HTML).
    const statusEl = document.getElementById("pnl-sync-state");
    const credsEl = document.getElementById("pnl-sync-state");
    const dotEl = document.getElementById("pnl-quick-dot");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    function setDot(kind) {
      if (!dotEl) return;
      dotEl.classList.remove("ok", "warn");
      if (kind === "ok") dotEl.classList.add("ok");
      else if (kind === "warn") dotEl.classList.add("warn");
    }
    async function renderCreds() {
      if (!credsEl) return;
      const t = (cfg.syncToken || "").trim();
      if (!t) {
        credsEl.textContent = "Cole seu código de conexão para ativar a IA";
        credsEl.style.color = "#f97316";
        setDot("warn");
        return;
      }
      if (!UUID_RE.test(t)) {
        credsEl.textContent = "Esse código não parece completo. Copie novamente do site.";
        credsEl.style.color = "#f97316";
        setDot("warn");
        return;
      }

      credsEl.textContent = "Verificando seu código...";
      credsEl.style.color = "#a1a1aa";
      setDot(null);

      try {
        const headers = await signRequest(t, "verify");
        const res = await fetch(`${API_BASE}/api/public/live/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ token: t }),
        });
        const data = await res.json().catch(() => ({}));
        await publishDeviceBindingFromVerify(data);
        if (res.ok && data.valid && !data.locked && !data.aiLocked) {
          const tokenBalance = Number(data.tokenRemaining ?? 0).toLocaleString("pt-BR");
          credsEl.textContent = `Conectado · Plano ${(data.plan || "free").toUpperCase()} · ${tokenBalance} tokens disponíveis`;
          credsEl.style.color = "#22c55e";
          setDot("ok");
          webTarget = "/app";
          saveTokenStatus(data.tokenRemaining, data.tokenLimit, data.plan);
        } else if (data.aiLocked || data.reason === "quota_exceeded") {
          credsEl.textContent =
            data.upgrade?.message ||
            `Cota de IA atingida no plano '${data.plan || "free"}'. Fixar produtos e controlar a live continuam liberados.`;
          credsEl.style.color = "#f97316";
          setDot("warn");
          webTarget = data.upgrade?.url || "/planos";
          saveTokenStatus(data.tokenRemaining, data.tokenLimit, data.plan);
        } else if (data.valid) {
          credsEl.textContent =
            data.message || "Código válido, mas a licença está temporariamente bloqueada.";
          credsEl.style.color = "#f97316";
          setDot("warn");
          webTarget = data.reason === "payment_required" ? "/planos" : "/app";
          saveTokenStatus(data.tokenRemaining, data.tokenLimit, data.plan);
        } else {
          credsEl.textContent = `Código inválido ou expirado. Gere um novo no painel do site.`;
          credsEl.style.color = "#ef4444";
          setDot("warn");
          saveTokenStatus(0, 0, "free");
        }
      } catch {
        credsEl.textContent = "Licença não confirmada · conecte-se à internet para liberar";
        credsEl.style.color = "#ef4444";
        setDot("warn");
        saveTokenStatus(0, 0, "free");
      }
    }
    tokenInput.value = cfg.syncToken || "";
    renderCreds();
    let verifyTimer;
    tokenInput.addEventListener("input", () => {
      cfg.syncToken = tokenInput.value.trim();
      save("syncToken");
      clearTimeout(verifyTimer);
      verifyTimer = setTimeout(renderCreds, 450);
    });
    function setStatus(msg, kind) {
      statusEl.textContent = msg;
      statusEl.style.color = kind === "err" ? "#ef4444" : kind === "ok" ? "#22c55e" : "#a1a1aa";
      if (kind === "err") setDot("warn");
      else if (kind === "ok") setDot("ok");
      if (msg)
        // Restaura o estado real da conexão em vez de deixar a barra vazia.
        setTimeout(() => {
          renderCreds();
        }, 3500);
    }

    document.getElementById("pnl-pull").addEventListener("click", async () => {
      if (!cfg.syncToken) return setStatus("Cole seu código de conexão primeiro", "err");
      setStatus("Baixando suas configurações...");
      try {
        const r = await fetch(`${API_BASE}/api/public/live/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await installHeaders()) },
          body: JSON.stringify({ action: "pull", token: cfg.syncToken }),
        });
        const data = await r.json();
        if (!r.ok) return setStatus(data?.error || "Não foi possível baixar", "err");
        cfg = normalizeConfig({ ...(data.config || {}), syncToken: cfg.syncToken });
        await saveAll();
        render();
        tokenInput.value = cfg.syncToken;
        setStatus("Configurações baixadas com sucesso", "ok");
      } catch (e) {
        setStatus("Sem conexão. Verifique sua internet.", "err");
      }
    });
    document.getElementById("pnl-push").addEventListener("click", async () => {
      if (!cfg.syncToken) return setStatus("Cole seu código de conexão primeiro", "err");
      setStatus("Enviando suas configurações...");
      try {
        const { syncToken, ...toSend } = cfg;
        const r = await fetch(`${API_BASE}/api/public/live/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await installHeaders()) },
          body: JSON.stringify({ action: "push", token: cfg.syncToken, config: toSend }),
        });
        const data = await r.json();
        if (!r.ok) return setStatus(data?.error || "Não foi possível enviar", "err");
        setStatus("Configurações salvas na nuvem", "ok");
      } catch (e) {
        setStatus("Sem conexão. Verifique sua internet.", "err");
      }
    });

    // Reflete na UI o que a barra da live mudou (ex.: botão Proteção, vitrine
    // lida, revisão ligada). Gravações do próprio painel são ignoradas para não
    // re-renderizar por cima do que o usuário está digitando.
    chrome.storage.onChanged.addListener(async (changes) => {
      if (!changes[KEY]?.newValue) return;
      const decrypted = await decryptConfigObj(changes[KEY].newValue);
      const next = normalizeConfig(decrypted);
      const isEcho = JSON.stringify(next) === lastSelfPayload;
      cfg = next;
      // Reaplica o que ainda não foi gravado (debounce em voo) para não perder
      // digitação se a barra gravar no meio do caminho.
      pendingSave.forEach((value, path) => set(cfg, path, value));
      if (isEcho) return;
      render();
      if (document.activeElement !== tokenInput) tokenInput.value = cfg.syncToken || "";
      clearTimeout(verifyTimer);
      verifyTimer = setTimeout(renderCreds, 450);
    });

    // ---------- Medidor de tokens ----------
    function renderTokenMeter(state) {
      const meter = document.getElementById("pnl-token-meter");
      const fill = document.getElementById("pnl-token-meter-fill");
      const text = document.getElementById("pnl-token-meter-text");
      if (!meter || !fill || !text) return;

      const remaining = Number(state?.tokenRemaining) || 0;
      const limit = Number(state?.tokenLimit) || 0;

      if (!limit || limit <= 0) {
        meter.hidden = true;
        return;
      }

      meter.hidden = false;
      const pct = Math.min(100, Math.max(0, (remaining / limit) * 100));
      fill.style.width = `${pct}%`;

      meter.classList.remove("warning", "danger");

      if (remaining <= 0) {
        meter.classList.add("danger");
        text.textContent = "Tokens esgotados no período atual.";
      } else if (pct <= 10) {
        meter.classList.add("warning");
        text.textContent = `Você chegou a 10% dos tokens — faça upgrade para continuar`;
        const link = document.createElement("span");
        link.className = "pnl-token-meter-action";
        link.textContent = "Ver planos ↗";
        link.addEventListener("click", () =>
          window.open(new URL("/planos", API_BASE).href, "_blank"),
        );
        text.appendChild(link);
      } else {
        text.textContent = `${remaining.toLocaleString("pt-BR")} de ${limit.toLocaleString("pt-BR")} tokens (${Math.round(pct)}%)`;
      }
    }

    // Reage a mudanças no estado de tokens (escrito pelo próprio painel após
    // verify ou pelo content.js via chrome.storage).
    try {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes[TOKEN_STATUS_KEY]) renderTokenMeter(changes[TOKEN_STATUS_KEY].newValue);
      });
    } catch {}

    // Renderiza o medidor de tokens ao carregar (estado salvo de sessões anteriores).
    (async () => {
      renderTokenMeter(await loadTokenStatus());
    })();

    // Vínculo do navegador: mesmo caminho do medidor — o content.js publica, o
    // painel reflete. O painel não pergunta ao servidor por conta própria porque
    // a rota de conta usa cookie do site, que este iframe não tem.
    try {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes[DEVICE_STATUS_KEY]) renderDeviceBinding(changes[DEVICE_STATUS_KEY].newValue);
      });
    } catch {}

    (async () => {
      renderDeviceBinding(await loadDeviceStatus());
    })();

    // Desvincular acontece na tela de Conta, com login: o painel não pode
    // desvincular sozinho, senão bastaria abrir a extensão para roubar o vínculo
    // de outra pessoa que tenha o código.
    document.getElementById("pnl-device-action")?.addEventListener("click", () => {
      window.open(new URL("/app?desvincular=1", API_BASE).href, "_blank");
    });

    // Primeiro uso: animação em tela cheia e tutorial navegável.
    const ONBOARD_KEY = "pitchai.onboarded.v2";
    const onbEl = document.getElementById("pnl-onboarding");
    const onbIntro = document.getElementById("pnl-onb-intro");
    const onbTutorial = document.getElementById("pnl-onb-tutorial");
    const onbBack = document.getElementById("pnl-onb-back");
    const onbNext = document.getElementById("pnl-onb-next");
    const onbCount = document.getElementById("pnl-onb-count");
    const onbDots = document.getElementById("pnl-onb-dots");
    const onbSlides = Array.from(document.querySelectorAll("[data-onb-step]"));
    let onbStep = 0;
    let onbTimer = null;

    function renderOnboardingStep() {
      onbSlides.forEach((slide, index) => {
        slide.hidden = index !== onbStep;
        slide.classList.toggle("active", index === onbStep);
      });
      if (onbCount) onbCount.textContent = `${onbStep + 1} de ${onbSlides.length}`;
      if (onbBack) onbBack.disabled = onbStep === 0;
      if (onbNext)
        onbNext.textContent = onbStep === onbSlides.length - 1 ? "Começar a usar" : "Continuar";
      if (onbDots)
        onbDots.innerHTML = onbSlides
          .map((_, index) => `<span class="${index === onbStep ? "active" : ""}"></span>`)
          .join("");
    }

    function startTutorial() {
      clearTimeout(onbTimer);
      if (onbIntro) onbIntro.hidden = true;
      if (onbTutorial) onbTutorial.hidden = false;
      renderOnboardingStep();
    }

    function openOnboarding(withIntro = true) {
      if (!onbEl) return;
      clearTimeout(onbTimer);
      onbStep = 0;
      onbEl.hidden = false;
      if (onbIntro) {
        onbIntro.hidden = !withIntro;
        onbIntro.classList.remove("leaving");
      }
      if (onbTutorial) onbTutorial.hidden = withIntro;
      if (withIntro) {
        onbTimer = setTimeout(() => {
          onbIntro?.classList.add("leaving");
          onbTimer = setTimeout(startTutorial, 330);
        }, 1650);
      } else {
        startTutorial();
      }
    }

    function finishOnboarding() {
      if (onbEl) onbEl.hidden = true;
      clearTimeout(onbTimer);
      try {
        chrome.storage.local.set({ [ONBOARD_KEY]: true });
      } catch {}
      tokenInput?.focus();
    }

    if (onbEl && onbNext && onbBack && onbSlides.length) {
      try {
        chrome.storage.local.get([ONBOARD_KEY], (res) => {
          if (!res || !res[ONBOARD_KEY]) openOnboarding(true);
        });
      } catch {
        openOnboarding(true);
      }
      onbBack.addEventListener("click", () => {
        if (onbStep > 0) onbStep--;
        renderOnboardingStep();
      });
      onbNext.addEventListener("click", () => {
        if (onbStep < onbSlides.length - 1) {
          onbStep++;
          renderOnboardingStep();
        } else finishOnboarding();
      });
    }
    document
      .getElementById("pnl-open-tutorial")
      ?.addEventListener("click", () => openOnboarding(false));
  });
})();

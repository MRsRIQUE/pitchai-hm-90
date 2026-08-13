(function () {
  const KEY = "pitchai.config.v1";
  function resolveApiBase() {
    if (window.location.origin && window.location.origin.includes("run.app")) {
      return window.location.origin;
    }
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return window.location.origin;
    }
    return "https://pitchai-live.lovable.app";
  }
  const API_BASE = resolveApiBase();

  async function signRequest(token, endpoint) {
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
      const sigBuf = await crypto.subtle.sign(
        "HMAC",
        key,
        enc.encode(`${ts}:${nonce}:${endpoint}`),
      );
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
      const bytes = new Uint8Array(
        (stored.match(/.{1,2}/g) || []).map((b) => parseInt(b, 16)),
      );
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

  async function getStorageKey() {
    try {
      const enc = new TextEncoder();
      const origin = window.location ? window.location.origin : "pitchai";
      const salt = await getOrCreateSalt();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(origin),
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
    try {
      const cryptoKey = await getStorageKey();
      if (!cryptoKey) return data;
      const iv = new Uint8Array(data.__iv.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
      const encBuf = new Uint8Array(data.__enc.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
      const decBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encBuf);
      const decStr = new TextDecoder().decode(decBuf);
      return JSON.parse(decStr);
    } catch {
      return data;
    }
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
    respostasIA: true,
    revisarAntesDeEnviar: false,
    protecaoGeral: false,
    violacao: true,
    autoMod: true,
    notificacoesVenda: true,
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

    vozContextos: { default: null, greeting: null, offer: null, farewell: null },
    filtros: { blacklist: [], whitelist: [] },
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
      vozContextos: { ...DEFAULTS.vozContextos, ...(stored.vozContextos || {}) },
      filtros: { ...DEFAULTS.filtros, ...(stored.filtros || {}) },
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
   * Gravação incremental: relê o storage e mescla só o que o painel mudou.
   * Sem isso, o loop de raspagem (a cada 2s) sobrescreve as marcações do painel.
   */
  function save(cfg, opts) {
    chrome.storage.local.get([KEY], async (r) => {
      const dec = await decryptConfigObj(r[KEY]);
      const stored = normalizeConfig(dec);
      const merged = normalizeConfig({ ...stored, ...cfg });
      if (!opts?.products && Array.isArray(stored.produtos)) merged.produtos = stored.produtos;
      const enc = await encryptConfigObj(merged);
      chrome.storage.local.set({ [KEY]: enc });
    });
  }

  const BAD_PRODUCT_RX =
    /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live)/i;
  function productKey(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function cleanupProducts() {
    const before = cfg.produtos?.length || 0;
    const seen = new Set();
    cfg.produtos = (cfg.produtos || []).filter((p) => {
      const key = productKey(p.name);
      if (!key || key.length < 4 || BAD_PRODUCT_RX.test(p.name || "")) return false;
      if (p.demo && !cfg.demo?.enabled) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!cfg.produtos.some((p) => p.active) && cfg.produtos[0]) cfg.produtos[0].active = true;
    if (cfg.produtos.length !== before) save(cfg, { products: true });
  }
  function sendDemoCommand(action) {
    chrome.storage.local.set({ "pitchai.demo.cmd": { action, ts: Date.now() } });
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

    renderProducts();
    renderAutofixPicker();
  }

  function rodizio() {
    const ids = Array.isArray(cfg.autoFixar?.ids) ? cfg.autoFixar.ids : [];
    return (cfg.produtos || []).filter((p) => ids.includes(p.id));
  }
  function syncRodizioNames() {
    cfg.autoFixar ??= { ...DEFAULTS.autoFixar };
    cfg.autoFixar.names = rodizio().map((p) => p.name);
  }

  function renderAutofixPicker() {
    const sel = document.getElementById("pnl-autofix-pick");
    const hint = document.getElementById("pnl-autofix-hint");
    if (!sel) return;
    const list = (cfg.produtos || []).filter((p) => p?.name && productKey(p.name).length >= 4);
    const current = cfg.autoFixar?.query || "";
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
      (p) => p.name === current || p.id === current || cfg.autoFixar?.ids?.includes(p.id),
    );
    sel.value = currentProduct?.id || "";
    if (hint) {
      const sel2 = rodizio();
      if (!list.length) {
        hint.textContent = "Abra a live e toque em 🔄 para ler a vitrine automaticamente.";
      } else if (sel2.length) {
        hint.textContent = `Rodízio: ${sel2.length} produto(s) — ${sel2.map((p) => p.name).join(", ")}`;
      } else {
        hint.textContent = `${list.length} produto(s) lidos. Nenhum marcado — vai rodar todos.`;
      }
    }
  }

  function renderProducts() {
    const box = document.getElementById("pnl-products");
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
      "Marque “no rodízio” nos produtos que o auto-fixar deve alternar. Sem nenhum marcado, roda todos.";
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
        syncRodizioNames();
        save(cfg);
        renderAutofixPicker();
      };
      const txt = document.createElement("span");
      txt.textContent = "no rodízio";
      wrap.append(pick, txt);
      const input = document.createElement("input");
      input.type = "text";
      input.value = prod.name;
      input.oninput = () => {
        cfg.produtos[i].name = input.value;
        syncRodizioNames();
        save(cfg, { products: true });
      };
      const del = document.createElement("button");
      del.className = "pnl-btn ghost";
      del.textContent = "✕";
      del.onclick = () => {
        cfg.autoFixar.ids = cfg.autoFixar.ids.filter((id) => id !== prod.id);
        cfg.produtos.splice(i, 1);
        syncRodizioNames();
        save(cfg, { products: true });
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
        document.querySelectorAll(".pnl-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
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
    document.addEventListener("click", (e) => {
      const more = document.querySelector(".pnl-more-menu");
      if (!more || !more.open) return;
      if (e.target instanceof Node && more.contains(e.target)) return;
      more.open = false;
    });

    // ---------- Auto-scrape no boot ----------
    // Puxa a vitrine automaticamente quando o painel abre, sem o usuário precisar clicar.
    // Só dispara se já não houver produtos (evita re-raspagem desnecessária).
    if (!cfg.produtos || cfg.produtos.length === 0) {
      const hint = document.getElementById("pnl-autofix-hint");
      if (hint) hint.textContent = "Lendo vitrine…";
      try {
        await reloadCatalog(null);
      } catch {}
    }

    document.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      if (el.classList.contains("pnl-toggle")) {
        el.addEventListener("click", () => {
          set(cfg, key, !get(cfg, key));
          save(cfg);
          el.classList.toggle("on");
        });
      } else if (el.tagName === "SELECT") {
        el.addEventListener("change", () => {
          const raw = el.value;
          const num = Number(raw);
          set(cfg, key, raw !== "" && !Number.isNaN(num) ? num : raw);
          save(cfg);
        });
      } else if (el.tagName === "INPUT") {
        el.addEventListener("input", () => {
          const numeric = el.type === "number" || el.type === "range";
          const v = numeric ? +el.value : el.value;
          set(cfg, key, v);
          save(cfg);
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
        const ids = new Set(cfg.autoFixar.ids || []);
        ids.add(prod.id);
        cfg.autoFixar.ids = Array.from(ids);
      }
      syncRodizioNames();
      save(cfg);
      const inp = document.querySelector('input[data-key="autoFixar.query"]');
      if (inp) inp.value = name;
      renderProducts();
      renderAutofixPicker();
    });
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
        const listener = (changes) => {
          const updated = changes[KEY]?.newValue;
          if (!updated) return;
          const normalized = normalizeConfig(updated);
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
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Lendo vitrine…";
      }
      if (hint) hint.textContent = "Lendo vitrine…";
      sendDemoCommand("catalogo");
      const updated = await waitForCatalogUpdate(before);
      cfg = updated || (await load());
      render();
      const after = (cfg.produtos || []).length;
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
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
        if (hint) hint.textContent = `Enviando "${action}"…`;
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
      });
    } catch {}

    document.getElementById("pnl-voice").addEventListener("change", (e) => {
      cfg.voz.id = e.target.value;
      save(cfg);
    });
    document.getElementById("pnl-speed").addEventListener("input", (e) => {
      cfg.voz.speed = +e.target.value;
      document.getElementById("pnl-speed-val").textContent = cfg.voz.speed.toFixed(2) + "x";
      save(cfg);
    });
    document.getElementById("pnl-gain").addEventListener("input", (e) => {
      cfg.voz.gain = +e.target.value;
      document.getElementById("pnl-gain-val").textContent = cfg.voz.gain.toFixed(2) + "x";
      save(cfg);
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
        video.srcObject = null;
        video.src = fileUrl;
        video.loop = true;
        video.muted = false;
        info.textContent = "Arquivo: " + f.name;
      };
      input.click();
    });

    function startLive() {
      if (!video.srcObject && !video.src) {
        info.textContent = "Escolha primeiro a fonte de vídeo";
        return;
      }
      live = true;
      elapsed = 0;
      video.play().catch(() => {});
      clearInterval(tick);
      tick = setInterval(() => {
        elapsed++;
        timeEl.textContent = fmt(elapsed);
        if (cfg.encerrarTempo?.enabled && elapsed >= (cfg.encerrarTempo.minutes || 1) * 60)
          stopLive("timer");
      }, 1000);
      info.textContent = "● AO VIVO";
    }
    function stopLive(reason) {
      live = false;
      clearInterval(tick);
      tick = null;
      video.pause();
      info.textContent = reason === "timer" ? "Live encerrada pelo temporizador" : "Live encerrada";
    }
    document.getElementById("pnl-live-start").addEventListener("click", () => startLive());
    document.getElementById("pnl-live-stop").addEventListener("click", () => stopLive());

    // Agendamento
    setInterval(() => {
      if (live || !cfg.agendar?.enabled || !cfg.agendar.at) {
        if (agendaInfo) agendaInfo.textContent = "";
        return;
      }
      const ts = new Date(cfg.agendar.at).getTime();
      if (!ts) return;
      const falta = Math.ceil((ts - Date.now()) / 1000);
      if (falta > 0) agendaInfo.textContent = `Começa em ${fmt(falta)}. Deixe o painel aberto.`;
      else {
        agendaInfo.textContent = "Iniciando…";
        startLive();
      }
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
        save(cfg);
      });
    });

    const syncTextarea = (id, path) => {
      document.getElementById(id).addEventListener("input", (e) => {
        set(cfg, path, parseLines(e.target.value));
        save(cfg);
      });
    };
    syncTextarea("pnl-blacklist", "filtros.blacklist");
    syncTextarea("pnl-whitelist", "filtros.whitelist");

    // --- Diagnóstico de detecção ---
    const MAP_STATUS_KEY = "pitchai.dommap.status";
    const MAP_LABELS = {
      chat: "Chat da live",
      products: "Vitrine de produtos",
      sales: "Vendas",
      violation: "Avisos / violações",
      endLive: "Botão encerrar LIVE",
    };
    const VIA_LABEL = {
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
          const via = ok
            ? r.via === "manual"
              ? "apontado por você"
              : "detectado"
            : "não encontrado";
          const score = ok && typeof r.score === "number" ? ` · score ${r.score}` : "";
          return row(REGION_LABELS[k], ok, `${via}${score}`);
        })
        .join("");

      const targetRows = Object.keys(MAP_LABELS)
        .map((k) => {
          const t = targets[k] || {};
          const ok = !!t.found;
          const via = ok
            ? VIA_LABEL[t.via] || t.via || "detectado"
            : "não encontrado — aponte na tela";
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

    const ackEl = document.getElementById("pnl-map-ack");
    function showAck(ack) {
      if (!ackEl || !ack) return;
      ackEl.textContent = ack.message || "";
      ackEl.style.color = ack.ok ? "#00E676" : "#FF6B35";
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

    // --- Exportar / importar apontamentos ---
    const DM_MANUAL_KEY = "pitchai_dommap_manual_v1";
    const RG_MANUAL_KEY = "pitchai_regions_manual_v1";
    const mapJson = document.getElementById("pnl-map-json");
    const mapIo = document.getElementById("pnl-map-io");
    function setIo(msg, kind) {
      if (!mapIo) return;
      mapIo.textContent = msg;
      mapIo.style.color = kind === "err" ? "#FF6B35" : kind === "ok" ? "#00E676" : "#9aa0b4";
    }
    document.getElementById("pnl-map-export")?.addEventListener("click", () => {
      try {
        chrome.storage.local.get([DM_MANUAL_KEY, RG_MANUAL_KEY, MAP_STATUS_KEY], (r) => {
          const dm = r?.[DM_MANUAL_KEY] || {};
          const rg = r?.[RG_MANUAL_KEY] || {};
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
    document.getElementById("pnl-map-import")?.addEventListener("click", () => {
      let data;
      try {
        data = JSON.parse(mapJson?.value || "");
      } catch {
        return setIo("JSON inválido", "err");
      }
      if (!data || typeof data !== "object" || data.version !== 1)
        return setIo("formato não reconhecido (esperado version: 1)", "err");
      const host = typeof data.host === "string" && data.host ? data.host : "shop.tiktok.com";
      const clean = (o) => (o && typeof o === "object" && !Array.isArray(o) ? o : {});
      try {
        chrome.storage.local.set(
          {
            [DM_MANUAL_KEY]: { host, sig: clean(data.targets) },
            [RG_MANUAL_KEY]: { host, sig: clean(data.regions) },
          },
          () => {
            const n =
              Object.keys(clean(data.targets)).length + Object.keys(clean(data.regions)).length;
            setIo(`✓ ${n} apontamento(s) importado(s) — reaplicando…`, "ok");
            setTimeout(pollMap, 2500);
          },
        );
      } catch {
        setIo("não consegui salvar", "err");
      }
    });

    document.getElementById("pnl-add").addEventListener("click", () => {
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
    document.getElementById("pnl-web").addEventListener("click", () => {
      window.open("https://pitchai-live.lovable.app/app", "_blank");
    });

    // Sync token + pull/push
    const tokenInput = document.getElementById("pnl-sync-token");
    const statusEl = document.getElementById("pnl-sync-status");
    const credsEl = document.getElementById("pnl-sync-state");
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    async function renderCreds() {
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
          credsEl.textContent = `✓ Plano ${(data.plan || "free").toUpperCase()} · Cota restante: ${data.remainingChat ?? 0} msgs / ${data.remainingTts ?? 0} voz`;
          credsEl.style.color = "#00E676";
        } else if (data.reason === "quota_exceeded") {
          credsEl.textContent = `🔒 Cota do plano '${data.plan || "free"}' esgotada (${data.remainingChat}/${data.chatLimit} msgs). Faça upgrade!`;
          credsEl.style.color = "#FF6B35";
        } else {
          credsEl.textContent = `🔒 Token inválido ou revogado (${data.message || "Acesso negado"})`;
          credsEl.style.color = "#FF3B3B";
        }
      } catch {
        credsEl.textContent = "✓ IA conectada (modo offline)";
        credsEl.style.color = "#00E676";
      }
    }
    tokenInput.value = cfg.syncToken || "";
    renderCreds();
    tokenInput.addEventListener("input", () => {
      cfg.syncToken = tokenInput.value.trim();
      save(cfg);
      renderCreds();
    });
    function setStatus(msg, kind) {
      statusEl.textContent = msg;
      statusEl.style.color = kind === "err" ? "#FF3B3B" : kind === "ok" ? "#00E676" : "";
      if (msg)
        setTimeout(() => {
          statusEl.textContent = "";
        }, 3500);
    }

    document.getElementById("pnl-pull").addEventListener("click", async () => {
      if (!cfg.syncToken) return setStatus("cole o token primeiro", "err");
      setStatus("puxando…");
      try {
        const r = await fetch(`${API_BASE}/api/public/live/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pull", token: cfg.syncToken }),
        });
        const data = await r.json();
        if (!r.ok) return setStatus(data?.error || "falhou", "err");
        cfg = { ...DEFAULTS, ...(data.config || {}), syncToken: cfg.syncToken };
        save(cfg);
        render();
        tokenInput.value = cfg.syncToken;
        setStatus("✓ config puxada", "ok");
      } catch (e) {
        setStatus("erro de rede", "err");
      }
    });
    document.getElementById("pnl-push").addEventListener("click", async () => {
      if (!cfg.syncToken) return setStatus("cole o token primeiro", "err");
      setStatus("enviando…");
      try {
        const { syncToken, ...toSend } = cfg;
        const r = await fetch(`${API_BASE}/api/public/live/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "push", token: cfg.syncToken, config: toSend }),
        });
        const data = await r.json();
        if (!r.ok) return setStatus(data?.error || "falhou", "err");
        setStatus("✓ enviado", "ok");
      } catch (e) {
        setStatus("erro de rede", "err");
      }
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes[KEY]?.newValue) {
        cfg = { ...DEFAULTS, ...changes[KEY].newValue };
        render();
        if (document.activeElement !== tokenInput) tokenInput.value = cfg.syncToken || "";
        renderCreds();
      }
    });
  });
})();

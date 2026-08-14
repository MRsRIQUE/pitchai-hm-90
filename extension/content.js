// Pitch AI — injects Live control bar + activity panel into TikTok Shop
(function () {
  if (window.__pitchaiInjected) return;
  window.__pitchaiInjected = true;

  // Notifica o site do Pitch AI que a extensão está instalada
  try {
    window.pitchAiExtensionInstalled = true;
    window.dispatchEvent(
      new CustomEvent("pitchai-extension-detected", { detail: { version: "0.15.0" } }),
    );

    // Allowlist de origins aceitos pelo content script — evita que iframes/scripts
    // maliciosos injetem sync tokens fake ou captured network payloads.
    const ALLOWED_ORIGINS = [
      "https://shop.tiktok.com",
      "https://pitchai.ai.studio",
      "https://pitchai-live.lovable.app",
      location.origin,
    ];
    function isAllowedOrigin(origin) {
      return ALLOWED_ORIGINS.indexOf(origin) !== -1;
    }

    window.addEventListener("message", (event) => {
      if (!isAllowedOrigin(event.origin)) return;
      if (event.data && event.data.type === "PITCHAI_SYNC_TOKEN" && event.data.token) {
        if (typeof chrome !== "undefined" && chrome?.storage?.local) {
          chrome.storage.local.get(["pitchai.config.v1"], async (res) => {
            const current =
              (await decryptConfigObj(res["pitchai.config.v1"] || {})) || {};
            current.syncToken = event.data.token;
            const encrypted = await encryptConfigObj(current);
            chrome.storage.local.set({ "pitchai.config.v1": encrypted }, () => {
              // Responde só para a propria janela (target origin especifico).
              window.postMessage({ type: "PITCHAI_SYNC_TOKEN_SUCCESS" }, location.origin);
            });
          });
        }
      }
    });
  } catch (e) {
    console.warn("Pitch AI extension bridge init warning", e);
  }

  /**
   * Função utilitária temporária para forçar a injeção do `pitchai-header`
   * e `pitchai-panel-frame` para fins de testes e auditoria de CSS no TikTok Shop.
   *
   * Pode ser executada diretamente no Console do navegador:
   *   window.__forceInjectPitchAiTestUI()
   *   // ou
   *   window.forceInjectPitchAiLayout({ open: true })
   */
  window.__forceInjectPitchAiTestUI = function (options) {
    const opts = Object.assign(
      {
        open: true,
        iframeSrc:
          typeof chrome !== "undefined" && chrome?.runtime?.getURL
            ? chrome.runtime.getURL("panel.html")
            : "/app",
        forceStyles: true,
      },
      options || {},
    );

    console.log(
      "🧪 [Pitch AI Audit] Injetando pitchai-header e pitchai-panel-frame para testes...",
    );

    // 1. Injeta CSS inline emergencial para garantir imunidade a resets do TikTok
    if (opts.forceStyles && !document.getElementById("pitchai-injected-test-styles")) {
      const styleEl = document.createElement("style");
      styleEl.id = "pitchai-injected-test-styles";
      styleEl.textContent = `
        .pitchai-header {
          position: fixed !important;
          top: 12px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          z-index: 2147483647 !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 6px 14px !important;
          background: #0f0f1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 999px !important;
          color: #f9fafb !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif !important;
          font-size: 13px !important;
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7) !important;
          flex-wrap: wrap !important;
          max-width: 96vw !important;
          box-sizing: border-box !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
        .pitchai-header .pitchai-logo { font-weight: 700 !important; color: #f9fafb !important; }
        .pitchai-header .pitchai-logo b { color: #7c3aed !important; }
        .pitchai-header .pitchai-ver { font-size: 10px !important; color: #71717a !important; font-family: monospace !important; }
        .pitchai-header .pitchai-status { display: inline-flex !important; align-items: center !important; color: #00e676 !important; font-size: 12px !important; }
        .pitchai-dot { display: inline-block !important; width: 6px !important; height: 6px !important; border-radius: 50% !important; background: #00e676 !important; margin-right: 4px !important; }
        .pitchai-btn {
          cursor: pointer !important;
          background: transparent !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          color: #f9fafb !important;
          padding: 4px 10px !important;
          border-radius: 999px !important;
          font-size: 12px !important;
        }
        .pitchai-btn.primary {
          background: #7c3aed !important;
          color: #fff !important;
          border-color: #7c3aed !important;
          font-weight: 600 !important;
        }
        @keyframes pitchai-pulse-glow {
          0%, 100% {
            box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.75), 0 0 16px 2px rgba(124, 58, 237, 0.3) !important;
          }
          50% {
            box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.85), 0 0 28px 6px rgba(168, 85, 247, 0.5) !important;
          }
        }
        .pitchai-panel-frame {
          position: fixed !important;
          top: 60px !important;
          right: 20px !important;
          width: 420px !important;
          height: calc(100vh - 80px) !important;
          max-height: 720px !important;
          z-index: 2147483646 !important;
          border: 1px solid rgba(124, 58, 237, 0.3) !important;
          border-radius: 16px !important;
          background: #0f0f1a !important;
          box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.8) !important;
          display: none;
          box-sizing: border-box !important;
          opacity: 1 !important;
          visibility: visible !important;
          will-change: transform !important;
          transition: border-color 0.4s ease, box-shadow 0.4s ease !important;
        }
        .pitchai-panel-frame:hover {
          border-color: rgba(168, 85, 247, 0.85) !important;
          box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.85), 0 0 35px 8px rgba(168, 85, 247, 0.6) !important;
        }
        .pitchai-panel-frame.open {
          display: block !important;
          border-color: rgba(168, 85, 247, 0.55) !important;
          animation: pitchai-pulse-glow 3.5s infinite ease-in-out !important;
        }
        .pitchai-panel-frame.open:hover {
          animation-play-state: paused !important;
        }
        .pitchai-panel-frame iframe {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
          border-radius: 16px !important;
        }
      `;
      (document.head || document.documentElement).appendChild(styleEl);
    }

    // 2. Garante ou cria o pitchai-header
    let header = document.getElementById("pitchai-header");
    if (!header) {
      header = document.createElement("div");
      header.id = "pitchai-header";
      header.className = "pitchai-header";
      const extVersion = (() => {
        try {
          return chrome.runtime.getManifest().version;
        } catch {
          return "";
        }
      })();
      header.innerHTML = `
        <span class="pitchai-logo">pitch<b>ai</b></span>
        <span class="pitchai-ver">${extVersion ? "v" + extVersion : ""}</span>
        <span class="pitchai-status ok"><span class="pitchai-dot on"></span> Ativo</span>
        <button class="pitchai-btn primary" id="pitchai-test-toggle-btn">Painel ▴</button>
        <button class="pitchai-btn" id="pitchai-test-tab-btn" title="Abrir painel">↗ Aba</button>
      `;
      document.body.appendChild(header);
    }

    // 3. Garante ou cria o pitchai-panel-frame
    let frame = document.getElementById("pitchai-frame");
    let iframe = null;
    if (!frame) {
      frame = document.createElement("div");
      frame.id = "pitchai-frame";
      frame.className = "pitchai-panel-frame";
      iframe = document.createElement("iframe");
      iframe.src = opts.iframeSrc;
      iframe.allow = "camera; microphone; display-capture; autoplay";
      frame.appendChild(iframe);
      document.body.appendChild(frame);
    } else {
      iframe = frame.querySelector("iframe");
    }

    // Define visibilidade inicial
    if (opts.open) {
      frame.classList.add("open");
    } else {
      frame.classList.remove("open");
    }

    // Event listeners dos botões de teste
    const toggleBtn = document.getElementById("pitchai-test-toggle-btn");
    if (toggleBtn) {
      toggleBtn.onclick = function () {
        frame.classList.toggle("open");
        const isOpen = frame.classList.contains("open");
        toggleBtn.textContent = isOpen ? "Painel ▴" : "Painel ▾";
      };
    }

    const tabBtn = document.getElementById("pitchai-test-tab-btn");
    if (tabBtn) {
      tabBtn.onclick = function () {
        window.open(opts.iframeSrc, "_blank");
      };
    }

    // 4. Auditoria de Estilos Computados para verificar interferência do TikTok
    const headerStyle = window.getComputedStyle(header);
    const frameStyle = window.getComputedStyle(frame);

    const auditResult = {
      header: {
        element: header,
        position: headerStyle.position,
        zIndex: headerStyle.zIndex,
        display: headerStyle.display,
        opacity: headerStyle.opacity,
        visibility: headerStyle.visibility,
        isOverridden: headerStyle.position !== "fixed" || parseInt(headerStyle.zIndex, 10) < 100000,
      },
      frame: {
        element: frame,
        position: frameStyle.position,
        zIndex: frameStyle.zIndex,
        display: frameStyle.display,
        opacity: frameStyle.opacity,
        visibility: frameStyle.visibility,
        isOverridden: frameStyle.position !== "fixed" || parseInt(frameStyle.zIndex, 10) < 100000,
      },
    };

    console.log("✅ [Pitch AI Audit] Layout forçado com sucesso!", auditResult);
    return auditResult;
  };

  window.forceInjectPitchAiLayout = window.__forceInjectPitchAiTestUI;

  function resolveApiBase() {
    if (window.location.origin && window.location.origin.includes("run.app")) {
      return window.location.origin;
    }
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return window.location.origin;
    }
    return "https://pitchai.ai.studio";
  }
  const API_BASE = resolveApiBase();

  // Assinatura criptográfica HMAC para proteger requisições contra adulteração
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

  // Criptografia de armazenamento seguro para dados locais da extensão (AES-GCM 256-bit)
  // Salt persistido por instalação (16 bytes aleatórios em chrome.storage.local).
  // PBKDF2 iterations = 600_000 (OWASP 2023).
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

  // Trava de segurança da extensão e verificação de cota de tokens
  const extSecurity = {
    isLocked: true,
    reason: "verification_pending",
    message: "Aguardando confirmação da licença.",
    plan: "free",
    remainingChat: 0,
    remainingTts: 0,
    bannerEl: null,
  };

  async function checkExtensionLock(syncToken) {
    if (!syncToken) {
      extSecurity.isLocked = true;
      extSecurity.reason = "missing_token";
      extSecurity.message = "Sync token ausente. Insira seu token no painel da extensão.";
      updateLockUI();
      return false;
    }
    try {
      const authHeaders = await signRequest(syncToken, "verify");
      const res = await fetch(`${API_BASE}/api/public/live/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ token: syncToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.valid && !data.locked) {
        extSecurity.isLocked = false;
        extSecurity.reason = null;
        extSecurity.message = null;
        extSecurity.plan = data.plan || "free";
        extSecurity.remainingChat = data.remainingChat ?? 0;
        extSecurity.remainingTts = data.remainingTts ?? 0;
        updateLockUI();
        return true;
      } else {
        extSecurity.isLocked = true;
        extSecurity.reason = data.reason || "unauthorized";
        extSecurity.message =
          data.message || "Extensão travada por segurança. Token inválido ou cota esgotada.";
        extSecurity.plan = data.plan || "free";
        extSecurity.remainingChat = data.remainingChat ?? 0;
        extSecurity.remainingTts = data.remainingTts ?? 0;
        updateLockUI();
        return false;
      }
    } catch {
      // Falha fechada: sem confirmação do servidor, nenhuma automação é liberada.
      extSecurity.isLocked = true;
      extSecurity.reason = "verification_unavailable";
      extSecurity.message =
        "Não foi possível confirmar sua licença. Verifique a internet e tente novamente.";
      updateLockUI();
      return false;
    }
  }

  function updateLockUI() {
    try {
      scanFx.setLicensed(!extSecurity.isLocked);
    } catch {}
    let banner = document.getElementById("pitchai-lock-banner");
    if (extSecurity.isLocked) {
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "pitchai-lock-banner";
        banner.style.cssText =
          "position:fixed;top:0;left:0;right:0;z-index:9999999;background:#854d0e;color:#fef08a;padding:8px 16px;font-family:sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;box-shadow:0 4px 12px rgba(0,0,0,0.4);border-bottom:2px solid #eab308;";
        const text = document.createElement("span");
        text.id = "pitchai-lock-text";
        const btn = document.createElement("button");
        btn.textContent = "Desbloquear no Pitch AI ↗";
        btn.style.cssText =
          "background:#eab308;color:#000;border:none;padding:4px 12px;border-radius:4px;font-weight:700;cursor:pointer;";
        btn.onclick = () => window.open(`${API_BASE}/app`, "_blank");
        banner.append(text, btn);
        document.body?.prepend(banner);
      }
      const text = document.getElementById("pitchai-lock-text");
      if (text)
        text.textContent = `🔒 EXTENSÃO TRAVADA · ${extSecurity.message || "Insira seu Sync token válido."}`;
    } else if (banner) {
      banner.remove();
    }
  }

  const STORAGE_KEY = "pitchai.config.v1";
  const DEMO_CMD_KEY = "pitchai.demo.cmd";
  let lastCmdTs = 0;
  const MAP_STATUS_KEY = "pitchai.dommap.status";
  const DM = () => window.PitchaiDomMap;
  const RG = () => window.PitchaiRegions;
  function extVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "0.0.0";
    }
  }
  async function mapNode(target, force = false) {
    try {
      return (await DM()?.resolve(target, { force })) || null;
    } catch {
      return null;
    }
  }
  /** Container do setor (produtos, chat, atividade, análise, estúdio). */
  async function regionNode(id, force = false) {
    try {
      return (await RG()?.node(id, { force })) || null;
    } catch {
      return null;
    }
  }

  function publishMapStatus() {
    try {
      const st = DM()?.status?.() || {};
      const targets = { ...st };
      if (net.productsAt || lastScrape.total) {
        const api = net.products.size;
        const dom = lastScrape.dom;
        const total = lastScrape.total || api;
        targets.products = {
          found: true,
          via: api >= dom ? "rede" : "auto-scan",
          score: total,
          at: net.productsAt || lastScrape.at,
          evidence: `${total} produto(s) · API ${api} · vitrine ${dom}`,
        };
      }

      if (net.msgAt && Date.now() - net.msgAt < NET_FRESH_MS) {
        targets.chat = {
          found: true,
          via: "rede",
          score: net.msgCount,
          at: net.msgAt,
          evidence: `${net.msgCount} mensagem(ns) lidas da API do TikTok`,
        };
      }
      let regions = {};
      let analytics = null;
      try {
        regions = RG()?.status?.() || {};
      } catch {}
      try {
        analytics = RG()?.readAnalytics?.() || null;
      } catch {}
      chrome.storage.local.set({
        [MAP_STATUS_KEY]: { at: Date.now(), targets, regions, analytics },
      });
    } catch {}
  }

  // ---------- Sincronização do mapeamento (apontamentos manuais) ----------
  const DM_MANUAL_KEY = "pitchai_dommap_manual_v1";
  const RG_MANUAL_KEY = "pitchai_regions_manual_v1";
  let _mappingSelfWrite = 0;
  let _mappingPushTimer = null;

  async function buildMappingPayload() {
    const targets = (await DM()?.exportManual?.()) || {};
    const regions = (await RG()?.exportManual?.()) || {};
    let status = null;
    try {
      status = DM()?.status?.() || null;
    } catch {}
    return {
      version: 1,
      host: location.host,
      exportedAt: Date.now(),
      targets,
      regions,
      status: status || {},
    };
  }

  /** Envia os apontamentos para o backend (debounce ~2s). */
  function scheduleMappingPush() {
    if (_mappingPushTimer) clearTimeout(_mappingPushTimer);
    _mappingPushTimer = setTimeout(async () => {
      _mappingPushTimer = null;
      try {
        const cfg = await loadConfig();
        if (!cfg?.syncToken) return;
        const payload = await buildMappingPayload();
        if (!Object.keys(payload.targets).length && !Object.keys(payload.regions).length) return;
        await fetch(`${API_BASE}/api/public/live/mapping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "push", token: cfg.syncToken, payload }),
        });
      } catch (e) {
        console.warn("[Pitchai] push mapping falhou", e);
      }
    }, 2000);
  }

  /** Baixa os apontamentos salvos no backend quando ainda não há nada local. */
  async function pullMappingIfEmpty() {
    try {
      const cfg = await loadConfig();
      if (!cfg?.syncToken) return;
      const localT = (await DM()?.exportManual?.()) || {};
      const localR = (await RG()?.exportManual?.()) || {};
      if (Object.keys(localT).length || Object.keys(localR).length) return;
      const r = await fetch(`${API_BASE}/api/public/live/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull", token: cfg.syncToken, host: location.host }),
      });
      const data = await r.json().catch(() => null);
      const payload = data?.payload;
      if (!payload || payload.host !== location.host) return;
      _mappingSelfWrite = Date.now();
      await RG()?.importManual?.(payload.regions || {});
      await DM()?.importManual?.(payload.targets || {});
      publishMapStatus();
      activity.log({ type: "map", text: "Mapeamento baixado da sua conta", ts: Date.now() });
    } catch (e) {
      console.warn("[Pitchai] pull mapping falhou", e);
    }
  }

  // ---------- Ponte com o hook de rede (MAIN world) ----------
  const NET_TAG = "__pitchai_net__";
  const NET_FRESH_MS = 90000;
  const net = {
    products: new Map(), // "#pid" ou normKey(name) -> { pid, name, price, description }
    productsAt: 0,
    msgAt: 0,
    msgCount: 0,
    _catDebounce: null,
    isChatLive() {
      return !!this.msgAt && Date.now() - this.msgAt < NET_FRESH_MS;
    },
  };
  // última leitura consolidada (API + DOM) — usada no diagnóstico
  let lastScrape = { api: 0, dom: 0, total: 0, at: 0 };

  function productFingerprint(p) {
    return [p?.pid, p?.name, p?.price, p?.description, p?.image, p?.stock]
      .map((value) => String(value || "").trim())
      .join("\u241f");
  }

  function onNetProducts(list) {
    let changed = 0;
    for (const p of list) {
      if (isBadProductName(p.name)) continue;
      const key = p.pid ? `#${p.pid}` : normKey(p.name);
      if (!key || key === "#") continue;
      const prev = net.products.get(key);
      if (prev && productFingerprint(prev) === productFingerprint({ ...prev, ...p })) continue;
      if (prev) {
        net.products.set(key, {
          ...prev,
          ...p,
          name: (p.name || "").length > (prev.name || "").length ? p.name : prev.name,
          price: p.price || prev.price,
          description:
            (p.description || "").length > (prev.description || "").length
              ? p.description
              : prev.description,
        });
      } else {
        net.products.set(key, p);
      }
      changed++;
    }
    if (!changed) return;
    net.productsAt = Date.now();
    publishMapStatus();
    clearTimeout(net._catDebounce);
    net._catDebounce = setTimeout(() => {
      syncCatalog({ silent: false }).catch(() => {});
    }, 1500);
  }

  async function onNetMessages(list) {
    if (extSecurity.isLocked) return;
    if (demo.isOn()) return;
    const cfg = await loadConfig();
    if (!cfg.respostasIA) return;
    net.msgAt = Date.now();
    net.msgCount += list.length;
    chatState.detectVia = chatState.observer ? chatState.detectVia || "rede" : "rede";
    for (const m of list) enqueueMessage({ author: m.author, text: m.text });
    startPitchLoop();
    startHealthCheck();
    updateHealth();
  }

  window.addEventListener("message", (ev) => {
    if (!isAllowedOrigin(ev.origin)) return;
    const d = ev.data;
    if (!d || d.source !== NET_TAG || !Array.isArray(d.payload)) return;
    // aceita o hook desta janela ou o repasse de um iframe (net-bridge.js)
    if (ev.source !== window && !d.relay) return;
    try {
      if (d.kind === "products") onNetProducts(d.payload);
      else if (d.kind === "messages") onNetMessages(d.payload).catch(() => {});
    } catch {}
  });

  /** Dispara eventos reais de ponteiro — o React do TikTok ignora .click() puro. */
  function realClick(target) {
    if (extSecurity.isLocked) return false;
    if (!(target instanceof HTMLElement)) return false;
    try {
      target.scrollIntoView({ block: "center", inline: "center" });
    } catch {}
    let r = { left: 0, top: 0, width: 0, height: 0 };
    try {
      r = target.getBoundingClientRect();
    } catch {}
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: 1,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    };
    const seq = [
      ["pointerover", "mouseover"],
      ["pointerenter", "mouseenter"],
      ["pointermove", "mousemove"],
      ["pointerdown", "mousedown"],
      ["pointerup", "mouseup"],
      [null, "click"],
    ];
    for (const [pointerType, mouseType] of seq) {
      if (pointerType) {
        try {
          target.dispatchEvent(new PointerEvent(pointerType, base));
        } catch {}
      }
      if (mouseType) {
        try {
          target.dispatchEvent(
            new MouseEvent(mouseType, {
              ...base,
              buttons: mouseType === "mouseup" || mouseType === "click" ? 0 : 1,
            }),
          );
        } catch {}
      }
    }
    try {
      target.click();
    } catch {}
    return true;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const DEFAULTS = {
    protecaoGeral: false,
    violacao: true,
    autoMod: true,
    autoFixar: { enabled: false, query: "", minSec: 20, maxSec: 60, ids: [], names: [] },
    encerrarTempo: { enabled: false, minutes: 120 },
    respostasIA: true,
    notificacoesVenda: true,
    voz: {
      id: "nova",
      speed: 1.0,
      gain: 1.0,
      monitor: { enabled: false, volume: 0.6 },
      pushToTalk: { enabled: false, key: "Space" },
    },

    vozContextos: { default: null, greeting: null, offer: null, farewell: null },
    filtros: { blacklist: [], whitelist: [] },
    revisarAntesDeEnviar: false,
    produtos: [],
    aiContext: {},
    ultimoRoteiro: "",
    roteirosPorProduto: {},
    somVenda: { enabled: true, volume: 0.8 },
    demo: { enabled: false, velocidade: 1, comChat: true, comVendas: true, comViolacao: false },
    syncToken: "",
  };

  async function loadConfig() {
    return new Promise((res) => {
      chrome.storage.local.get([STORAGE_KEY], async (r) => {
        const raw = r[STORAGE_KEY];
        if (!raw) return res({ ...DEFAULTS });
        // Se está cifrado (__enc/__iv presentes), decifra. Se não, usa direto
        // (compat com configs gravadas por versões anteriores que não cifravam).
        const decrypted = await decryptConfigObj(raw);
        res({ ...DEFAULTS, ...(decrypted || {}) });
      });
    });
  }
  async function saveConfig(cfg) {
    const encrypted = await encryptConfigObj(cfg);
    chrome.storage.local.set({ [STORAGE_KEY]: encrypted });
  }
  /**
   * Gravação incremental: relê a config no momento do save e aplica só o que mudou.
   * Evita que o loop de raspagem sobrescreva marcações feitas no painel (e vice-versa).
   */
  async function updateConfig(mutate) {
    const fresh = await loadConfig();
    const out = (await mutate(fresh)) || fresh;
    saveConfig(out);
    return out;
  }

  /** Envia a config (inclui produtos lidos da vitrine) para o painel web. */
  let _lastPush = 0;
  async function pushConfigToBackend(cfg) {
    if (!cfg?.syncToken) return;
    if (Date.now() - _lastPush < 5000) return;
    _lastPush = Date.now();
    try {
      await fetch(`${API_BASE}/api/public/live/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push", token: cfg.syncToken, config: cfg }),
      });
    } catch (e) {
      console.warn("[Pitchai] push config falhou", e);
    }
  }

  // ---------- Som de caixa registradora ----------
  let _saleCtx = null;
  function playSaleSound(volume) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!_saleCtx) _saleCtx = new Ctor();
      const ac = _saleCtx;
      if (ac.state === "suspended") ac.resume().catch(() => {});
      const v = Math.max(0, Math.min(1, typeof volume === "number" ? volume : 0.8));
      const t = ac.currentTime + 0.02;
      // clique
      const frames = Math.floor(ac.sampleRate * 0.06);
      const buf = ac.createBuffer(1, frames, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 3);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const hp = ac.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1200;
      const cg = ac.createGain();
      cg.gain.value = 0.35 * v;
      src.connect(hp);
      hp.connect(cg);
      cg.connect(ac.destination);
      src.start(t);
      // sinos
      [
        [1318.5, 0.03, 0.22],
        [1975.5, 0.12, 0.18],
      ].forEach(([f, dt, g0]) => {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(f, t + dt);
        g.gain.setValueAtTime(0, t + dt);
        g.gain.linearRampToValueAtTime(g0 * v, t + dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.45);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(t + dt);
        osc.stop(t + dt + 0.5);
      });
    } catch {}
  }

  // ---------- Live session tracking ----------
  const session = { id: null, token: null, startedAt: 0 };
  async function sessionStart() {
    const cfg = await loadConfig();
    if (!cfg.syncToken || session.id) return;
    try {
      const r = await fetch(`${API_BASE}/api/public/live/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", token: cfg.syncToken }),
      });
      const data = await r.json().catch(() => ({}));
      if (data?.session_id) {
        session.id = data.session_id;
        session.token = cfg.syncToken;
        session.startedAt = Date.now();
        console.log("[Pitch AI] session started", session.id);
      }
    } catch (e) {
      console.warn("[Pitch AI] session start failed", e);
    }
  }
  async function sessionEnd() {
    if (!session.id || !session.token) return;
    try {
      await fetch(`${API_BASE}/api/public/live/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", token: session.token, session_id: session.id }),
      });
    } catch {}
    session.id = null;
    session.token = null;
    session.startedAt = 0;
  }
  async function sessionEvent(payload) {
    if (!session.id || !session.token) return;
    try {
      await fetch(`${API_BASE}/api/public/live/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "event",
          token: session.token,
          session_id: session.id,
          ...payload,
        }),
        keepalive: true,
      });
    } catch {}
  }
  window.addEventListener("beforeunload", () => {
    if (session.id) sessionEnd();
  });

  // ---------- Voice-context classifier ----------
  function classifyContext(text) {
    const t = (text || "").toLowerCase();
    if (/\b(oi|olá|ola|opa|salve|ea[ií]|bem[- ]vind[oa]s?|boas vindas|saudações)\b/.test(t))
      return "greeting";
    if (
      /(obrigad|até (mais|logo|amanhã)|tchau|beij[oa]s|abraç|nos vemos|até (a )?próxima|volto (já|logo))/.test(
        t,
      )
    )
      return "farewell";
    if (
      /(oferta|promo|desconto|aproveit|últim[oa]s?|leva|cupom|frete|r\$\s?\d|preço|valor|imperd[íi]vel)/.test(
        t,
      )
    )
      return "offer";
    return "default";
  }
  function resolveVoice(cfg, ctx) {
    const v = cfg.vozContextos?.[ctx] || cfg.vozContextos?.default;
    if (v?.id) return { id: v.id, speed: v.speed || 1 };
    return { id: cfg.voz?.id || "nova", speed: cfg.voz?.speed || 1 };
  }

  // ---------- Catalog scraper ----------
  /** Todos os documentos acessíveis (página + iframes same-origin, incluindo aninhados). */
  function allDocs() {
    const docs = [document];
    const walk = (doc, depth) => {
      if (depth > 3) return;
      doc.querySelectorAll("iframe").forEach((f) => {
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
      });
    };
    try {
      walk(document, 0);
    } catch {}
    return docs;
  }

  const BADGE_RX =
    /^(frete gr[áa]tis|ao vivo|live|novo|new|promo|oferta|mais vendido|best ?seller|cupom|em alta|estoque|dispon[íi]vel|esgotado|vendidos?|\d+[.,]?\d*\s*(vendidos?|sold)|\d+%|\d+)$/i;
  const JUNK_NAME_RX =
    /^(adicionar|fixar|destacar|editar|excluir|vender|ver mais|todos|produtos?|vitrine|estoque|pedidos?|apresentar|remover|comprar|carrinho)$/i;
  const PRODUCT_CHROME_RX =
    /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live)/i;
  const PRODUCT_META_RX =
    /(em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em|frete\s+gr[áa]tis|vendidos?|sold|estoque:?\s*\d+)/i;
  // rótulos de menu de conta que grudam no nome do perfil (ex.: "arthurdias993Sair")
  const MENU_TAIL_RX =
    /\s*(sair|log ?out|perfil|meu perfil|minha conta|configura[çc][õo]es|central do vendedor|ajuda|notifica[çc][õo]es)\s*$/i;
  // handles de conta: "arthurdias993", "@loja.oficial"
  const HANDLE_RX = /^@?[a-z][a-z0-9._-]{2,}\d{0,6}$/i;

  /** Nomes da conta/streamer detectados na página — nunca são produto. */
  const accountNames = new Set();
  let _accountAt = 0;
  function refreshAccountNames(force = false) {
    if (!force && accountNames.size && Date.now() - _accountAt < 30000) return;
    _accountAt = Date.now();
    const add = (s) => {
      const k = normKey(s);
      if (k && k.length >= 3 && k.length <= 40) accountNames.add(k);
    };
    try {
      document.querySelectorAll('a[href*="/@"]').forEach((a) => {
        const m = (a.getAttribute("href") || "").match(/\/@([\w.\-]+)/);
        if (m) add(m[1]);
        add(a.textContent || "");
      });
      document
        .querySelectorAll(
          '[class*="nickname" i],[class*="userName" i],[class*="user-name" i],[data-e2e*="profile" i],[data-e2e*="nickname" i]',
        )
        .forEach((n) => add(n.textContent || ""));
    } catch {}
    if (accountNames.size > 60) accountNames.clear();
  }

  function cleanName(raw) {
    let s = String(raw || "")
      .replace(/\s+/g, " ")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/^[\s·|•\-–—]+|[\s·|•\-–—]+$/g, "")
      .trim();
    // corta rótulo de menu colado no fim, com ou sem espaço ("...Sair")
    s = s.replace(MENU_TAIL_RX, "");
    s = s.replace(
      /([a-z0-9])(Sair|Perfil|Minha conta|Configura[çc][õo]es|Central do vendedor|Ajuda|Notifica[çc][õo]es)$/,
      "$1",
    );
    return s
      .replace(/^[\s·|•\-–—]+|[\s·|•\-–—]+$/g, "")
      .trim()
      .slice(0, 200);
  }
  function normKey(name) {
    return cleanName(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isBadProductName(name) {
    const cleaned = cleanName(name);
    const key = normKey(cleaned);
    if (!key || key.length < 4) return true;
    if (PRODUCT_CHROME_RX.test(cleaned)) return true;
    if (BADGE_RX.test(cleaned) || JUNK_NAME_RX.test(cleaned)) return true;
    if (
      /^(todos|todas as categorias|todo o estoque|lista|produto|produtos|cat[aá]logo)$/i.test(
        cleaned,
      )
    )
      return true;
    // conta/handle nunca é produto
    if (accountNames.has(key)) return true;
    if (!/\s/.test(cleaned) && HANDLE_RX.test(cleaned)) return true;
    if (/^@/.test(cleaned)) return true;
    return false;
  }

  // ---------- Identidade e dedupe de produtos ----------
  function productKey(p) {
    if (p && p.pid) return `#${p.pid}`;
    return normKey(p?.name || "");
  }

  /**
   * Dois nomes iguais ou truncados ("Forma Modelador De" ⊂ "Forma Modelador De Cintura"),
   * MAS sem colapsar produtos que só compartilham um prefixo curto
   * (ex.: "Kit Maquiagem" ≠ "Kit Maquiagem Profissional" quando há palavras extras
   * que sugerem um produto diferente).
   */
  function namesMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length < 10 || b.length < 10) return false;
    const ka = normKey(a);
    const kb = normKey(b);
    const longer = ka.length >= kb.length ? ka : kb;
    const shorter = ka.length >= kb.length ? kb : ka;
    // precisa ser prefixo de verdade (truncamento por virtualização)
    if (!longer.startsWith(shorter)) return false;
    // se há palavras extras demais no maior, é produto distinto (não truncamento)
    const tailWords = longer.slice(shorter.length).trim().split(/\s+/).filter(Boolean);
    if (tailWords.length >= 4) return false;
    return true;
  }

  /** Casa chaves iguais ou truncadas (compat: mapas antigos com chave por nome). */
  function findSimilarKey(map, key) {
    if (!key) return null;
    if (map.has(key)) return key;
    if (key.startsWith("#")) return null;
    for (const [k, v] of map.entries()) {
      const other = normKey(v?.name || (k.startsWith("#") ? "" : k));
      if (namesMatch(key, other)) return k;
    }
    return null;
  }

  /**
   * Acha a entrada existente equivalente, cruzando pid E nome —
   * é o que evita o mesmo produto entrar 2x (uma vinda da API `#pid`,
   * outra do DOM só com nome).
   *
   * Usa um índice secundário (nameIndex) quando disponível para evitar O(n²):
   * passe um Map<string,string> que mapeia normKey(name) -> chave do `map`.
   */
  function findProductEntry(map, item, nameIndex) {
    const pidKey = item?.pid ? `#${item.pid}` : "";
    if (pidKey && map.has(pidKey)) return pidKey;
    const nameKey = normKey(item?.name || "");
    // índice O(1) por nome
    if (nameIndex && nameKey) {
      const direct = nameIndex.get(nameKey);
      if (direct && map.has(direct)) return direct;
    }
    for (const [k, v] of map.entries()) {
      if (pidKey && v?.pid && `#${v.pid}` === pidKey) return k;
      if (namesMatch(nameKey, normKey(v?.name || ""))) return k;
    }
    if (nameKey && map.has(nameKey)) return nameKey;
    return null;
  }

  function mergeProduct(prev, item) {
    if (item.price) prev.price = item.price;
    if ((item.description || "").length > (prev.description || "").length)
      prev.description = item.description;
    if (!prev.pid && item.pid) prev.pid = item.pid;
    if (item.image && !prev.image) prev.image = item.image;
    if (item.stock != null) prev.stock = item.stock;
    if (item.active) prev.active = true;
    if (item.name && item.name.length > (prev.name || "").length) prev.name = item.name;
    return prev;
  }

  /**
   * Insere ou funde um produto no mapa de resultados, preferindo o dado mais completo.
   * `nameIndex` (opcional) é um Map<string,string> normKey(name)->chave no `map`,
   * mantido automaticamente, para fazer duas constantes em vez de O(n²).
   */
  function upsertProduct(map, item, nameIndex) {
    const key = productKey(item);
    if (!key) return;
    const match = findProductEntry(map, item, nameIndex);
    if (!match) {
      map.set(key, { ...item });
      if (nameIndex) {
        const nk = normKey(item?.name || "");
        if (nk && !nameIndex.has(nk)) nameIndex.set(nk, key);
      }
      return;
    }
    const merged = mergeProduct(map.get(match), item);
    // se agora temos um pid, promove a chave para `#pid` (identidade forte)
    const strong = merged.pid ? `#${merged.pid}` : match;
    if (strong !== match) {
      map.delete(match);
      map.set(strong, merged);
      if (nameIndex) {
        const nk = normKey(merged.name || "");
        if (nk) {
          // atualiza o índice: remove o nome apontando para a chave antiga
          if (nameIndex.get(nk) === match) nameIndex.set(nk, strong);
          else if (!nameIndex.has(nk)) nameIndex.set(nk, strong);
        }
      }
    } else if (nameIndex) {
      const nk = normKey(merged.name || "");
      if (nk && !nameIndex.has(nk)) nameIndex.set(nk, match);
    }
  }

  function inferNameFromProductText(text, price) {
    let s = cleanName(text);
    s = s.replace(/^\d+\s+/, "");
    if (price) s = s.split(price)[0] || s;
    s =
      s.split(
        /\b(?:em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em|frete\s+gr[áa]tis)\b/i,
      )[0] || s;
    s = s.replace(/\s+R\$\s?\d[\d.,].*$/i, "");
    s = s.replace(/\s+\d+\s*$/, "");
    return cleanName(s);
  }

  function shouldDropStoredProduct(prod) {
    if (!prod || typeof prod !== "object") return true;
    const name = prod.name || "";
    if (isBadProductName(name)) return true;
    const fromAuto = !!prod.fromVitrine || !!prod.demo;
    if (fromAuto && !prod.price && PRODUCT_CHROME_RX.test(name)) return true;
    return false;
  }

  function cleanupProducts(cfg) {
    if (!cfg || !Array.isArray(cfg.produtos)) return false;
    const before = cfg.produtos.length;
    const keep = new Map();
    const keepIdx = new Map(); // normKey(name) -> chave em keep (O(1) sem varrer o mapa)
    cfg.produtos.forEach((p) => {
      if (shouldDropStoredProduct(p)) return;
      if (!productKey(p)) return;
      upsertProduct(keep, p, keepIdx);
    });
    cfg.produtos = Array.from(keep.values());
    if (!cfg.produtos.some((p) => p.active) && cfg.produtos[0]) cfg.produtos[0].active = true;
    return cfg.produtos.length !== before;
  }

  const PRICE_RX = /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i;
  const CTA_RX = /(fixar|apresentar|adicionar|destacar|vender|comprar)/i;

  /** Tenta achar o product_id/sku dentro do card (evidência forte de produto). */
  function pidOf(card) {
    try {
      const nodes = [card].concat(
        Array.from(
          card.querySelectorAll("[href],[data-id],[data-product-id],[data-tid],[data-e2e]"),
        ).slice(0, 20),
      );
      for (const el of nodes) {
        for (const a of Array.from(el.attributes || [])) {
          const v = String(a.value || "");
          if (/product[_-]?id|sku[_-]?id|goods[_-]?id/i.test(a.name)) {
            const m = v.match(/\d{6,}/);
            if (m) return m[0];
          }
          const m2 = v.match(/(?:product[_-]?id|sku[_-]?id|goods[_-]?id)[=/:]?["']?(\d{6,})/i);
          if (m2) return m2[1];
        }
      }
    } catch {}
    return "";
  }

  /** Detecção rápida de wrapper de perfil/avatar — descarta sem precisar de refreshAccountNames. */
  const PROFILE_NODE_RX =
    /\b(nickname|user-?name|author|profile|user-?card|comment-?item|chat-?item|message-?item|danmaku-?item|barrage-?item)\b/i;

  function isProfileNode(el) {
    if (!(el instanceof HTMLElement)) return false;
    try {
      for (let cur = el, hops = 0; cur && hops < 4; cur = cur.parentElement, hops++) {
        const cls = `${cur.className || ""}`;
        const d = `${cur.getAttribute?.("data-e2e") || ""}`;
        if (PROFILE_NODE_RX.test(cls) || PROFILE_NODE_RX.test(d)) return true;
      }
    } catch {}
    return false;
  }

  /** Avatares são redondos/pequenos — nunca contam como imagem de produto. */
  function looksLikeAvatar(img) {
    try {
      const r = img.getBoundingClientRect();
      if (r.width && r.width < 40) return true;
      const br = getComputedStyle(img).borderRadius || "";
      if (/(50|100)%/.test(br)) return true;
    } catch {}
    return false;
  }

  /** Extrai nome/preço/descrição de um card, exigindo evidência mínima. */
  function parseProductCard(card) {
    const text = (card.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < 5 || text.length > 800) return null;
    if (PRODUCT_CHROME_RX.test(text) && !PRICE_RX.test(text)) return null;
    // descarta wrappers de perfil/chat/avatar sem depender de refreshAccountNames
    if (isProfileNode(card)) return null;
    let imgs = [];
    try {
      imgs = Array.from(card.querySelectorAll("img")).slice(0, 4);
    } catch {}
    const imgCount = imgs.length;
    const priceMatch = text.match(PRICE_RX);
    const price = priceMatch ? priceMatch[0] : "";
    const pid = pidOf(card);
    if (!price && !imgCount && !pid) return null; // nada de produto aqui
    if (!price && imgCount > 2) return null; // faixa/preview com várias miniaturas

    if (!price && !pid) {
      // sem preço e sem id: só aceita com imagem de card (não avatar) ou CTA de vitrine
      const realImg = imgs.some((i) => !looksLikeAvatar(i));
      if (!realImg && !CTA_RX.test(text)) return null;
    }

    let name = "";
    let titleNodes = [];
    try {
      titleNodes = Array.from(
        card.querySelectorAll(
          '[data-e2e*="title" i], [class*="title" i], [class*="name" i], [class*="product-desc" i], h1, h2, h3, h4, a[title]',
        ),
      );
    } catch {}
    for (const t of titleNodes) {
      const s0 = cleanName(t.getAttribute?.("title") || t.textContent || "");
      if (s0.length >= 4 && !PRICE_RX.test(s0) && !BADGE_RX.test(s0) && !JUNK_NAME_RX.test(s0)) {
        name = s0;
        break;
      }
    }
    if (!name) {
      const img = imgs.find((i) => !looksLikeAvatar(i) && i.getAttribute("alt"));
      const alt = cleanName(img?.getAttribute("alt") || "");
      if (alt.length >= 4 && !BADGE_RX.test(alt) && !JUNK_NAME_RX.test(alt)) name = alt;
    }
    if (!name) {
      const aria = cleanName(card.getAttribute?.("aria-label") || "");
      if (aria.length >= 4 && !BADGE_RX.test(aria)) name = aria;
    }
    if (!name) {
      const linhas = text.split(/[\n·|]/).map(cleanName);
      name =
        linhas.find(
          (l) =>
            l.length >= 6 &&
            !PRICE_RX.test(l) &&
            !BADGE_RX.test(l) &&
            !JUNK_NAME_RX.test(l) &&
            !PRODUCT_META_RX.test(l),
        ) || "";
    }
    if (!name) name = inferNameFromProductText(text, price);
    name = cleanName(name);
    if (isBadProductName(name)) return null;

    const description = text
      .replace(name, "")
      .replace(price, "")
      .split(/[\n·|]/)
      .map(cleanName)
      .filter((l) => l.length > 3 && !BADGE_RX.test(l))
      .slice(0, 3)
      .join(" · ")
      .slice(0, 400);

    return { pid, name, price: price.replace(/\s+/g, " ").trim().slice(0, 40), description };
  }

  function hasMultipleProductRows(el) {
    let count = 0;
    try {
      Array.from(el.children || []).forEach((child) => {
        const text = child.textContent || "";
        if (PRICE_RX.test(text) && child.querySelector?.("img")) count++;
      });
    } catch {}
    return count >= 2;
  }

  function addIfProductCard(el, out) {
    if (!(el instanceof HTMLElement)) return false;
    if (hasMultipleProductRows(el)) return false;
    const parsed = parseProductCard(el);
    if (!parsed) return false;
    out.add(el);
    return true;
  }

  function collectProductCards(root, out) {
    if (!root) return;
    addIfProductCard(root, out);
    try {
      Array.from(root.children || []).forEach((child) => addIfProductCard(child, out));
    } catch {}

    const selectors = [
      '[data-tid*="product" i]',
      '[data-e2e*="product" i]',
      '[class*="ProductItem" i]',
      '[class*="product-item" i]',
      '[class*="ProductCard" i]',
      '[class*="product-card" i]',
      '[class*="LiveProduct" i]',
      '[class*="GoodsItem" i]',
      '[class*="goods-item" i]',
      '[class*="ShopProduct" i]',
      "img",
    ];
    selectors.forEach((sel) => {
      try {
        root.querySelectorAll(sel).forEach((node) => {
          let cur = node instanceof HTMLElement ? node : null;
          let hops = 0;
          while (cur && hops++ < 6) {
            addIfProductCard(cur, out);
            cur = cur.parentElement;
          }
        });
      } catch {}
    });
  }

  /**
   * Rola a lista e coleta em CADA posição. Listas React virtualizadas removem
   * os itens anteriores do DOM, portanto coletar apenas no final perdia produtos.
   */
  async function materializeList(list, collectAtPosition) {
    if (!list) return { passes: 0, complete: false };
    let scroller = list;
    let foundScrollable = false;
    for (let i = 0; i < 4 && scroller; i++) {
      try {
        const st = getComputedStyle(scroller);
        if (/auto|scroll/.test(st.overflowY) && scroller.scrollHeight > scroller.clientHeight + 40) {
          foundScrollable = true;
          break;
        }
      } catch {}
      scroller = scroller.parentElement;
    }
    if (!scroller || !foundScrollable) {
      collectAtPosition?.(list);
      return { passes: 1, complete: true };
    }
    const start = scroller.scrollTop;
    let passes = 0;
    let complete = false;
    try {
      const step = Math.max(160, Math.floor(scroller.clientHeight * 0.72));
      let y = 0;
      let stableBottom = 0;
      while (passes < 100) {
        scroller.scrollTop = Math.min(y, Math.max(0, scroller.scrollHeight - scroller.clientHeight));
        await sleep(90);
        collectAtPosition?.(list);
        passes++;
        const bottom = scroller.scrollTop + scroller.clientHeight;
        const height = scroller.scrollHeight;
        if (bottom >= height - 4) {
          stableBottom++;
          if (stableBottom >= 2) {
            complete = true;
            break;
          }
        } else {
          stableBottom = 0;
        }
        y = Math.max(y + step, scroller.scrollTop + step);
      }
      scroller.scrollTop = start;
      await sleep(40);
      collectAtPosition?.(list);
    } catch {}
    return { passes, complete };
  }

  /** Lê a vitrine: rede (API do TikTok) + container mapeado + fallback heurístico. */
  async function scrapeCatalog({ deep = false } = {}) {
    const results = new Map();
    const resultsIdx = new Map(); // normKey(name) -> chave em results (O(1) sem O(n²))
    refreshAccountNames();

    // 1) fonte mais confiável: payload da própria API do TikTok
    for (const p of net.products.values()) {
      if (isBadProductName(p.name)) continue;
      upsertProduct(results, {
        pid: p.pid || "",
        name: p.name,
        price: p.price || "",
        description: p.description || "",
      }, resultsIdx);
    }
    const apiCount = results.size;

    const cards = new Set();
    const domKeys = new Set();
    const collectParsed = (root) => {
      const snapshot = new Set();
      collectProductCards(root, snapshot);
      snapshot.forEach((card) => {
        let parsed = null;
        try {
          parsed = parseProductCard(card);
        } catch {}
        if (!parsed || isBadProductName(parsed.name)) return;
        domKeys.add(productKey(parsed));
        upsertProduct(results, parsed, resultsIdx);
      });
    };
    // setor PRODUTOS: tudo abaixo é raspado só dentro dele
    const sector = await regionNode("products");
    const list = (await mapNode("products")) || sector;
    if (list) {
      if (deep) await materializeList(list, collectParsed);
      collectProductCards(list, cards);
    }

    if (cards.size < 2) {
      const knownSelectors = [
        '[data-tid*="product_item"]',
        '[data-tid*="product_card"]',
        '[data-e2e*="product-item"]',
        '[data-e2e*="product_card"]',
        '[class*="ProductItem"]',
        '[class*="product-item"]',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        '[class*="LiveProduct"]',
        '[class*="GoodsItem" i]',
        '[class*="goods-item" i]',
        '[class*="ShopProduct" i]',
      ];
      // se o setor foi identificado, o fallback NÃO sai dele (evita ler chat/atividade/menus)
      const scopes = sector
        ? [sector]
        : DM()?.util?.allRoots?.() || DM()?.util?.allDocs?.() || [document];

      if (sector) {
        // fallback confinado ao setor: varre seletores conhecidos + img dentro dele
        scopes.forEach((doc) => {
          knownSelectors.forEach((sel) => {
            try {
              doc.querySelectorAll(sel).forEach((c) => collectProductCards(c, cards));
            } catch {}
          });
          try {
            doc
              .querySelectorAll("img")
              .forEach((img) => collectProductCards(img.parentElement, cards));
          } catch {}
        });
      } else {
        // SEM setor: evita varrer a página inteira (falsos positivos de chat/atividade).
        // 1) seletores explícitos de produto (evidência forte)
        scopes.forEach((doc) => {
          knownSelectors.forEach((sel) => {
            try {
              doc.querySelectorAll(sel).forEach((c) => collectProductCards(c, cards));
            } catch {}
          });
        });
        // 2) só aceita listas-img se o container passar em hasMultipleProductRows
        //    (sinal de vitrine: várias linhas com preço+img) — bem mais forte que "qualquer img"
        if (cards.size < 2) {
          const seen = new Set();
          scopes.forEach((doc) => {
            try {
              doc
                .querySelectorAll("img")
                .forEach((img) => {
                  let cur = img.parentElement;
                  let hops = 0;
                  while (cur && hops++ < 5) {
                    if (seen.has(cur)) break;
                    seen.add(cur);
                    if (hasMultipleProductRows(cur)) {
                      collectProductCards(cur, cards);
                      break;
                    }
                    cur = cur.parentElement;
                  }
                });
            } catch {}
          });
        }
      }
    }

    // descarta qualquer card que tenha escapado do setor de produtos
    if (sector) {
      Array.from(cards).forEach((c) => {
        try {
          if (!sector.contains(c)) cards.delete(c);
        } catch {
          cards.delete(c);
        }
      });
    }

    let domCount = domKeys.size;
    cards.forEach((card) => {
      let parsed = null;
      try {
        parsed = parseProductCard(card);
      } catch {
        parsed = null;
      }
      if (!parsed) return;
      if (isBadProductName(parsed.name)) return;
      const key = productKey(parsed);
      if (!domKeys.has(key)) domCount++;
      domKeys.add(key);
      upsertProduct(results, parsed, resultsIdx);
    });

    lastScrape = { api: apiCount, dom: domCount, total: results.size, at: Date.now() };
    return Array.from(results.values());
  }

  // ---------- Chat container detection (setor CHAT) ----------
  async function findChatContainer() {
    const sector = await regionNode("chat");
    let node = await mapNode("chat");
    // o alvo precisa estar dentro do setor de chat; senão usa o próprio setor
    if (sector && node) {
      try {
        if (!sector.contains(node)) node = sector;
      } catch {
        node = sector;
      }
    }
    if (!node) node = sector;
    if (!node) return null;
    const st = DM()?.status?.().chat;
    return { node, via: st?.via || (sector ? "setor" : "auto") };
  }

  const SYSTEM_MSG_RX =
    /(entrou na (live|sala)|joined|acabou de seguir|come[çc]ou a seguir|started following|enviou (um|uma)? ?(presente|rosa|coraç[ãa]o)|sent (a )?gift|curtiu|liked|compartilhou|shared|bem-?vind[oa] à live|welcome to the live|assistindo agora|espectadores?)/i;

  /** Extrai autor via elemento dedicado quando existir; regex "autor: texto" é só fallback. */
  const CHAT_CHROME_RX =
    /^(chat|todos\s+os\s+coment[áa]rios|relacionados\s+ao\s+produto|digite\s+algo|0\/100|os\s+coment[áa]rios\s+dos\s+espectadores.*)$/i;

  function parseMessage(node) {
    if (!(node instanceof HTMLElement)) return null;
    const raw = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (raw.length < 2 || raw.length > 300) return null;
    if (CHAT_CHROME_RX.test(raw)) return null;
    try {
      if (node.querySelector("input, textarea, [contenteditable='true']")) return null;
    } catch {}
    if (SYSTEM_MSG_RX.test(raw)) return null;
    if (!/[a-zà-ú0-9]/i.test(raw)) return null;

    let author = "";
    let text = "";
    try {
      const authorEl = node.querySelector(
        '[data-e2e*="nickname" i], [data-e2e*="user" i], [class*="nickname" i], [class*="username" i], [class*="author" i], [class*="UserName" i]',
      );
      if (authorEl) {
        const a = (authorEl.textContent || "").replace(/\s+/g, " ").replace(/:$/, "").trim();
        if (a && a.length <= 40 && raw.startsWith(a)) {
          author = a;
          text = raw
            .slice(a.length)
            .replace(/^\s*[:：-]\s*/, "")
            .trim();
        }
      }
    } catch {}

    if (!text) {
      const m = raw.match(/^([^:]{2,32}):\s*(.{1,280})$/);
      if (m) {
        author = m[1].trim();
        text = m[2].trim();
      } else {
        author = "";
        text = raw;
      }
    }
    if (!text || text.length < 2) return null;
    return { author, text };
  }

  function buildSystemPrompt(cfg) {
    const ctx = cfg.aiContext || {};
    const produtos = cfg.produtos || [];
    const ativo = produtos.find((p) => p.active);
    const catalog = produtos
      .map(
        (p, i) =>
          `${i + 1}. ${p.name}${p.price ? " — " + p.price : ""}${p.active ? " [ATIVO]" : ""}${p.description ? " · " + p.description : ""}`,
      )
      .join("\n");
    return [
      "Você é a IA vendedora da live no TikTok Shop.",
      ctx.brandName && `Marca: ${ctx.brandName}.`,
      ctx.niche && `Nicho: ${ctx.niche}.`,
      ctx.targetAudience && `Público: ${ctx.targetAudience}.`,
      `Tom: ${ctx.tone || "empolgado e amigável"}.`,
      ctx.extraContext && `Contexto: ${ctx.extraContext}`,
      `Regras: ${ctx.rules || "Nunca invente preços ou promoções."}`,
      catalog ? `Catálogo:\n${catalog}` : "",
      ativo ? `Produto ATIVO: "${ativo.name}". Priorize quando fizer sentido.` : "",
      "Responda em 1 frase curta, natural. Nunca escreva emojis nem asteriscos.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ---------- Audio ----------
  let audioEl = null;
  let monitorEl = null; // retorno: mesma fala tocada no fone do usuário
  function ensureAudio() {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = "auto";
    }
    return audioEl;
  }
  function ensureMonitor() {
    if (!monitorEl) {
      monitorEl = new Audio();
      monitorEl.preload = "auto";
    }
    return monitorEl;
  }
  /** Aplica o dispositivo de saída da live (VB-Cable) na voz da IA. */
  async function applySink(el, cfg) {
    const id = cfg?.voz?.outputDeviceId;
    if (!id || typeof el.setSinkId !== "function") return;
    try {
      await el.setSinkId(id);
    } catch {}
  }
  function isAudioBusy() {
    const a = audioEl;
    if (!a || !a.src) return false;
    return !a.paused && !a.ended;
  }
  function waitForAudioEnd() {
    const a = audioEl;
    if (!a || !isAudioBusy()) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        a.removeEventListener("ended", done);
        a.removeEventListener("error", done);
        a.removeEventListener("pause", done);
        resolve();
      };
      a.addEventListener("ended", done);
      a.addEventListener("error", done);
      a.addEventListener("pause", done);
    });
  }
  async function playAudio(url, cfg) {
    try {
      const a = ensureAudio();
      await applySink(a, cfg);
      a.volume = Math.min(1, Math.max(0, Number(cfg?.voz?.gain ?? 1)));
      a.src = url;
      const mon = cfg?.voz?.monitor;
      if (mon?.enabled) {
        // toca em paralelo no dispositivo padrão (fone) — só pra você ouvir
        const m = ensureMonitor();
        try {
          if (typeof m.setSinkId === "function") await m.setSinkId("default");
        } catch {}
        m.volume = Math.min(1, Math.max(0, Number(mon.volume ?? 0.6)));
        m.src = url;
        m.play().catch(() => {});
      } else if (monitorEl) {
        try {
          monitorEl.pause();
        } catch {}
      }
      return a.play().catch(() => {});
    } catch {
      return Promise.resolve();
    }
  }

  async function speakText(text, cfg) {
    if (extSecurity.isLocked) return;
    const ctx = classifyContext(text);
    const voice = resolveVoice(cfg, ctx);
    activity.setNowSpeaking({ text, ctx });
    const startedAt = Date.now();
    try {
      const authHeaders = await signRequest(cfg.syncToken, "tts_speak");
      const r = await fetch(`${API_BASE}/api/public/tts/speak`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ text, voice: voice.id, speed: voice.speed }),
      });
      if (!r.ok) return;
      const blob = await r.blob();
      await playAudio(URL.createObjectURL(blob), cfg);
      await waitForAudioEnd();
    } catch {}
    activity.setNowSpeaking(null);
    // OpenAI tts-1: ~$0.015 / 1k chars. Cost stored in cents (USD ~= BRL for estimate).
    const chars = (text || "").length;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const costCents = Math.round((chars / 1000) * 1.5); // ~1.5 cents/1k chars
    sessionEvent({ kind: "tts", tts_seconds: seconds, estimated_cost_cents: costCents });
    // If active product, mark it as pitched (once)
    const ativo = (cfg.produtos || []).find((p) => p.active);
    if (ativo) sessionEvent({ kind: "product", product: { id: ativo.id, name: ativo.name } });
  }

  // ---------- Chat state ----------
  const chatState = {
    seen: new Map(),
    queue: [],
    busy: false,
    lastReplyAt: 0,
    history: [],
    observer: null,
    statusEl: null,
    count: 0,
    pitchIdx: 0,
    pitchProductId: null,
    pitchTimer: null,
    lastMsgAt: 0,
    detectVia: null,
    healthTimer: null,
    healthEl: null,
  };
  const MIN_INTERVAL_MS = 4000;
  const PITCH_IDLE_MS = 8000;
  const NO_MSG_WARN_MS = 60000;
  const CHAT_DEDUPE_MS = 45000;

  function splitPitchLines(script) {
    if (!script) return [];
    return script
      .replace(/[*_`#>]/g, "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12 && s.length <= 240);
  }
  function getActivePitchLines(cfg) {
    const ativo = (cfg.produtos || []).find((p) => p.active);
    const byProd = ativo ? cfg.roteirosPorProduto?.[ativo.id] : "";
    const script = byProd || cfg.ultimoRoteiro || "";
    if (ativo && chatState.pitchProductId !== ativo.id) {
      chatState.pitchProductId = ativo.id;
      chatState.pitchIdx = 0;
    }
    return splitPitchLines(script);
  }

  async function pitchTick() {
    if (extSecurity.isLocked) return;
    const cfg = await loadConfig();
    if (!cfg.respostasIA) return;
    if (isAudioBusy() || chatState.busy || chatState.queue.length) return;
    if (Date.now() - chatState.lastReplyAt < PITCH_IDLE_MS) return;
    const lines = getActivePitchLines(cfg);
    if (!lines.length) return;
    const line = lines[chatState.pitchIdx % lines.length];
    chatState.pitchIdx++;
    chatState.lastReplyAt = Date.now();
    activity.log({ type: "pitch", text: line, ts: Date.now() });
    await speakText(line, cfg);
  }
  function startPitchLoop() {
    if (chatState.pitchTimer) return;
    chatState.pitchTimer = setInterval(() => {
      pitchTick().catch(() => {});
    }, 4000);
  }
  function stopPitchLoop() {
    if (chatState.pitchTimer) {
      clearInterval(chatState.pitchTimer);
      chatState.pitchTimer = null;
    }
    try {
      audioEl?.pause();
    } catch {}
  }

  // ---------- Local filter (blacklist / whitelist) ----------
  function localFilter(text, cfg) {
    const t = (text || "").toLowerCase();
    const bl = (cfg.filtros?.blacklist || [])
      .map((w) => String(w).toLowerCase().trim())
      .filter(Boolean);
    const wl = (cfg.filtros?.whitelist || [])
      .map((w) => String(w).toLowerCase().trim())
      .filter(Boolean);
    if (bl.some((w) => t.includes(w))) return { block: true, reason: "blacklist" };
    if (wl.length > 0 && !wl.some((w) => t.includes(w)))
      return { block: true, reason: "whitelist" };
    return { block: false };
  }

  /** Recoloca a mensagem na fila (até 2 tentativas) quando a falha foi temporária. */
  function requeue(item, delay) {
    item.tries = (item.tries || 0) + 1;
    if (item.tries > 2) return;
    setTimeout(() => {
      chatState.queue.push(item);
      processQueue();
    }, delay || 5000);
  }

  async function processQueue() {
    if (chatState.busy) return;
    const cfg = await loadConfig();
    if (!cfg.respostasIA) return;

    // Trava de segurança: verifica credencial e cota
    const unlocked = await checkExtensionLock(cfg.syncToken);
    if (!unlocked || extSecurity.isLocked) {
      _credsOk = false;
      const item = chatState.queue.shift();
      if (item) {
        activity.markStatus(
          item.id,
          "failed",
          `🔒 TRAVADO: ${extSecurity.message || "Sync token inválido ou limite do plano atingido"}`,
        );
      }
      updateHealth();
      return;
    }

    const item = chatState.queue.shift();
    if (!item) return;
    _credsOk = true;
    activity.markStatus(item.id, "processing");
    chatState.busy = true;

    try {
      await waitForAudioEnd();
      const systemPrompt = buildSystemPrompt(cfg);
      const authHeaders = await signRequest(cfg.syncToken, "chat_reply");
      const r = await fetch(`${API_BASE}/api/public/chat/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          message: item.text,
          author: item.author,
          systemPrompt,
          history: chatState.history.slice(-4),
          blacklist: cfg.filtros?.blacklist || [],
          whitelist: cfg.filtros?.whitelist || [],
        }),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.remaining !== undefined) {
          extSecurity.remainingChat = data.remaining;
          if (data.plan) extSecurity.plan = data.plan;
        }
        if (data.ignore) {
          activity.markStatus(item.id, "ignored", data.reason || "off_topic");
          sessionEvent({ kind: "ignored" });
        } else {
          const reply = (data.reply || "").trim();
          if (reply) {
            chatState.history.push({
              role: "user",
              content: `${item.author ? item.author + ": " : ""}${item.text}`,
            });
            chatState.history.push({ role: "assistant", content: reply });
            chatState.history = chatState.history.slice(-8);
            chatState.lastReplyAt = Date.now();
            if (cfg.revisarAntesDeEnviar) {
              activity.addPending(item, reply, cfg);
            } else {
              activity.markStatus(item.id, "answered", null, reply);
              sessionEvent({ kind: "answered" });
              // Gemini flash: ~$0.075/1M in + $0.30/1M out. Rough cents estimate.
              const inTok = Math.round(((item.text || "").length + 200) / 4);
              const outTok = Math.round(reply.length / 4);
              const cents = Math.max(1, Math.round((inTok * 0.0000075 + outTok * 0.00003) * 100));
              sessionEvent({
                kind: "tokens",
                tokens_in: inTok,
                tokens_out: outTok,
                estimated_cost_cents: cents,
              });
              await speakText(reply, cfg);
            }
          } else {
            activity.markStatus(item.id, "ignored", "empty");
          }
        }
      } else {
        // Falha do servidor: não é "ignorado" — mostra o motivo real e tenta de novo.
        let detail = "";
        try {
          detail = (await r.text()).slice(0, 120);
        } catch {}
        if (r.status === 401 || r.status === 403) {
          _credsOk = false;
          updateHealth();
          activity.markStatus(
            item.id,
            "failed",
            "Sync token inválido — copie de novo no painel web",
          );
        } else if (r.status === 429) {
          activity.markStatus(item.id, "failed", "limite do plano atingido");
          requeue(item, 15000);
        } else {
          activity.markStatus(
            item.id,
            "failed",
            `servidor ${r.status}${detail ? " · " + detail : ""}`,
          );
          requeue(item, 5000);
        }
      }
    } catch (e) {
      activity.markStatus(item.id, "failed", "sem conexão com o Pitch AI");
      requeue(item, 8000);
    }

    chatState.busy = false;
    if (Date.now() - chatState.lastReplyAt < MIN_INTERVAL_MS) {
      setTimeout(processQueue, MIN_INTERVAL_MS);
    } else {
      setTimeout(processQueue, 200);
    }
  }

  function enqueueMessage(msg) {
    const key = `${msg.author}|${msg.text}`.toLowerCase();
    const now = Date.now();
    const last = chatState.seen.get(key) || 0;
    if (now - last < CHAT_DEDUPE_MS) return;
    chatState.seen.set(key, now);
    if (chatState.seen.size > 800) {
      for (const [oldKey, at] of chatState.seen) {
        if (now - at > CHAT_DEDUPE_MS * 2) chatState.seen.delete(oldKey);
      }
    }

    chatState.lastMsgAt = Date.now();
    updateHealth();

    const id = Math.random().toString(36).slice(2, 10);
    const entry = { id, ...msg, ts: Date.now(), status: "pending" };
    activity.add(entry);
    chatState.count++;
    if (chatState.statusEl) chatState.statusEl.textContent = `${chatState.count} msgs`;

    // Local pre-filter — não gasta token da IA
    loadConfig().then((cfg) => {
      const f = localFilter(msg.text, cfg);
      if (f.block) {
        activity.markStatus(id, "blocked", f.reason);
        sessionEvent({ kind: "blocked" });
        return;
      }
      chatState.queue.push(entry);
      processQueue();
    });
  }

  /**
   * Varre o container do chat inteiro e devolve as linhas de mensagem.
   * Usa os filhos diretos quando eles já são mensagens; senão desce na árvore
   * (listas virtualizadas costumam envolver as linhas em wrappers).
   */
  function collectChatRows(node) {
    const rows = [];
    if (!node) return rows;
    const direct = Array.from(node.children || []);
    const parsedDirect = direct.filter((c) => parseMessage(c));
    if (parsedDirect.length >= Math.max(1, Math.floor(direct.length * 0.4))) {
      return parsedDirect;
    }
    let all = [];
    try {
      all = Array.from(node.querySelectorAll("*")).slice(0, 4000);
    } catch {
      all = [];
    }
    const picked = [];
    for (const el of all) {
      if (!parseMessage(el)) continue;
      // ignora se um ancestral já foi escolhido (evita contar a mesma msg 2x)
      if (picked.some((p) => p.contains(el))) continue;
      picked.push(el);
    }
    return picked.length ? picked : parsedDirect;
  }

  /** Lê tudo o que já está na tela; `silent` só marca como visto, sem responder. */
  function sweepChat(node, { silent = false } = {}) {
    let n = 0;
    for (const row of collectChatRows(node)) {
      const m = parseMessage(row);
      if (!m) continue;
      const key = `${m.author}|${m.text}`.toLowerCase();
      if (silent) {
        chatState.seen.set(key, Date.now());
        continue;
      }
      if (Date.now() - (chatState.seen.get(key) || 0) < CHAT_DEDUPE_MS) continue;
      enqueueMessage(m);
      n++;
    }
    return n;
  }

  async function startChatListener() {
    if (chatState.observer) return true;
    {
      const found = await findChatContainer();
      if (!found) {
        if (net.isChatLive()) {
          // a rede já entrega as mensagens; o DOM é só redundância
          chatState.detectVia = "rede";
          startPitchLoop();
          startHealthCheck();
          updateHealth();
          return true;
        }
        return false;
      }
      chatState.detectVia = found.via;
      updateHealth();

      // marca o histórico já visível como visto (não responde retroativo)
      sweepChat(found.node, { silent: true });

      let sweepPending = null;
      const obs = new MutationObserver(() => {
        if (sweepPending) return;
        sweepPending = setTimeout(() => {
          sweepPending = null;
          try {
            sweepChat(chatState.node);
          } catch {}
        }, 250);
      });
      // subtree:true — o TikTok renderiza mensagens dentro de wrappers virtualizados
      obs.observe(found.node, { childList: true, subtree: true, characterData: true });
      chatState.observer = obs;
      chatState.node = found.node;
      // varredura periódica de segurança: nada fica de fora se o observer perder evento
      if (chatState.sweepTimer) clearInterval(chatState.sweepTimer);
      chatState.sweepTimer = setInterval(() => {
        if (!chatState.node || !chatState.node.isConnected) return;
        try {
          sweepChat(chatState.node);
        } catch {}
      }, 2000);
      publishMapStatus();
      startPitchLoop();
      startHealthCheck();
      return true;
    }
  }

  function stopChatListener() {
    if (chatState.observer) {
      chatState.observer.disconnect();
      chatState.observer = null;
    }
    if (chatState.sweepTimer) {
      clearInterval(chatState.sweepTimer);
      chatState.sweepTimer = null;
    }
    chatState.queue = [];
    chatState.node = null;

    stopPitchLoop();
    stopHealthCheck();
    chatState.detectVia = null;
    updateHealth();
  }

  // ---------- Selector telemetry / health ----------
  const CHAT_STALE_MS = 45000;
  let _credsOk = true;
  async function refreshCreds() {
    try {
      const cfg = await loadConfig();
      _credsOk = !!cfg.syncToken;
    } catch {}
  }
  function startHealthCheck() {
    if (chatState.healthTimer) return;
    refreshCreds();
    chatState.healthTimer = setInterval(() => {
      refreshCreds();
      updateHealth();
      maybeRemapChat().catch(() => {});
    }, 5000);
  }

  /** Se o nó do chat sumiu do DOM ou parou de receber mensagens, remapeia sozinho. */
  async function maybeRemapChat() {
    if (demo.isOn()) return;
    if (net.isChatLive()) return; // rede está entregando mensagens: não precisa do DOM
    const node = chatState.node;
    const gone = !node || !node.isConnected;
    const stale = chatState.lastMsgAt && Date.now() - chatState.lastMsgAt > CHAT_STALE_MS;
    if (!gone && !stale) return;
    if (chatState._remappingAt && Date.now() - chatState._remappingAt < 30000) return;
    chatState._remappingAt = Date.now();
    try {
      DM()?.invalidate("chat");
    } catch {}
    if (chatState.observer) {
      chatState.observer.disconnect();
      chatState.observer = null;
    }
    chatState.node = null;
    const ok = await startChatListener();
    activity.log({
      type: "map",
      text: ok ? "Chat remapeado automaticamente." : "Chat não encontrado — tentando de novo.",
      ts: Date.now(),
    });
    publishMapStatus();
  }
  function stopHealthCheck() {
    if (chatState.healthTimer) {
      clearInterval(chatState.healthTimer);
      chatState.healthTimer = null;
    }
  }
  function updateHealth() {
    if (!chatState.healthEl) return;
    if (!_credsOk) {
      chatState.healthEl.textContent = "⚠ IA desligada — falta o Sync token";
      chatState.healthEl.className = "pitchai-status warn";
      chatState.healthEl.title = "Abra o painel da extensão e cole o Sync token do painel web.";
      return;
    }
    chatState.healthEl.title = "";
    if (!chatState.observer && !net.isChatLive()) {
      chatState.healthEl.textContent = "⚠ chat não encontrado — aponte a área do chat";
      chatState.healthEl.className = "pitchai-status warn";
      return;
    }

    if (!chatState.lastMsgAt) {
      chatState.healthEl.textContent = "aguardando a primeira mensagem do chat";
      chatState.healthEl.className = "pitchai-status warn";
      return;
    }
    const since = Date.now() - chatState.lastMsgAt;
    if (since > NO_MSG_WARN_MS) {
      const min = Math.floor(since / 60000);
      const quanto = min >= 1 ? `${min} min` : `${Math.floor(since / 1000)}s`;
      chatState.healthEl.textContent = `⚠ chat parado há ${quanto}`;
      chatState.healthEl.className = "pitchai-status warn";
      if (!chatState._warned) {
        console.warn("[Pitch AI] Nenhuma mensagem detectada. Seletor atual:", chatState.detectVia);
        chatState._warned = true;
      }
    } else {
      chatState.healthEl.textContent = "● chat ok";
      chatState.healthEl.className = "pitchai-status ok";
      chatState._warned = false;
    }
  }

  // ================= MODO DEMO (simulação sem live real) =================
  const DEMO_PRODUCTS = [
    {
      name: "Kit Skincare Vitamina C",
      price: "R$ 89,90",
      description: "Sérum + hidratante + protetor. Uso diário, pele oleosa e mista.",
    },
    {
      name: "Fone Bluetooth Pro Bass",
      price: "R$ 129,00",
      description: "Cancelamento de ruído, 30h de bateria, à prova de suor.",
    },
    {
      name: "Tênis Running Leve",
      price: "R$ 199,90",
      description: "Amortecimento em gel, numeração 34 ao 44, 3 cores.",
    },
    {
      name: "Garrafa Térmica 1L",
      price: "R$ 59,90",
      description: "Gela 24h, esquenta 12h. Inox, tampa antivazamento.",
    },
  ];
  const DEMO_MESSAGES = [
    { author: "ana.souza", text: "quanto custa o kit de skincare?" },
    { author: "carlos_m", text: "o fone é bom pra academia?" },
    { author: "juliana", text: "tem o tênis no 38?" },
    { author: "pedro.lima", text: "qual o prazo de entrega pro nordeste?" },
    { author: "mari", text: "alguém sabe que horas passa o jogo hoje" },
    { author: "rafa", text: "a garrafa gela mesmo 24h?" },
    { author: "tone_br", text: "vc é uma idiota, esse produto é uma porcaria" },
    { author: "bia.costa", text: "tem cupom de desconto?" },
    { author: "lucas", text: "o frete é grátis?" },
    { author: "helena", text: "kkkkk boa noite gente" },
  ];

  const demo = {
    on: false,
    chatTimer: null,
    saleTimer: null,
    violTimer: null,
    msgIdx: 0,
    saleIdx: 0,
    badge: null,

    isOn() {
      return demo.on;
    },

    async applyCatalog() {
      const cfg = await loadConfig();
      const atual = cfg.produtos || [];
      const byName = new Map(atual.map((p) => [(p.name || "").toLowerCase().trim(), p]));
      let added = 0;
      for (const d of DEMO_PRODUCTS) {
        const key = d.name.toLowerCase();
        if (byName.get(key)) continue;
        const novo = {
          id: crypto.randomUUID(),
          name: d.name,
          price: d.price,
          description: d.description,
          active: false,
          fromVitrine: true,
          demo: true,
        };
        atual.push(novo);
        byName.set(key, novo);
        added++;
      }
      if (!atual.some((p) => p.active) && atual.length) atual[0].active = true;
      cfg.produtos = atual;
      saveConfig(cfg);
      pushConfigToBackend(cfg);
      activity.log({
        type: "catalog",
        text: `Vitrine simulada: +${added} produto(s) · ${atual.length} no catálogo`,
        ts: Date.now(),
      });
      return added;
    },

    async addFakeProduct() {
      const n = Math.floor(Math.random() * 900 + 100);
      const cfg = await loadConfig();
      cfg.produtos = [
        ...(cfg.produtos || []),
        {
          id: crypto.randomUUID(),
          name: `Produto Demo #${n}`,
          price: `R$ ${(Math.random() * 200 + 30).toFixed(2).replace(".", ",")}`,
          description: "Produto de teste criado pelo Modo Demo.",
          active: false,
          fromVitrine: true,
          demo: true,
        },
      ];
      saveConfig(cfg);
      pushConfigToBackend(cfg);
      activity.log({
        type: "catalog",
        text: `Produto fake adicionado: Produto Demo #${n}`,
        ts: Date.now(),
      });
    },

    nextMessage() {
      const m = DEMO_MESSAGES[demo.msgIdx % DEMO_MESSAGES.length];
      demo.msgIdx++;
      enqueueMessage({ author: m.author, text: m.text });
    },

    simulateSale() {
      const nomes = ["ana.souza", "carlos_m", "juliana", "pedro.lima", "bia.costa"];
      const nome = nomes[demo.saleIdx++ % nomes.length];
      const prod = DEMO_PRODUCTS[Math.floor(Math.random() * DEMO_PRODUCTS.length)];
      const txt = `${nome} comprou ${prod.name} · ${prod.price} · #${Math.floor(Math.random() * 9e5 + 1e5)}`;
      handleSale({ textContent: txt }).catch(() => {});
    },

    async simulateViolation() {
      const cfg = await loadConfig();
      await setViolation("Aviso de integridade: possível violação de conteúdo (simulado)", cfg);
      setTimeout(async () => {
        const c = await loadConfig();
        await clearViolation(c);
        activity.log({ type: "violation", text: "Violação simulada encerrada.", ts: Date.now() });
      }, 20000);
    },

    async testVoice() {
      const cfg = await loadConfig();
      const ativo = (cfg.produtos || []).find((p) => p.active) || DEMO_PRODUCTS[0];
      activity.log({ type: "pitch", text: "Teste de voz da IA…", ts: Date.now() });
      await waitForAudioEnd();
      await speakText(
        `Teste de voz do Pitch AI. Estou apresentando ${ativo.name} por ${ativo.price || "um super preço"}. Aproveita que o estoque é limitado!`,
        cfg,
      );
    },

    async runPitch() {
      startPitchLoop();
      activity.log({ type: "pitch", text: "Pitch de demonstração iniciado.", ts: Date.now() });
      await pitchTick().catch(() => {});
    },

    showBadge() {
      if (demo.badge) return;
      const b = document.createElement("div");
      b.className = "pitchai-demobadge";
      b.textContent = "MODO DEMO — nada é lido do TikTok";
      document.body.appendChild(b);
      demo.badge = b;
    },
    hideBadge() {
      if (demo.badge) {
        demo.badge.remove();
        demo.badge = null;
      }
    },

    async start() {
      if (demo.on) return;
      demo.on = true;
      demo.showBadge();
      const cfg = await loadConfig();
      activity.log({
        type: "live",
        text: "Modo Demo ligado — tudo abaixo é simulado.",
        ts: Date.now(),
      });
      await demo.applyCatalog();
      sessionStart();
      chatState.detectVia = "demo";
      chatState.lastMsgAt = Date.now();
      startHealthCheck();
      startPitchLoop();
      updateHealth();

      const vel = Math.max(0.25, Number(cfg.demo?.velocidade) || 1);
      if (cfg.demo?.comChat !== false) {
        demo.chatTimer = setInterval(() => demo.nextMessage(), Math.round(8000 / vel));
        setTimeout(() => {
          if (demo.on) demo.nextMessage();
        }, 2500);
      }
      if (cfg.demo?.comVendas !== false) {
        const loop = () => {
          if (!demo.on) return;
          demo.simulateSale();
          demo.saleTimer = setTimeout(loop, (30000 + Math.random() * 30000) / vel);
        };
        demo.saleTimer = setTimeout(loop, 15000 / vel);
      }
      if (cfg.demo?.comViolacao) {
        demo.violTimer = setTimeout(() => {
          if (demo.on) demo.simulateViolation();
        }, 45000 / vel);
      }
    },

    async stop() {
      if (!demo.on) return;
      demo.on = false;
      clearInterval(demo.chatTimer);
      demo.chatTimer = null;
      clearTimeout(demo.saleTimer);
      demo.saleTimer = null;
      clearTimeout(demo.violTimer);
      demo.violTimer = null;
      demo.hideBadge();
      stopPitchLoop();
      stopHealthCheck();
      const cfg = await loadConfig();
      await clearViolation(cfg);
      chatState.detectVia = null;
      updateHealth();
      await sessionEnd();
      activity.log({ type: "live", text: "Modo Demo desligado.", ts: Date.now() });
    },

    async toggle(next) {
      const cfg = await loadConfig();
      const on = typeof next === "boolean" ? next : !cfg.demo?.enabled;
      cfg.demo = { ...(cfg.demo || {}), enabled: on };
      saveConfig(cfg);
      if (on) await demo.start();
      else await demo.stop();
      return on;
    },
  };

  // ---------- Feedback visual de leitura da tela ----------
  const scanFx = {
    root: null,
    label: null,
    depth: 0,
    mounted: false,
    mount() {
      if (this.root?.isConnected || !document.body) return;
      document.getElementById("pitchai-scan-overlay")?.remove();
      const root = document.createElement("div");
      root.id = "pitchai-scan-overlay";
      root.setAttribute("aria-hidden", "true");
      const mesh = document.createElement("div");
      mesh.className = "pitchai-scan-mesh";
      const label = document.createElement("div");
      label.className = "pitchai-scan-label";
      label.textContent = "Pitch AI · monitoramento ativo";
      root.append(mesh, label);
      document.body.appendChild(root);
      this.root = root;
      this.label = label;
      this.mounted = true;
    },
    setLicensed(licensed) {
      this.mount();
      this.root?.classList.toggle("is-active", !!licensed);
      if (!licensed) {
        this.depth = 0;
        this.root?.classList.remove("is-scanning");
      }
      if (this.label)
        this.label.textContent = licensed
          ? "Pitch AI · monitoramento ativo"
          : "Pitch AI · aguardando licença";
    },
    begin(label = "digitalizando catálogo") {
      if (extSecurity.isLocked) return;
      this.mount();
      this.depth++;
      this.root?.classList.add("is-active", "is-scanning");
      if (this.label) this.label.textContent = `Pitch AI · ${label}`;
    },
    end(label = "monitoramento ativo") {
      this.depth = Math.max(0, this.depth - 1);
      if (this.depth) return;
      window.setTimeout(() => {
        if (this.depth) return;
        this.root?.classList.remove("is-scanning");
        if (this.label) this.label.textContent = `Pitch AI · ${label}`;
      }, 420);
    },
  };

  // ================= Automações do Gerenciador de LIVE =================
  const auto = {
    catalogObserver: null,
    catalogBoot: null,
    catalogTimer: null,
    catalogWatchdog: null,
    catalogSyncPromise: null,
    catalogQueuedDeep: false,
    catalogLastDeepAt: 0,
    pinTimer: null,
    pinIdx: 0,
    nextPinAt: 0,
    saleObserver: null,
    saleBoot: null,
    saleSeen: new Set(),
    saleTimes: new Map(),
    violationTimer: null,
    violationActive: false,
    liveTimer: null,
    liveStartedAt: 0,
    endingAt: 0,
    ended: false,
    banner: null,
  };

  async function findProductList() {
    const sector = await regionNode("products");
    let node = await mapNode("products");
    if (sector && node) {
      try {
        if (!sector.contains(node)) node = sector;
      } catch {
        node = sector;
      }
    }
    if (!node) node = sector;
    return node
      ? { node, via: DM()?.status?.().products?.via || (sector ? "setor" : "auto") }
      : null;
  }

  /** Lê a vitrine e sincroniza cfg.produtos (sem apagar produtos manuais ativos). */
  async function runCatalogSync({ silent = true, deep = false } = {}) {
    if (demo.isOn() || extSecurity.isLocked) return 0;
    if (deep) auto.catalogLastDeepAt = Date.now();
    const cfg = await loadConfig();
    const cleaned = cleanupProducts(cfg);
    const items = await scrapeCatalog({ deep });
    if (extSecurity.isLocked) return 0;
    if (!items.length) {
      if (cleaned) saveConfig(cfg);
      return 0;
    }
    const atual = (cfg.produtos || []).filter((p) => !p.demo);
    const index = new Map();
    const nameIndex = new Map(); // normKey(name) -> chave em index (O(1))
    for (const p of atual) {
      if (p.pid) index.set(`#${p.pid}`, p);
      const k = normKey(p.name || "");
      if (k) {
        if (!index.has(k)) index.set(k, p);
        if (!nameIndex.has(k)) nameIndex.set(k, k);
      }
    }

    let added = 0;
    let updated = 0;
    for (const s of items) {
      const key = productKey(s);
      if (!key || isBadProductName(s.name)) continue;
      const match = findProductEntry(index, s, nameIndex);
      const found = match ? index.get(match) : null;
      if (found) {
        const before = productFingerprint(found);
        mergeProduct(found, s);
        if (productFingerprint(found) !== before) updated++;
        if (found.pid) index.set(`#${found.pid}`, found);
        const nk = normKey(found.name || "");
        if (nk) {
          index.set(nk, found);
          if (!nameIndex.has(nk)) nameIndex.set(nk, nk);
        }
      } else {
        const novo = {
          id: crypto.randomUUID(),
          pid: s.pid || "",
          name: s.name,
          price: s.price || "",
          description: s.description || "",
          active: false,
          fromVitrine: true,
        };
        atual.push(novo);
        index.set(key, novo);
        const nk = normKey(novo.name || "");
        if (nk) index.set(nk, novo);
        if (nk && !nameIndex.has(nk)) nameIndex.set(nk, key);
        added++;
      }
    }

    // Grava relendo a config: mantém marcações do rodízio e o produto ativo
    // escolhidos no painel enquanto a raspagem estava rodando.
    const savedCfg = await updateConfig((f) => {
      const prev = new Map();
      for (const p of f.produtos || []) {
        if (p.pid) prev.set(`#${p.pid}`, p);
        const k = normKey(p.name || "");
        if (k && !prev.has(k)) prev.set(k, p);
      }
      f.produtos = atual.map((p) => {
        const old = (p.pid && prev.get(`#${p.pid}`)) || prev.get(normKey(p.name || ""));
        return old ? { ...p, id: old.id || p.id, active: !!old.active } : p;
      });
      cleanupProducts(f);
    });
    cfg.produtos = savedCfg.produtos;
    if (added || updated || cleaned) pushConfigToBackend(savedCfg);

    if ((added || updated || cleaned) && !silent) {
      activity.log({
        type: "catalog",
        text: `Produtos: ${cfg.produtos.length} na live (+${added} novo(s), ${updated} atualizado(s))`,
        ts: Date.now(),
      });
    }
    return added;
  }

  /** Uma única raspagem por vez; eventos simultâneos ficam consolidados. */
  async function syncCatalog(options = {}) {
    if (demo.isOn() || extSecurity.isLocked) return 0;
    if (auto.catalogSyncPromise) {
      auto.catalogQueuedDeep ||= !!options.deep;
      return auto.catalogSyncPromise;
    }
    if (options.deep) scanFx.begin("digitalizando catálogo completo");
    auto.catalogSyncPromise = runCatalogSync(options);
    try {
      return await auto.catalogSyncPromise;
    } finally {
      auto.catalogSyncPromise = null;
      if (options.deep) scanFx.end("monitoramento ativo");
      if (auto.catalogQueuedDeep && !extSecurity.isLocked) {
        auto.catalogQueuedDeep = false;
        setTimeout(() => syncCatalog({ silent: true, deep: true }).catch(() => {}), 150);
      }
    }
  }

  function startCatalogWatcher() {
    if (auto.catalogTimer || demo.isOn()) return;
    // primeira leitura automática: tenta a lista, mas também varre a página inteira
    let tries = 0;
    const boot = (auto.catalogBoot = setInterval(async () => {
      const list = await findProductList();
      const deep = Date.now() - auto.catalogLastDeepAt > 120000;
      const added = await syncCatalog({ silent: false, deep }).catch(() => 0);
      if (list || added > 0 || net.products.size) {
        clearInterval(boot);
        auto.catalogBoot = null;
        try {
          const target = list?.node || document.body;
          auto.catalogObserver = new MutationObserver(() => {
            clearTimeout(auto._catDebounce);
            auto._catDebounce = setTimeout(() => syncCatalog().catch(() => {}), 2000);
          });
          auto.catalogObserver.observe(target, { childList: true, subtree: true });
        } catch {}
      } else if (++tries > 120) {
        clearInterval(boot);
        auto.catalogBoot = null;
      }
    }, 1500));
    // loop contínuo: nunca para enquanto a página estiver aberta
    auto.catalogLastRun = Date.now();
    const tick = async () => {
      auto.catalogLastRun = Date.now();
      try {
        // A varredura profunda movimenta a lista virtualizada; faça-a no máximo
        // a cada 2 minutos. Nos demais ciclos, rede + DOM visível são suficientes.
        const deep = Date.now() - auto.catalogLastDeepAt > 120000;
        await syncCatalog({ deep });
      } catch {}
    };
    auto.catalogTimer = setInterval(tick, 2000);
    // watchdog: aba em segundo plano faz o navegador estrangular os timers.
    // Se o loop ficar parado >20s, ele é recriado e roda na hora.
    if (auto.catalogWatchdog) clearInterval(auto.catalogWatchdog);
    auto.catalogWatchdog = setInterval(() => {
      if (Date.now() - (auto.catalogLastRun || 0) < 20000) return;
      try {
        clearInterval(auto.catalogTimer);
      } catch {}
      auto.catalogTimer = setInterval(tick, 2000);
      tick();
    }, 10000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) tick();
    });
  }

  // ---------- Auto-fixar produto ----------
  const PIN_RX = /fixar|pin|destacar|topo|apresentar|mostrar/i;
  const CONFIRM_RX = /^(confirmar|apresentar|fixar|sim|ok|continuar)$/i;
  const PINNED_RX = /(fixado|apresentando|em destaque|no topo|unpin|desafixar|cancelar apresenta)/i;

  function findPinButton(card) {
    let btns = [];
    try {
      btns = Array.from(
        card.querySelectorAll(
          'button, [role="button"], a[role="button"], [class*="pin" i], [class*="present" i], [class*="top" i]',
        ),
      );
    } catch {}
    for (const b of btns) {
      const label =
        `${b.getAttribute?.("aria-label") || ""} ${b.getAttribute?.("title") || ""} ${b.textContent || ""}`.toLowerCase();
      if (PIN_RX.test(label)) return b.closest("button") || b;
    }
    // fallback: primeiro botão visível do card (TikTok usa ícone sem label)
    for (const b of btns) {
      if (b.tagName === "BUTTON" && DM()?.util?.isVisible?.(b)) return b;
    }
    return null;
  }

  /** Alguns fluxos abrem um modal "Apresentar produto?" — confirma automaticamente. */
  async function confirmPinDialog() {
    await sleep(600);
    const roots = DM()?.util?.allRoots?.() || [document];
    for (const root of roots) {
      let btns = [];
      try {
        btns = Array.from(
          root.querySelectorAll('[role="dialog"] button, .modal button, [class*="Modal" i] button'),
        );
      } catch {}
      for (const b of btns) {
        const t = (b.textContent || "").replace(/\s+/g, " ").trim();
        if (CONFIRM_RX.test(t) && DM()?.util?.isVisible?.(b)) {
          realClick(b);
          await sleep(400);
          return true;
        }
      }
    }
    return false;
  }

  async function productCards() {
    const set = new Set();
    const list = await mapNode("products");
    if (list) {
      await materializeList(list);
      collectProductCards(list, set);
    }
    if (set.size < 2) {
      const roots = DM()?.util?.allRoots?.() || [document];
      [
        '[data-tid*="product_item"]',
        '[data-e2e*="product-item"]',
        '[class*="ProductItem" i]',
        '[class*="product-item" i]',
        '[class*="GoodsItem" i]',
      ].forEach((sel) => {
        roots.forEach((root) => {
          try {
            root.querySelectorAll(sel).forEach((n) => collectProductCards(n, set));
          } catch {}
        });
      });
      roots.forEach((root) => {
        try {
          root
            .querySelectorAll("img")
            .forEach((img) => collectProductCards(img.parentElement, set));
        } catch {}
      });
    }
    return Array.from(set);
  }

  /** Acha o card do produto pelo nome normalizado (tolerante a truncamento). */
  function matchCard(cards, name) {
    const key = normKey(name);
    if (!key) return null;
    const words = key
      .split(" ")
      .filter((w) => w.length > 3)
      .slice(0, 4);
    let best = null;
    let bestHits = 0;
    for (const c of cards) {
      const parsed = parseProductCard(c);
      const t = normKey(`${parsed?.name || ""} ${c.textContent || ""}`);
      if (!t) continue;
      if (t.includes(key)) return c;
      const hits = words.filter((w) => t.includes(w)).length;
      if (hits > bestHits) {
        bestHits = hits;
        best = c;
      }
    }
    return bestHits >= Math.max(1, Math.ceil(words.length / 2)) ? best : null;
  }

  async function pinProduct(alvo) {
    const cards = await productCards();
    const card = matchCard(cards, alvo.name || "");
    if (!card) return { ok: false, reason: "card não encontrado na vitrine" };
    if (PINNED_RX.test((card.textContent || "").toLowerCase())) {
      return { ok: true, reason: "já estava fixado" };
    }
    const btn = findPinButton(card);
    if (!btn) return { ok: false, reason: "botão de fixar não encontrado" };
    realClick(btn);
    await confirmPinDialog();
    await sleep(700);
    const confirmado =
      PINNED_RX.test((card.textContent || "").toLowerCase()) ||
      btn.getAttribute?.("aria-pressed") === "true";
    return { ok: true, reason: confirmado ? "fixado" : "clique enviado" };
  }

  async function autoPinTick() {
    if (extSecurity.isLocked) return;
    const cfg = await loadConfig();
    const af = cfg.autoFixar || {};
    if (!af.enabled) return;
    if (Date.now() < auto.nextPinAt) return;

    const min = Math.max(5, Number(af.minSec) || 20);
    const max = Math.max(min, Number(af.maxSec) || 60);
    auto.nextPinAt = Date.now() + (min + Math.random() * (max - min)) * 1000;

    let produtos = cfg.produtos || [];
    // seleção manual do rodízio tem prioridade sobre o termo de busca.
    // casa por id, pid ou nome normalizado — a vitrine pode reescrever o id.
    const ids = Array.isArray(af.ids) ? af.ids : [];
    const names = Array.isArray(af.names) ? af.names.map((n) => normKey(n)) : [];
    if (ids.length || names.length) {
      const sel = produtos.filter(
        (p) =>
          ids.includes(p.id) ||
          (p.pid && ids.includes(p.pid)) ||
          names.includes(normKey(p.name || "")),
      );
      if (sel.length) produtos = sel;
    } else if (af.query) {
      const q = normKey(af.query);
      const filtrados = produtos.filter((p) => normKey(p.name || "").includes(q));
      if (filtrados.length) produtos = filtrados;
    }

    if (!produtos.length) return;

    const alvo = produtos[auto.pinIdx % produtos.length];
    auto.pinIdx++;
    try {
      localStorage.setItem("pitchai.pinIdx", String(auto.pinIdx));
    } catch {}

    // marca como ATIVO para o prompt da IA (relendo a config, sem sobrescrever o painel)
    await updateConfig((f) => {
      f.produtos = (f.produtos || []).map((p) => ({ ...p, active: p.id === alvo.id }));
    });

    let res = { ok: false, reason: "modo demo" };
    if (!demo.isOn()) {
      try {
        res = await pinProduct(alvo);
      } catch (e) {
        res = { ok: false, reason: String(e?.message || e) };
      }
    }
    activity.log({
      type: "pin",
      text:
        res.ok || demo.isOn()
          ? `Produto em destaque: ${alvo.name}`
          : `Destaque só no roteiro (${res.reason}): ${alvo.name}`,
      ts: Date.now(),
    });
  }

  function startAutoPin() {
    if (auto.pinTimer) return;
    try {
      const saved = Number(localStorage.getItem("pitchai.pinIdx"));
      if (Number.isFinite(saved) && saved > 0) auto.pinIdx = saved;
    } catch {}
    auto.pinTimer = setInterval(() => {
      autoPinTick().catch(() => {});
    }, 3000);
  }

  // ---------- Notificação de venda ----------
  function saleKey(node) {
    return (node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  // Evidência real de venda (comprou / pedido / vendido / qtd + preço).
  const SALE_EVIDENCE_RX =
    /(comprou|compraram|acabou de comprar|pedido|vendido|vendeu|venda confirmada|just bought|purchased|ordered|sold|x\s?\d+\s*(un|pcs)?)/i;
  const SALE_PRICE_RX = /(R\$|US\$|\$)\s?\d/;
  // Lixo de UI da vitrine / strings de acessibilidade que caíam como "venda".
  const SALE_JUNK_RX =
    /(press the space bar|drag(gable|ging)|use the arrow|screen reader|todas as categorias|todo o estoque|lista de produtos|mover para o topo|selecionados?|excluir|adicionar produto|ordenar|filtrar|nesta live|ao vivo agora|carregando)/i;

  function looksLikeSale(key) {
    if (!key || key.length < 8 || key.length > 120) return false;
    if (SALE_JUNK_RX.test(key)) return false;
    if (!/\s/.test(key)) return false;
    return SALE_EVIDENCE_RX.test(key) || (SALE_PRICE_RX.test(key) && /[\p{L}]{3,}/u.test(key));
  }

  const SALE_DEDUPE_MS = 20000;
  async function handleSale(node) {
    if (extSecurity.isLocked) return;
    const key = saleKey(node);
    if (!looksLikeSale(key)) return;
    auto.saleEvidenceAt = Date.now();
    const now = Date.now();
    const last = auto.saleTimes.get(key) || 0;
    if (last && now - last < SALE_DEDUPE_MS) return;
    auto.saleSeen.add(key);
    auto.saleTimes.set(key, now);
    if (auto.saleTimes.size > 300) {
      for (const [oldKey, at] of auto.saleTimes) {
        if (now - at > SALE_DEDUPE_MS * 3) {
          auto.saleTimes.delete(oldKey);
          auto.saleSeen.delete(oldKey);
        }
      }
    }

    activity.log({ type: "sale", text: `🛒 Venda: ${key.slice(0, 80)}`, ts: Date.now() });
    sessionEvent({ kind: "sale", sale: { text: key.slice(0, 120) } });

    const cfg = await loadConfig();
    if (cfg.somVenda?.enabled !== false) playSaleSound(cfg.somVenda?.volume ?? 0.8);
    if (!cfg.notificacoesVenda) return;
    const nome = (key.match(/^([\w.@-]{2,24})/) || [])[1] || "";
    const frase = nome
      ? `Muito obrigado pela compra, ${nome}! Aproveita que ainda tem estoque.`
      : "Saiu mais uma venda! Obrigado, aproveita que ainda tem estoque.";
    await waitForAudioEnd();
    await speakText(frase, cfg);
  }

  function startSaleWatcher() {
    if (auto.saleObserver || demo.isOn()) return;
    let tries = 0;
    const boot = (auto.saleBoot = setInterval(async () => {
      const node = await mapNode("sales");
      const found = node ? { node } : null;
      if (found) {
        clearInterval(boot);
        auto.saleBoot = null;
        const initializedAt = Date.now();
        Array.from(found.node.children).forEach((c) => {
          const key = saleKey(c);
          auto.saleSeen.add(key);
          auto.saleTimes.set(key, initializedAt);
        });
        const startedAt = Date.now();
        auto.saleEvidenceAt = Array.from(found.node.children).some((c) => looksLikeSale(saleKey(c)))
          ? Date.now()
          : 0;
        auto.saleObserver = new MutationObserver((muts) => {
          for (const m of muts) {
            m.addedNodes.forEach((n) => {
              if (n instanceof HTMLElement) handleSale(n).catch(() => {});
            });
          }
        });
        auto.saleObserver.observe(found.node, { childList: true, subtree: true });
        // Container mapeado sem nenhuma evidência de venda em 60s → provavelmente
        // é a vitrine, não o feed de vendas. Desliga em vez de disparar em falso.
        auto.saleCheck = setInterval(() => {
          if (auto.saleEvidenceAt) {
            clearInterval(auto.saleCheck);
            auto.saleCheck = null;
            return;
          }
          if (Date.now() - startedAt < 60000) return;
          try {
            auto.saleObserver?.disconnect();
          } catch {}
          auto.saleObserver = null;
          clearInterval(auto.saleCheck);
          auto.saleCheck = null;
          auto.salesUndetected = true;
          try {
            chrome.storage.local.set({ "pitchai.sales.state": "undetected" });
          } catch {}
        }, 10000);
      } else if (++tries > 40) {
        clearInterval(boot);
        auto.saleBoot = null;
      }
    }, 1500));
  }

  // ---------- Monitor de violação ----------
  async function setViolation(txt, cfg) {
    if (auto.violationActive) return;
    auto.violationActive = true;
    activity.log({
      type: "violation",
      text: `⚠ Violação detectada: ${txt.slice(0, 80)}`,
      ts: Date.now(),
    });
    sessionEvent({ kind: "violation", violation: { text: txt.slice(0, 120) } });
    if (chatState.healthEl) {
      chatState.healthEl.textContent = `⚠ violação: ${txt.slice(0, 40)}`;
      chatState.healthEl.className = "pitchai-status err";
    }
    if (cfg?.protecaoGeral) {
      stopPitchLoop();
      activity.log({ type: "violation", text: "Proteção geral: IA pausada.", ts: Date.now() });
    }
  }

  async function clearViolation(cfg) {
    if (!auto.violationActive) return;
    auto.violationActive = false;
    updateHealth();
    if (cfg?.respostasIA && (chatState.observer || demo.isOn())) startPitchLoop();
  }

  async function violationTick() {
    const cfg = await loadConfig();
    if (!cfg.violacao) return;
    if (demo.isOn()) return; // em demo a violação é disparada manualmente
    const node = await mapNode("violation");
    const txt = (node?.textContent || "").replace(/\s+/g, " ").trim();
    const bad = !!txt && !/^0$|nenhum|sem viola|normal|saud[áa]vel|boa/i.test(txt);
    if (bad) await setViolation(txt, cfg);
    else await clearViolation(cfg);
  }
  function startViolationWatcher() {
    if (auto.violationTimer) return;
    auto.violationTimer = setInterval(() => {
      violationTick().catch(() => {});
    }, 10000);
    violationTick().catch(() => {});
  }

  // ---------- Encerrar LIVE pelo timer ----------
  async function clickEndLive() {
    if (extSecurity.isLocked) return false;
    const node = await mapNode("endLive");
    if (!node) return false;
    try {
      node.click();
      return true;
    } catch {
      return false;
    }
  }

  function showEndBanner(secs, onCancel) {
    if (auto.banner) auto.banner.remove();
    const bar = document.createElement("div");
    bar.className = "pitchai-endbanner";
    bar.textContent = `Encerrando a LIVE em ${secs}s…`;
    const btn = document.createElement("button");
    btn.className = "pitchai-btn";
    btn.textContent = "Cancelar";
    btn.addEventListener("click", onCancel);
    bar.appendChild(btn);
    document.body.appendChild(bar);
    auto.banner = bar;
    return bar;
  }

  async function finishLive(reason) {
    if (extSecurity.isLocked) return;
    if (auto.ended) return;
    auto.ended = true;
    const cfg = await loadConfig();
    stopPitchLoop();
    stopChatListener();
    const clicked = demo.isOn() ? true : await clickEndLive();
    activity.log({
      type: "live",
      text: demo.isOn()
        ? `Demo: a LIVE seria encerrada agora (${reason}). Nada foi clicado no TikTok.`
        : clicked
          ? `LIVE encerrada (${reason}).`
          : `Não achei o botão de encerrar (${reason}).`,
      ts: Date.now(),
    });
    await sessionEnd();
    if (auto.banner) {
      auto.banner.remove();
      auto.banner = null;
    }
  }

  function startLiveTimer() {
    if (auto.liveTimer) return;
    auto.liveStartedAt = Date.now();
    auto.liveTimer = setInterval(async () => {
      const cfg = await loadConfig();
      const et = cfg.encerrarTempo || {};
      if (!et.enabled || auto.ended) return;
      const limitMs = Math.max(1, Number(et.minutes) || 120) * 60000;
      const elapsed = Date.now() - auto.liveStartedAt;
      if (elapsed < limitMs) {
        if (auto.endingAt) {
          auto.endingAt = 0;
          if (auto.banner) {
            auto.banner.remove();
            auto.banner = null;
          }
        }
        return;
      }
      if (!auto.endingAt) {
        auto.endingAt = Date.now() + 15000;
        showEndBanner(15, () => {
          auto.endingAt = 0;
          auto.ended = true; // cancelado manualmente: não tenta de novo nesta sessão
          if (auto.banner) {
            auto.banner.remove();
            auto.banner = null;
          }
          activity.log({
            type: "live",
            text: "Encerramento automático cancelado.",
            ts: Date.now(),
          });
        });
        return;
      }
      const restante = Math.ceil((auto.endingAt - Date.now()) / 1000);
      if (restante > 0) {
        if (auto.banner) auto.banner.firstChild.textContent = `Encerrando a LIVE em ${restante}s… `;
        return;
      }
      await finishLive("timer");
    }, 1000);
  }

  let automationsStarted = false;
  function stopAutomations() {
    automationsStarted = false;
    stopPitchLoop();
    stopChatListener();
    try {
      auto.catalogObserver?.disconnect();
      auto.saleObserver?.disconnect();
      DM()?.stopWatchdog?.();
    } catch {}
    auto.catalogObserver = null;
    auto.saleObserver = null;
    [
      "catalogBoot",
      "catalogTimer",
      "catalogWatchdog",
      "pinTimer",
      "saleBoot",
      "saleCheck",
      "violationTimer",
      "liveTimer",
      "mapStatusTimer",
    ].forEach((key) => {
      try {
        clearInterval(auto[key]);
      } catch {}
      auto[key] = null;
    });
    clearTimeout(auto._catDebounce);
    clearTimeout(net._catDebounce);
    auto.catalogQueuedDeep = false;
    scanFx.setLicensed(false);
  }

  function startAutomations() {
    if (automationsStarted) return;
    automationsStarted = true;
    // 1º os SETORES, depois os alvos dentro deles
    try {
      RG()
        ?.resolveAll?.({ force: false })
        .catch(() => {});
    } catch {}
    try {
      RG()?.startWatcher?.();
    } catch {}
    try {
      DM()?.startWatchdog();
    } catch {}
    // publica o diagnóstico de detecção para o painel
    if (!auto.mapStatusTimer) {
      auto.mapStatusTimer = setInterval(publishMapStatus, 5000);
      try {
        DM()?.onChange(publishMapStatus);
      } catch {}
      try {
        RG()?.onChange?.(publishMapStatus);
      } catch {}
      publishMapStatus();
    }
    startCatalogWatcher();
    startAutoPin();
    startSaleWatcher();
    startViolationWatcher();
    startLiveTimer();
  }

  // ---------- Push-to-talk ----------
  function bindPushToTalk() {
    let down = false;
    document.addEventListener("keydown", async (e) => {
      const cfg = await loadConfig();
      if (!cfg.voz?.pushToTalk?.enabled) return;
      if (e.code !== cfg.voz.pushToTalk.key) return;
      if (down) return;
      down = true;
      try {
        audioEl?.pause();
      } catch {}
    });
    document.addEventListener("keyup", async (e) => {
      const cfg = await loadConfig();
      if (!cfg.voz?.pushToTalk?.enabled) return;
      if (e.code !== cfg.voz.pushToTalk.key) return;
      down = false;
    });
  }

  // ---------- Activity Panel (fila de chat + PiP) ----------
  const activity = (() => {
    const state = {
      items: [],
      nowSpeaking: null,
      root: null,
      listEl: null,
      nowEl: null,
      pipWin: null,
      pipRoot: null,
      filter: "all",
    };
    const MAX = 12;
    const TYPE_LABEL = {
      catalog: "vitrine",
      pin: "produto",
      sale: "venda",
      violation: "violação",
      pitch: "pitch",
      demo: "demonstração",
    };
    function statusColor(s) {
      return (
        {
          pending: "#71717a",
          processing: "#7C3AED",
          answered: "#00E676",
          ignored: "#52525b",
          blocked: "#FF3B3B",
          pending_review: "#FF6B35",
          failed: "#FF6B35",
          info: "#3f3f46",
        }[s] || "#71717a"
      );
    }
    function statusLabel(s, reason) {
      const base =
        {
          pending: "aguardando",
          processing: "processando…",
          answered: "respondido",
          ignored: "ignorado",
          blocked: "bloqueado",
          pending_review: "revisar",
          failed: "falhou",
          info: "atividade",
        }[s] || s;
      return reason ? `${base} · ${reason}` : base;
    }
    function isMessage(it) {
      return it.status !== "info";
    }
    function render() {
      if (!state.listEl) return;
      state.listEl.innerHTML = "";
      const source = state.filter === "msg" ? state.items.filter(isMessage) : state.items;
      const items = source.slice(-MAX).reverse();
      if (!items.length) {
        const p = document.createElement("p");
        p.className = "pitchai-empty";
        p.textContent = "Aguardando mensagens…";
        state.listEl.appendChild(p);
      } else {
        items.forEach((it) => {
          const row = document.createElement("div");
          row.className = "pitchai-msg";
          row.dataset.status = it.status;
          const meta = document.createElement("div");
          meta.className = "pitchai-msg-meta";
          const badge = document.createElement("span");
          badge.className = "pitchai-badge";
          badge.style.background = statusColor(it.status);
          badge.textContent = statusLabel(it.status, it.reason);
          meta.appendChild(badge);
          const typeLabel =
            it.status === "info" ? TYPE_LABEL[it.type] : it.type === "pitch" ? "pitch" : null;
          if (typeLabel) {
            const b2 = document.createElement("span");
            b2.className = "pitchai-badge";
            b2.style.background = "#27272a";
            b2.textContent = typeLabel;
            meta.appendChild(b2);
          }

          if (it.author) {
            const a = document.createElement("span");
            a.className = "pitchai-author";
            a.textContent = it.author;
            meta.appendChild(a);
          }
          const t = document.createElement("div");
          t.className = "pitchai-text";
          t.textContent = it.text;
          row.append(meta, t);
          if (it.reply) {
            const rp = document.createElement("div");
            rp.className = "pitchai-reply";
            rp.textContent = "IA: " + it.reply;
            row.appendChild(rp);
          }
          if (it.status === "pending_review" && it.reply) {
            const actions = document.createElement("div");
            actions.className = "pitchai-actions";
            const ok = document.createElement("button");
            ok.className = "pitchai-btn primary";
            ok.textContent = "▶ Falar";
            ok.onclick = async () => {
              const cfg = await loadConfig();
              markStatus(it.id, "answered", null, it.reply);
              await speakText(it.reply, cfg);
            };
            const no = document.createElement("button");
            no.className = "pitchai-btn";
            no.textContent = "✕ Pular";
            no.onclick = () => markStatus(it.id, "ignored", "descartado");
            actions.append(ok, no);
            row.appendChild(actions);
          }
          state.listEl.appendChild(row);
        });
      }
      if (state.nowEl) {
        state.nowEl.textContent = state.nowSpeaking
          ? `🔊 ${state.nowSpeaking.ctx}: ${state.nowSpeaking.text}`
          : "🔇 silêncio";
      }
      // mirror to PiP
      if (state.pipRoot) state.pipRoot.innerHTML = state.root.innerHTML;
    }
    function add(entry) {
      state.items.push(entry);
      render();
    }
    // Eventos internos (vitrine, produto fixado, venda, violação) NÃO são
    // respostas de chat — entram como "atividade", nunca com o selo RESPONDIDO.
    function log(entry) {
      state.items.push({ id: "p" + Date.now(), status: "info", ...entry });
      render();
    }
    function setFilter(f) {
      state.filter = f === "msg" ? "msg" : "all";
      if (state.filterBtn)
        state.filterBtn.textContent = state.filter === "msg" ? "Só mensagens" : "Tudo";
      render();
    }
    function toggleFilter() {
      setFilter(state.filter === "msg" ? "all" : "msg");
    }

    function markStatus(id, status, reason, reply) {
      const it = state.items.find((x) => x.id === id);
      if (!it) return;
      it.status = status;
      if (reason !== undefined) it.reason = reason;
      if (reply !== undefined) it.reply = reply;
      render();
    }
    function addPending(item, reply, cfg) {
      const it = state.items.find((x) => x.id === item.id);
      if (it) {
        it.status = "pending_review";
        it.reply = reply;
        render();
      }
    }
    function setNowSpeaking(v) {
      state.nowSpeaking = v;
      render();
    }

    function mount() {
      const root = document.createElement("div");
      root.className = "pitchai-activity";
      root.id = "pitchai-activity";
      const hd = document.createElement("div");
      hd.className = "pitchai-activity-hd";
      const title = document.createElement("span");
      title.innerHTML = "<b>Fila de chat</b> · IA ao vivo";
      const filterBtn = document.createElement("button");
      filterBtn.className = "pitchai-btn";
      filterBtn.dataset.pitchaiFilter = "1";
      filterBtn.title = "Alternar entre tudo e só mensagens do chat";
      filterBtn.textContent = "Tudo";
      filterBtn.onclick = () => toggleFilter();
      state.filterBtn = filterBtn;
      const pip = document.createElement("button");
      pip.className = "pitchai-btn";
      pip.textContent = "PiP";
      pip.title = "Abrir em janela flutuante (Picture-in-Picture)";
      pip.onclick = openPiP;
      const closeBtn = document.createElement("button");
      closeBtn.className = "pitchai-btn";
      closeBtn.textContent = "–";
      closeBtn.onclick = () => root.classList.toggle("minimized");
      hd.append(title, filterBtn, pip, closeBtn);

      const now = document.createElement("div");
      now.className = "pitchai-now";
      const list = document.createElement("div");
      list.className = "pitchai-msg-list";
      root.append(hd, now, list);
      document.body.appendChild(root);
      state.root = root;
      state.listEl = list;
      state.nowEl = now;
      render();
    }

    async function openPiP() {
      try {
        if (!("documentPictureInPicture" in window)) {
          alert("Este navegador não suporta Document Picture-in-Picture. Use Chrome 116+");
          return;
        }
        const pip = await window.documentPictureInPicture.requestWindow({
          width: 380,
          height: 520,
        });
        state.pipWin = pip;
        // copia estilos
        [...document.styleSheets].forEach((ss) => {
          try {
            const link = pip.document.createElement("style");
            link.textContent = [...ss.cssRules].map((r) => r.cssText).join("\n");
            pip.document.head.appendChild(link);
          } catch {}
        });
        pip.document.body.style.margin = "0";
        pip.document.body.style.background = "#0F0F1A";
        pip.document.body.style.color = "#f9fafb";
        const clone = state.root.cloneNode(true);
        clone.style.position = "static";
        clone.style.width = "100%";
        clone.style.height = "100vh";
        clone.style.borderRadius = "0";
        pip.document.body.appendChild(clone);
        state.pipRoot = clone;
        // o mirror é feito via innerHTML (perde listeners) → delegação de clique
        clone.addEventListener("click", (ev) => {
          const btn = ev.target && ev.target.closest && ev.target.closest("[data-pitchai-filter]");
          if (btn) toggleFilter();
        });

        pip.addEventListener("pagehide", () => {
          state.pipWin = null;
          state.pipRoot = null;
        });
      } catch (e) {
        alert("Não foi possível abrir PiP: " + (e?.message || e));
      }
    }

    return { mount, add, log, markStatus, addPending, setNowSpeaking, setFilter };
  })();

  const DEMO_ACK_KEY = "pitchai.demo.ack";
  function ackDemo(action, ok, message) {
    try {
      chrome.storage.local.set({ [DEMO_ACK_KEY]: { action, ok, message, ts: Date.now() } });
    } catch {}
    const isDiagnostic =
      action === "remap" || action === "catalogo" || String(action || "").startsWith("pick:");
    if (!ok || !isDiagnostic) {
      activity.log({
        type: ok ? "map" : "error",
        text: `${ok ? "✓" : "✗"} ${message}`,
        ts: Date.now(),
      });
    }
  }

  // ações que só fazem sentido com o Modo Demo ligado
  const DEMO_ONLY = new Set(["vitrine", "produto", "mensagem", "venda", "violacao", "pitch"]);

  async function runDemoCommand(action) {
    const map = {
      vitrine: async () => `Vitrine simulada: +${await demo.applyCatalog()} produto(s)`,
      produto: async () => {
        await demo.addFakeProduct();
        return "Produto fake adicionado";
      },
      mensagem: async () => {
        await demo.nextMessage();
        return "Mensagem simulada enviada para a fila";
      },
      venda: async () => {
        await demo.simulateSale();
        return "Venda simulada";
      },
      violacao: async () => {
        await demo.simulateViolation();
        return "Violação simulada";
      },
      voz: async () => {
        await demo.testVoice();
        return "Teste de voz executado";
      },
      pitch: async () => {
        await demo.runPitch();
        return "Pitch de teste gerado";
      },
      encerrar: async () => {
        await finishLive("demo manual");
        return "Live encerrada";
      },
      "pick:chat": async () => {
        await startPickMode("chat");
        return "Clique no chat da live";
      },
      "pick:products": async () => {
        await startPickMode("products");
        return "Clique na vitrine de produtos";
      },
      "pick:sales": async () => {
        await startPickMode("sales");
        return "Clique no painel de vendas";
      },
      "pick:violation": async () => {
        await startPickMode("violation");
        return "Clique no aviso/alerta de violação";
      },
      "pick:endLive": async () => {
        await startPickMode("endLive");
        return "Clique no botão de encerrar a LIVE";
      },
      // apontar SETORES inteiros (mais fácil que apontar o alvo exato)
      "region:products": async () => {
        await startPickMode("products", "region");
        return "Clique na área de PRODUTOS";
      },
      "region:chat": async () => {
        await startPickMode("chat", "region");
        return "Clique na área do CHAT";
      },
      "region:activity": async () => {
        await startPickMode("activity", "region");
        return "Clique na área de ATIVIDADE";
      },
      "region:analytics": async () => {
        await startPickMode("analytics", "region");
        return "Clique na área de ANÁLISE";
      },
      "region:studio": async () => {
        await startPickMode("studio", "region");
        return "Clique na área do ESTÚDIO (vídeo/LIVE)";
      },
      "region:topbar": async () => {
        await startPickMode("topbar", "region");
        return "Clique na BARRA SUPERIOR (avisos)";
      },

      "pick:reset": async () => {
        _mappingSelfWrite = Date.now();
        await DM()?.clearManual?.();
        await RG()?.clearManual?.();
        publishMapStatus();
        return "Apontamentos manuais apagados";
      },
      "map:push": async () => {
        const cfg = await loadConfig();
        if (!cfg?.syncToken) throw new Error("configure o token de sincronização primeiro");
        const payload = await buildMappingPayload();
        const r = await fetch(`${API_BASE}/api/public/live/mapping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "push", token: cfg.syncToken, payload }),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || "falhou ao enviar");
        const n = Object.keys(payload.targets).length + Object.keys(payload.regions).length;
        return `Mapeamento enviado (${n} apontamento(s))`;
      },
      "map:pull": async () => {
        const cfg = await loadConfig();
        if (!cfg?.syncToken) throw new Error("configure o token de sincronização primeiro");
        const r = await fetch(`${API_BASE}/api/public/live/mapping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pull", token: cfg.syncToken, host: location.host }),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) throw new Error(data?.error || "falhou ao baixar");
        const payload = data?.payload;
        if (!payload) throw new Error("nenhum mapeamento salvo para este site");
        _mappingSelfWrite = Date.now();
        await RG()?.importManual?.(payload.regions || {});
        await DM()?.importManual?.(payload.targets || {});
        publishMapStatus();
        const n =
          Object.keys(payload.targets || {}).length + Object.keys(payload.regions || {}).length;
        return `Mapeamento baixado (${n} apontamento(s))`;
      },

      catalogo: async () => {
        try {
          await DM()?.invalidate?.("products");
        } catch {}
        const n = await syncCatalog({ silent: true, deep: true });
        const total = (await loadConfig()).produtos?.length || 0;
        if (!total) throw new Error("nenhum produto encontrado — use 'Apontar vitrine'");
        return `Produtos: ${total} na live (+${n} novo(s))`;
      },
      remap: async () => {
        activity.log({ type: "map", text: "Remapeando setores e componentes…", ts: Date.now() });
        try {
          DM()?.invalidate("chat");
        } catch {}
        if (chatState.observer) {
          chatState.observer.disconnect();
          chatState.observer = null;
        }
        chatState.node = null;
        // setores primeiro — os alvos são procurados dentro deles
        let regions = {};
        try {
          regions = (await RG()?.resolveAll?.({ force: true })) || {};
        } catch {}
        const res = (await DM()?.remapAll()) || {};
        await startChatListener();
        publishMapStatus();
        const okRegions = Object.entries(regions)
          .filter(([, v]) => v?.found)
          .map(([k]) => k);
        const okList = Object.entries(res)
          .filter(([, v]) => v)
          .map(([k]) => k);
        if (net.isChatLive() && !okList.includes("chat")) okList.push("chat (rede)");
        if (net.products.size && !okList.includes("products")) okList.push("products (rede)");
        if (!okList.length && !okRegions.length)
          throw new Error("nenhum componente reconhecido nesta página");
        return `Setores: ${okRegions.join(", ") || "nenhum"} · Alvos: ${okList.join(", ") || "nenhum"}`;
      },
    };
    const fn = map[action];
    if (!fn) {
      ackDemo(action, false, `Ação desconhecida: ${action}`);
      return;
    }
    try {
      if (DEMO_ONLY.has(action) && !demo.isOn()) await demo.start();
      const msg = await fn();
      ackDemo(action, true, msg || "Concluído");
    } catch (e) {
      ackDemo(action, false, `Falhou (${action}): ${e?.message || e}`);
    }
  }

  // ---------- Modo "apontar elemento" ----------
  let pickState = null;
  async function startPickMode(target, kind = "target") {
    stopPickMode();
    const overlay = document.createElement("div");
    overlay.className = "pitchai-pick-overlay";
    const hint = document.createElement("div");
    hint.className = "pitchai-pick-hint";
    const nomes = {
      chat: kind === "region" ? "a ÁREA do CHAT" : "o CHAT",
      products: kind === "region" ? "a ÁREA de PRODUTOS" : "a VITRINE de produtos",
      sales: "o painel de VENDAS",
      activity: "a ÁREA de ATIVIDADE",
      analytics: "a ÁREA de ANÁLISE",
      studio: "a ÁREA do ESTÚDIO (vídeo / iniciar LIVE)",
    };
    hint.textContent = `Pitch AI: clique em ${nomes[target] || target}. ESC cancela.`;
    document.body.append(overlay, hint);

    const onMove = (ev) => {
      const el = ev.composedPath?.()[0] || ev.target;
      if (!(el instanceof HTMLElement) || el === overlay || el === hint) return;
      const r = el.getBoundingClientRect();
      overlay.style.transform = `translate(${r.left}px, ${r.top}px)`;
      overlay.style.width = `${r.width}px`;
      overlay.style.height = `${r.height}px`;
      pickState.hover = el;
    };
    const onClick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const el = pickState?.hover;
      stopPickMode();
      if (!el) return;
      // o container costuma ser o pai com vários filhos, não o item clicado
      let node = el;
      let hops = 0;
      const limit = kind === "region" ? 6 : 4;
      while (node.parentElement && node.children.length < 3 && hops++ < limit)
        node = node.parentElement;
      _mappingSelfWrite = Date.now();
      if (kind === "region") {
        await RG()?.setManual?.(target, node);
        try {
          DM()?.invalidate(target);
        } catch {}
      } else {
        await DM()?.setManual?.(target, node);
      }
      publishMapStatus();
      scheduleMappingPush();
      ackDemo(
        `${kind === "region" ? "region" : "pick"}:${target}`,
        true,
        kind === "region"
          ? `Setor "${target}" definido manualmente`
          : `Elemento definido manualmente para "${target}"`,
      );
      if (target === "chat") {
        if (chatState.observer) {
          chatState.observer.disconnect();
          chatState.observer = null;
        }
        chatState.node = null;
        await startChatListener();
      }
      if (target === "products") await syncCatalog({ silent: false, deep: true });
    };

    const onKey = (ev) => {
      if (ev.key === "Escape") stopPickMode();
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    pickState = { overlay, hint, onMove, onClick, onKey, hover: null };
  }
  function stopPickMode() {
    if (!pickState) return;
    document.removeEventListener("mousemove", pickState.onMove, true);
    document.removeEventListener("click", pickState.onClick, true);
    document.removeEventListener("keydown", pickState.onKey, true);
    pickState.overlay.remove();
    pickState.hint.remove();
    pickState = null;
  }

  // ---------- Header UI ----------
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k.startsWith("on") && typeof v === "function")
        node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    });
    children.flat().forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  async function mount() {
    const isTikTokPage = window.location.hostname.includes("tiktok.com");
    if (!isTikTokPage) {
      // Aba completa / Painel Web: não injeta a barra flutuante sobreposta
      return;
    }

    const cfg = await loadConfig();
    scanFx.mount();
    const unlocked = await checkExtensionLock(cfg.syncToken);
    activity.mount();
    bindPushToTalk();
    if (unlocked) startAutomations();
    // Revalida periodicamente para bloquear vencimentos e recuperar após
    // indisponibilidade temporária sem exigir que o usuário recarregue a página.
    window.setInterval(async () => {
      const current = await loadConfig();
      const licensed = await checkExtensionLock(current.syncToken);
      if (licensed) startAutomations();
      else stopAutomations();
    }, 60_000);

    const header = el("div", { class: "pitchai-header", id: "pitchai-header" });
    const logo = el("span", { class: "pitchai-logo" }, "Pitch AI ", el("b", {}, "LIVE"));
    const ver = el("span", { class: "pitchai-ver" }, "v" + extVersion());

    const health = el("span", { class: "pitchai-status", id: "pitchai-health" }, "…");
    chatState.healthEl = health;

    const master = el("button", {
      class: "pitchai-toggle" + (cfg.protecaoGeral ? " on" : ""),
      id: "pitchai-master",
      title: "Proteção geral",
    });
    master.addEventListener("click", async () => {
      const c = await loadConfig();
      if (!(await checkExtensionLock(c.syncToken))) return;
      c.protecaoGeral = !c.protecaoGeral;
      saveConfig(c);
      master.classList.toggle("on", c.protecaoGeral);
    });

    const scrapeBtn = el(
      "button",
      { class: "pitchai-btn", title: "Ler os produtos da live" },
      "🔄 Produtos",
    );
    scrapeBtn.addEventListener("click", async () => {
      const current = await loadConfig();
      if (!(await checkExtensionLock(current.syncToken))) {
        scrapeBtn.textContent = "Licença necessária";
        setTimeout(() => (scrapeBtn.textContent = "🔄 Produtos"), 2500);
        return;
      }
      scrapeBtn.textContent = "Lendo…";
      try {
        await DM()?.invalidate?.("products");
      } catch {}
      const novos = await syncCatalog({ silent: true, deep: true }).catch(() => 0);
      const c = await loadConfig();
      const total = c.produtos?.length || 0;
      if (!total) {
        scrapeBtn.textContent = "Nada encontrado";
        setTimeout(() => (scrapeBtn.textContent = "🔄 Produtos"), 2500);
        return;
      }
      activity.log({
        type: "catalog",
        text: `Produtos: ${total} na live (+${novos} novo(s))`,
        ts: Date.now(),
      });
      scrapeBtn.textContent = `✓ ${total} (+${novos})`;
      setTimeout(() => (scrapeBtn.textContent = "🔄 Produtos"), 2500);
    });

    const pickBtn = el(
      "button",
      { class: "pitchai-btn", title: "Apontar manualmente chat ou vitrine" },
      "🎯 Apontar",
    );
    pickBtn.addEventListener("click", () => {
      const alvo = window.prompt("Apontar qual elemento? Digite: chat, vitrine ou vendas", "chat");
      if (!alvo) return;
      const map = {
        chat: "pick:chat",
        vitrine: "pick:products",
        produtos: "pick:products",
        vendas: "pick:sales",
      };
      const cmd = map[alvo.trim().toLowerCase()];
      if (cmd) runDemoCommand(cmd);
    });

    const chatStatus = el("span", { class: "pitchai-status", id: "pitchai-chat-status" }, "0 msgs");
    chatState.statusEl = chatStatus;

    const listenBtn = el(
      "button",
      {
        class: "pitchai-btn" + (cfg.respostasIA ? " primary" : ""),
        id: "pitchai-listen",
        title: "Ligar/desligar leitura do chat",
      },
      cfg.respostasIA ? "🎙️ Ouvindo" : "🎙️ Ouvir",
    );
    listenBtn.addEventListener("click", async () => {
      const c = await loadConfig();
      c.respostasIA = !c.respostasIA;
      saveConfig(c);
      listenBtn.classList.toggle("primary", c.respostasIA);
      listenBtn.textContent = c.respostasIA ? "🎙️ Ouvindo" : "🎙️ Ouvir";
      if (c.respostasIA) {
        sessionStart();
        const ok = await startChatListener();
        if (!ok) {
          let tries = 0;
          const iv = setInterval(async () => {
            if ((await startChatListener()) || ++tries > 20) clearInterval(iv);
          }, 1000);
        }
      } else {
        stopChatListener();
        sessionEnd();
      }
    });

    const reviewBtn = el(
      "button",
      {
        class: "pitchai-btn" + (cfg.revisarAntesDeEnviar ? " primary" : ""),
        title: "Revisar cada resposta antes da IA falar",
      },
      cfg.revisarAntesDeEnviar ? "👀 Revisando" : "👀 Revisar",
    );
    reviewBtn.addEventListener("click", async () => {
      const c = await loadConfig();
      c.revisarAntesDeEnviar = !c.revisarAntesDeEnviar;
      saveConfig(c);
      reviewBtn.classList.toggle("primary", c.revisarAntesDeEnviar);
      reviewBtn.textContent = c.revisarAntesDeEnviar ? "👀 Revisando" : "👀 Revisar";
    });

    // ---- Modo Demo ----
    const demoBtn = el(
      "button",
      {
        class: "pitchai-btn" + (cfg.demo?.enabled ? " demo-on" : ""),
        id: "pitchai-demo",
        title: "Modo Demo: simula vitrine, chat, venda e violação sem live real",
      },
      cfg.demo?.enabled ? "🧪 Demo ON" : "🧪 Demo",
    );

    const tray = el("div", { class: "pitchai-demotray", id: "pitchai-demotray" });
    const trayBtn = (label, fn) => {
      const b = el("button", { class: "pitchai-btn" }, label);
      b.addEventListener("click", () => {
        Promise.resolve(fn()).catch(() => {});
      });
      return b;
    };
    tray.append(
      el("span", { class: "pitchai-demotray-title" }, "Simular:"),
      trayBtn("🛍 Vitrine", () => demo.applyCatalog()),
      trayBtn("➕ Produto fake", () => demo.addFakeProduct()),
      trayBtn("💬 Mensagem", () => demo.nextMessage()),
      trayBtn("🛒 Venda", () => demo.simulateSale()),
      trayBtn("⚠ Violação", () => demo.simulateViolation()),
      trayBtn("🔊 Testar voz", () => demo.testVoice()),
      trayBtn("📣 Pitch", () => demo.runPitch()),
      trayBtn("⏹ Encerrar (demo)", () => finishLive("demo manual")),
    );
    document.body.appendChild(tray);
    if (cfg.demo?.enabled) tray.classList.add("open");

    demoBtn.addEventListener("click", async () => {
      const on = await demo.toggle();
      demoBtn.classList.toggle("demo-on", on);
      demoBtn.textContent = on ? "🧪 Demo ON" : "🧪 Demo";
      tray.classList.toggle("open", on);
    });

    const openBtn = el("button", { class: "pitchai-btn primary", id: "pitchai-open" }, "Painel ▾");
    const tabBtn = el(
      "button",
      {
        class: "pitchai-btn",
        id: "pitchai-open-tab",
        title: "Abrir o painel em uma aba separada",
      },
      "↗",
    );
    tabBtn.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome?.runtime?.getURL) {
        window.open(chrome.runtime.getURL("panel.html"), "_blank");
      } else {
        window.open("/app", "_blank");
      }
    });

    header.append(
      logo,
      ver,
      health,
      master,
      scrapeBtn,
      pickBtn,
      listenBtn,
      reviewBtn,
      chatStatus,
      demoBtn,
      openBtn,
      tabBtn,
    );
    document.body.appendChild(header);

    if (cfg.respostasIA) {
      sessionStart();
      let tries = 0;
      const iv = setInterval(async () => {
        if ((await startChatListener()) || ++tries > 30) clearInterval(iv);
      }, 1000);
    }

    const frame = el("div", { class: "pitchai-panel-frame", id: "pitchai-frame" });
    const iframe = el("iframe", {
      src: chrome.runtime.getURL("panel.html"),
      allow: "camera; microphone; display-capture; autoplay",
    });
    frame.appendChild(iframe);
    document.body.appendChild(frame);

    openBtn.addEventListener("click", () => {
      frame.classList.toggle("open");
      openBtn.textContent = frame.classList.contains("open") ? "Painel ▴" : "Painel ▾";
    });

    if (cfg.demo?.enabled) demo.start().catch(() => {});

    // Se a conta já tem apontamentos salvos e este navegador não, baixa
    setTimeout(() => {
      pullMappingIfEmpty().catch(() => {});
    }, 4000);

    // Comandos vindos do painel (iframe/aba) via chrome.storage
    chrome.storage.onChanged.addListener((changes) => {
      const c = changes[STORAGE_KEY]?.newValue;
      if (c) {
        document.getElementById("pitchai-master")?.classList.toggle("on", !!c.protecaoGeral);
        const wants = !!c.demo?.enabled;
        if (wants !== demo.isOn()) {
          (wants ? demo.start() : demo.stop()).catch(() => {});
          demoBtn.classList.toggle("demo-on", wants);
          demoBtn.textContent = wants ? "🧪 Demo ON" : "🧪 Demo";
          tray.classList.toggle("open", wants);
        }
      }
      // Mapeamento importado pelo painel → recarrega e reaplica
      if (
        (changes[DM_MANUAL_KEY] || changes[RG_MANUAL_KEY]) &&
        Date.now() - _mappingSelfWrite > 3000
      ) {
        _mappingSelfWrite = Date.now();
        (async () => {
          try {
            await RG()?.reloadManual?.();
            await DM()?.reloadManual?.();
            publishMapStatus();
            activity.log({
              type: "map",
              text: "Mapeamento importado e reaplicado",
              ts: Date.now(),
            });
          } catch {}
        })();
      }
      const cmd = changes[DEMO_CMD_KEY]?.newValue;
      const cmdTs = cmd?.ts || cmd?.at || 0;
      if (cmd?.action && cmdTs !== lastCmdTs) {
        lastCmdTs = cmdTs;
        runDemoCommand(cmd.action);
      }
    });
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();

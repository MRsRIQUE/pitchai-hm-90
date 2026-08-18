// Pitch AI — injects Live control bar + activity panel into TikTok Shop
(function () {
  if (window.__pitchaiInjected) return;
  window.__pitchaiInjected = true;

  // Notifica o site do Pitch AI que a extensão está instalada
  try {
    window.pitchAiExtensionInstalled = true;
    window.dispatchEvent(
      new CustomEvent("pitchai-extension-detected", {
        detail: { version: chrome.runtime.getManifest().version },
      }),
    );

    // Allowlist de origins aceitos pelo content script — evita que iframes/scripts
    // maliciosos injetem sync tokens fake ou captured network payloads.
    const ALLOWED_ORIGINS = ["https://shop.tiktok.com", location.origin];
    function isAllowedOrigin(origin) {
      return ALLOWED_ORIGINS.indexOf(origin) !== -1;
    }

    window.addEventListener("message", (event) => {
      if (!isAllowedOrigin(event.origin)) return;
      if (event.data && event.data.type === "PITCHAI_SYNC_TOKEN" && event.data.token) {
        if (typeof chrome !== "undefined" && chrome?.storage?.local) {
          chrome.storage.local.get(["pitchai.config.v1"], async (res) => {
            const current = (await decryptConfigObj(res["pitchai.config.v1"] || {})) || {};
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
    return "https://pitchai-hm.vercel.app";
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

  // PBKDF2 com 600k iterações custa centenas de ms. Sem cache, cada loadConfig/
  // saveConfig derivava a chave de novo e a barra travava a cada clique.
  // A chave é a mesma durante toda a vida da página (mesmo salt + mesma seed).
  const _keyCache = new Map();

  async function getStorageKey(seed) {
    const extensionId = chrome.runtime?.id || "pitchai";
    const keySeed = seed || `pitchai-extension:${extensionId}`;
    const cached = _keyCache.get(keySeed);
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
    _keyCache.set(keySeed, pending);
    const key = await pending;
    // chave inválida não fica no cache — na próxima tentativa deriva de novo
    if (!key) _keyCache.delete(keySeed);
    return key;
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
          chrome.storage.local.set({ [STORAGE_KEY]: migrated });
        }
        return decoded;
      } catch {}
    }
    return {};
  }

  // Trava de segurança da extensão e verificação de cota de tokens
  const extSecurity = {
    isLocked: true,
    aiLocked: false,
    syncToken: "",
    reason: "verification_pending",
    message: "Aguardando confirmação da licença.",
    plan: "free",
    remainingChat: 0,
    remainingTts: 0,
    tokenRemaining: 0,
    tokenLimit: 0,
    upgrade: null,
    bannerEl: null,
  };

  async function checkExtensionLock(syncToken) {
    extSecurity.syncToken = String(syncToken || "");
    if (!syncToken) {
      extSecurity.isLocked = true;
      extSecurity.aiLocked = false;
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
        extSecurity.aiLocked = Boolean(data.aiLocked || data.reason === "quota_exceeded");
        extSecurity.reason = extSecurity.aiLocked ? "quota_exceeded" : null;
        extSecurity.message = extSecurity.aiLocked ? data.message || "Cota de IA esgotada." : null;
        extSecurity.plan = data.plan || "free";
        extSecurity.remainingChat = data.remainingChat ?? 0;
        extSecurity.remainingTts = data.remainingTts ?? 0;
        extSecurity.tokenRemaining = data.tokenRemaining ?? 0;
        extSecurity.tokenLimit = data.tokenLimit ?? 0;
        extSecurity.upgrade = data.upgrade || null;
        updateLockUI();
        return true;
      } else {
        extSecurity.isLocked = true;
        extSecurity.aiLocked = false;
        extSecurity.reason = data.reason || "unauthorized";
        extSecurity.message =
          data.message || "Extensão travada por segurança. Token inválido ou cota esgotada.";
        extSecurity.plan = data.plan || "free";
        extSecurity.remainingChat = data.remainingChat ?? 0;
        extSecurity.remainingTts = data.remainingTts ?? 0;
        extSecurity.tokenRemaining = data.tokenRemaining ?? 0;
        extSecurity.tokenLimit = data.tokenLimit ?? 0;
        extSecurity.upgrade = data.upgrade || null;
        updateLockUI();
        return false;
      }
    } catch {
      // Falha fechada: sem confirmação do servidor, nenhuma automação é liberada.
      extSecurity.isLocked = true;
      extSecurity.aiLocked = false;
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
        btn.id = "pitchai-lock-action";
        btn.textContent = "Desbloquear no Pitch AI ↗";
        btn.style.cssText =
          "background:#eab308;color:#000;border:none;padding:4px 12px;border-radius:4px;font-weight:700;cursor:pointer;";
        banner.append(text, btn);
        document.body?.prepend(banner);
      }
      const text = document.getElementById("pitchai-lock-text");
      if (text)
        text.textContent = `🔒 EXTENSÃO TRAVADA · ${extSecurity.message || "Insira seu Sync token válido."}`;
      const btn = document.getElementById("pitchai-lock-action");
      if (btn) {
        const isQuota = extSecurity.reason === "quota_exceeded";
        btn.textContent = isQuota
          ? extSecurity.upgrade?.cta || "Ver plano com mais tokens ↗"
          : "Desbloquear no Pitch AI ↗";
        btn.onclick = () => {
          const target = isQuota ? extSecurity.upgrade?.url || "/planos" : "/app";
          window.open(new URL(target, API_BASE).href, "_blank");
        };
      }
    } else if (banner) {
      banner.remove();
    }
  }

  const STORAGE_KEY = "pitchai.config.v1";
  const PENDING_SYNC_KEY = "pitchai.pendingSyncToken";
  const SYNC_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const DEMO_CMD_KEY = "pitchai.demo.cmd";
  let lastCmdTs = 0;
  const MAP_STATUS_KEY = "pitchai.dommap.status";
  const LIVE_STATE_KEY = "pitchai.live.state";
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
    return [p?.pid, p?.name, p?.price, p?.description, p?.imageUrl, p?.stock]
      .map((value) => String(value || "").trim())
      .join("\u241f");
  }

  /**
   * Normaliza o produto cru da API antes de guardar.
   *
   * O hook.js entrega o payload como o TikTok escreveu (`image`, pre\u00e7o s\u00f3 como
   * texto); daqui para frente o formato \u00e9 o que o painel consome. Converter na
   * entrada evita ter que lembrar disso em cada ponto de consumo.
   */
  function normalizeNetProduct(p) {
    const centavos = parsePriceCents(p?.price);
    const moeda = currencyFromPrice(p?.price);
    const foto = isUsableImageUrl(p?.imageUrl)
      ? String(p.imageUrl).trim()
      : isUsableImageUrl(p?.image)
        ? String(p.image).trim()
        : "";

    const normalizado = { ...p };
    delete normalizado.image;
    if (centavos) normalizado.priceCents = centavos.cents;
    if (centavos?.maxCents) normalizado.priceMaxCents = centavos.maxCents;
    if (moeda) normalizado.currency = moeda;
    if (foto) normalizado.imageUrl = foto;
    else delete normalizado.imageUrl;
    return normalizado;
  }

  function onNetProducts(list) {
    let changed = 0;
    for (const raw of list) {
      const p = normalizeNetProduct(raw);
      if (isBadProductName(p.name)) continue;
      let key = p.pid ? `#${p.pid}` : normKey(p.name);
      if (!key || key === "#") continue;
      // A API pode repetir o mesmo produto em blocos/SKUs diferentes. Consolida
      // pelo nome antes de guardar, evitando que cada clique em atualizar some
      // outra variante da mesma mercadoria.
      const equivalent = Array.from(net.products.entries()).find(([, existing]) =>
        namesMatch(existing?.name || "", p.name || ""),
      );
      if (equivalent) key = equivalent[0];
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
    if (!replyAutomationEnabled(cfg)) return;
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
    // Um único evento de click. Antes o código disparava MouseEvent("click") e
    // depois .click(), fazendo alguns botões React alternarem duas vezes.
    try {
      target.click();
    } catch {
      try {
        target.dispatchEvent(new MouseEvent("click", { ...base, buttons: 0 }));
      } catch {}
    }
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
    responderNoChat: false,
    notificacoesVenda: true,
    voz: {
      id: "nova",
      speed: 1.0,
      gain: 1.0,
      monitor: { enabled: false, volume: 0.6 },
      pushToTalk: { enabled: false, key: "Space" },
    },

    vozContextos: { default: null, greeting: null, offer: null, farewell: null },
    filtros: { blacklist: [], whitelist: [], usarListaPadrao: true },
    revisarAntesDeEnviar: false,
    pitchBank: {
      enabled: true,
      variants: 12,
      ttlMinutes: 60,
      minIntervalSec: 45,
      maxIntervalSec: 75,
      cacheReplies: true,
    },
    produtos: [],
    aiContext: {},
    ultimoRoteiro: "",
    roteirosPorProduto: {},
    somVenda: { enabled: true, volume: 0.8 },
    demo: { enabled: false, velocidade: 1, comChat: true, comVendas: true, comViolacao: false },
    syncToken: "",
  };

  /**
   * Aplica os defaults preservando os sub-objetos (voz, filtros, demo…).
   * Espelha o normalizeConfig do painel para que os dois lados enxerguem
   * exatamente a mesma forma de config.
   */
  function normalizeConfig(raw) {
    const stored = raw && typeof raw === "object" ? raw : {};
    return {
      ...DEFAULTS,
      ...stored,
      autoFixar: { ...DEFAULTS.autoFixar, ...(stored.autoFixar || {}) },
      encerrarTempo: { ...DEFAULTS.encerrarTempo, ...(stored.encerrarTempo || {}) },
      voz: {
        ...DEFAULTS.voz,
        ...(stored.voz || {}),
        monitor: { ...DEFAULTS.voz.monitor, ...(stored.voz?.monitor || {}) },
        pushToTalk: { ...DEFAULTS.voz.pushToTalk, ...(stored.voz?.pushToTalk || {}) },
      },
      vozContextos: { ...DEFAULTS.vozContextos, ...(stored.vozContextos || {}) },
      filtros: { ...DEFAULTS.filtros, ...(stored.filtros || {}) },
      pitchBank: { ...DEFAULTS.pitchBank, ...(stored.pitchBank || {}) },
      somVenda: { ...DEFAULTS.somVenda, ...(stored.somVenda || {}) },
      demo: { ...DEFAULTS.demo, ...(stored.demo || {}) },
      produtos: Array.isArray(stored.produtos) ? stored.produtos : [],
    };
  }

  function replyAutomationEnabled(cfg) {
    return !!(cfg?.respostasIA || cfg?.responderNoChat);
  }

  async function loadConfig() {
    return new Promise((res) => {
      chrome.storage.local.get([STORAGE_KEY], async (r) => {
        const raw = r[STORAGE_KEY];
        if (!raw) return res(normalizeConfig(null));
        // Se está cifrado (__enc/__iv presentes), decifra. Se não, usa direto
        // (compat com configs gravadas por versões anteriores que não cifravam).
        const decrypted = await decryptConfigObj(raw);
        res(normalizeConfig(decrypted));
      });
    });
  }

  async function loadConfigWithPendingSync() {
    const config = await loadConfig();
    const pending = await new Promise((resolve) => {
      try {
        chrome.storage.local.get([PENDING_SYNC_KEY], (result) =>
          resolve(result?.[PENDING_SYNC_KEY] || ""),
        );
      } catch {
        resolve("");
      }
    });
    if (!SYNC_UUID_RE.test(String(pending || ""))) return config;
    config.syncToken = String(pending);
    const encrypted = await encryptConfigObj(config);
    await chrome.storage.local.set({ [STORAGE_KEY]: encrypted });
    await chrome.storage.local.remove(PENDING_SYNC_KEY);
    return config;
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
  const session = {
    id: null,
    token: null,
    startedAt: 0,
    starting: null,
    lastMetricsFingerprint: "",
    lastMetricsAt: 0,
  };
  async function sessionStart() {
    if (demo?.isOn?.()) return null;
    const cfg = await loadConfigWithPendingSync();
    if (!cfg.syncToken) return null;
    if (session.id) return session.id;
    if (session.starting) return session.starting;
    session.starting = (async () => {
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
        return session.id;
      } catch (e) {
        console.warn("[Pitch AI] session start failed", e);
        return null;
      } finally {
        session.starting = null;
      }
    })();
    return session.starting;
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
    session.lastMetricsFingerprint = "";
    session.lastMetricsAt = 0;
  }
  async function sessionEvent(payload) {
    if (demo?.isOn?.()) return;
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
    /^(adicionar|fixar|desafixar|destacar|editar|excluir|vender|ver mais|todos|produtos?|vitrine|estoque|pedidos?|apresentar|remover|comprar|carrinho|adicionado ao carrinho|cliques?)(?:\s*\d+)?$/i;
  const PRODUCT_CHROME_RX =
    /(gerenciador\s+de\s+live|pesquisar\s+id|todas\s+as\s+categorias|todo\s+o\s+estoque|lista\s+de\s+produtos\s+nesta\s+live|portugu[eê]s\s+do\s+brasil|\bsair\b|pitcha[ií]\s+live)/i;
  const PRODUCT_META_RX =
    /(em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em|frete\s+gr[áa]tis|vendidos?|sold|estoque:?\s*\d+)/i;
  // Rabo numérico que sobra quando o rótulo é cortado do texto ("...em estoque"
  // deixa ": 18,8 mil", "...solicitada" deixa ": 0"). Não é descrição de nada.
  const COUNTER_LINE_RX = /^:?\s*[\d.,]+\s*(mil|un(id\.?)?|pcs?|peças?)?\s*$/i;
  const PRODUCT_UI_RX =
    /^(?:carrinho|adicionado ao carrinho|cliques?|fixar|desafixar|editar|excluir|remover|mover para o topo|demonstra[çc][ãa]o solicitada)(?:\s*\d+)?$/i;
  // rótulos de menu de conta que grudam no nome do perfil (ex.: "arthurdias993Sair")
  const MENU_TAIL_RX =
    /\s*(sair|log ?out|perfil|meu perfil|minha conta|configura[çc][õo]es|central do vendedor|ajuda|notifica[çc][õo]es)\s*$/i;
  // handles de conta: "arthurdias993", "@loja.oficial"
  const HANDLE_RX = /^@?[a-z][a-z0-9._-]{2,}\d{0,6}$/i;

  // Os títulos mais compridos do catálogo real ficam perto de 160 caracteres;
  // textContent de container passa de 200. Mesmo teto do ProductSchema.
  const MAX_PRODUCT_NAME_LEN = 200;
  // Emenda de textContent: as palavras grudam na fronteira entre elementos
  // irmãos ("relâmpagoRecompensa"). Exige 3 minúsculas antes da maiúscula porque
  // marca não é emenda — "iPhone", "20000mAh" e "MagSafe" têm no máximo 2.
  const GLUED_WORDS_RX = /\p{Ll}{3}\p{Lu}/gu;
  // Nome real chega a 3 somando marcas ("PowerBank ... SmartWatch"); o lixo
  // importado tinha 9.
  const MAX_GLUED_WORDS = 3;
  // Estado vazio da vitrine. Não ancorado: aparece sozinho e emendado no meio.
  const EMPTY_STATE_RX =
    /(ainda\s+n[ãa]o\s+h[áa]\s+produtos|produtos\s+adicionados\s+aparecer[ãa]o|apenas\s+para\s+espectadores)/i;

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
    // Comprimento medido no bruto: cleanName trunca em 200 e esconderia o excesso.
    const raw = String(name || "")
      .replace(/\s+/g, " ")
      .trim();
    if (raw.length > MAX_PRODUCT_NAME_LEN) return true;

    const cleaned = cleanName(name);
    const key = normKey(cleaned);
    if (!key || key.length < 4) return true;
    // Emendas e estado vazio não dependem de conhecer os rótulos do TikTok —
    // continuam valendo quando ele renomeia os botões.
    if ((cleaned.match(GLUED_WORDS_RX) || []).length > MAX_GLUED_WORDS) return true;
    if (EMPTY_STATE_RX.test(cleaned)) return true;
    if (PRODUCT_CHROME_RX.test(cleaned)) return true;
    if (BADGE_RX.test(cleaned) || JUNK_NAME_RX.test(cleaned) || PRODUCT_UI_RX.test(cleaned))
      return true;
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
    // Prefixos longos são truncamentos comuns da lista virtualizada do TikTok.
    if (longer.startsWith(shorter) && shorter.length >= 24) return true;
    const ta = new Set(ka.split(/\s+/).filter((w) => w.length > 1));
    const tb = new Set(kb.split(/\s+/).filter((w) => w.length > 1));
    const shortSet = ta.size <= tb.size ? ta : tb;
    const longSet = ta.size <= tb.size ? tb : ta;
    if (shortSet.size < 4) return false;
    let common = 0;
    shortSet.forEach((word) => {
      if (longSet.has(word)) common++;
    });
    // Une apenas variantes muito próximas; produtos da mesma marca continuam separados.
    return common / shortSet.size >= 0.86 && common / longSet.size >= 0.58;
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
    if (item.imageUrl && !prev.imageUrl) prev.imageUrl = item.imageUrl;
    // Preço numérico anda junto com o texto: se um card trouxe a faixa e outro o
    // valor único, misturar os dois mostraria um mínimo que não é do mesmo preço.
    if (item.priceCents != null) {
      prev.priceCents = item.priceCents;
      if (item.priceMaxCents != null) prev.priceMaxCents = item.priceMaxCents;
      else delete prev.priceMaxCents;
      if (item.currency) prev.currency = item.currency;
    }
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

  /**
   * Corta o rabo de metadados do card (cronômetro de oferta, estoque, frete)
   * que a emenda do textContent cola no fim do título.
   *
   * O primeiro replace desgruda só o rótulo com inicial maiúscula colado em
   * minúscula ("CozinhaTermina em" → "Cozinha Termina em"): assim o split com
   * \b passa a enxergar a fronteira, e palavras que só CONTÊM o rótulo ficam
   * inteiras ("Kit Determina em Pó" não vira "Kit Dete"). Sem o passo anterior,
   * o \b nunca casa no texto emendado e o cronômetro sobrevive no nome.
   */
  function stripProductMeta(raw) {
    let s = String(raw || "");
    s = s.replace(
      /(\p{Ll})(Termina\s+em|Em\s+estoque|Demonstra[çc][ãa]o\s+solicitada|Frete\s+gr[áa]tis)/gu,
      "$1 $2",
    );
    s =
      s.split(
        /\b(?:em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em|frete\s+gr[áa]tis)\b/i,
      )[0] || s;
    // Sobras do cronômetro/promoção quando vêm depois do trecho cortado.
    s = s.replace(/(?:\s*\d{1,2}:\d{2}:\d{2}\s*)+$/, "");
    s = s.replace(/\s+(?:de|por)$/i, "");
    return cleanName(s);
  }

  function inferNameFromProductText(text, price) {
    let s = cleanName(text);
    s = s.replace(/^\d+\s+/, "");
    if (price) s = s.split(price)[0] || s;
    s = stripProductMeta(s);
    s = s.replace(/\s+R\$\s?\d[\d.,].*$/i, "");
    s = s.replace(/\s+\d+\s*$/, "");
    return cleanName(s);
  }

  /**
   * Linhas úteis para descrição: separa o texto nos metadados do card e joga
   * fora preço, badge, rótulo de UI e contador. Sem isso a descrição vira o
   * resto emendado do card ("R$ 33,99Em estoque: 18,8 milDemonstração...").
   */
  function descriptionLines(text) {
    return String(text || "")
      .split(/[\n·|]|\b(?:em\s+estoque|demonstra[çc][ãa]o\s+solicitada|termina\s+em)\b/i)
      .map(cleanName)
      .filter(
        (l) =>
          l.length > 3 &&
          !BADGE_RX.test(l) &&
          !PRICE_RX.test(l) &&
          !PRODUCT_META_RX.test(l) &&
          !COUNTER_LINE_RX.test(l),
      );
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
    let repaired = false;
    const keep = new Map();
    const keepIdx = new Map(); // normKey(name) -> chave em keep (O(1) sem varrer o mapa)
    cfg.produtos.forEach((p) => {
      // Nomes gravados antes do filtro novo trazem o cronômetro da oferta colado
      // ("...CozinhaTermina em 04:08:53De"): corta o rabo em vez de derrubar o
      // produto, que pode ser o ativo e ter edição manual do usuário.
      const nome = stripProductMeta(p.name || "");
      if (nome && nome !== p.name) {
        p.name = nome;
        repaired = true;
      }
      // Descrição que começa com preço é resto emendado do card
      // ("R$ 33,99Em estoque: 18,8 milDemonstração..."), não texto do usuário.
      const desc = String(p.description || "");
      if (/^(de|por)?\s*(R\$|US\$|\$|€|£)\s?\d/i.test(desc)) {
        const limpa = descriptionLines(desc).join(" · ").slice(0, 400);
        if (limpa !== desc) {
          p.description = limpa;
          repaired = true;
        }
      }
      if (shouldDropStoredProduct(p)) return;
      if (!productKey(p)) return;
      upsertProduct(keep, p, keepIdx);
    });
    cfg.produtos = Array.from(keep.values());
    if (!cfg.produtos.some((p) => p.active) && cfg.produtos[0]) cfg.produtos[0].active = true;
    return repaired || cfg.produtos.length !== before;
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

  // ---------- Preço em centavos e foto do produto ----------
  // O painel formata a partir de priceCents/imageUrl (ver sections/produto.ts);
  // `price` continua sendo o texto, para o catálogo antigo já gravado.

  /** Símbolo escrito na vitrine → ISO 4217. */
  const CURRENCY_BY_SYMBOL = { R$: "BRL", US$: "USD", $: "USD", "€": "EUR", "£": "GBP" };
  /** Liga os dois lados de uma faixa. "De X por Y" fica fora: é preço riscado. */
  const PRICE_RANGE_SEP_RX = /^\s*[-–—~]\s*$/;
  /** Teto combinado com o painel: acima disso ele ignora e cai no fallback. */
  const MAX_IMAGE_URL_LEN = 2048;

  /**
   * Converte o número escrito pela vitrine em centavos.
   *
   * Quem decide o separador decimal é a quantidade de dígitos depois dele, não o
   * símbolo: assim "R$ 1.299" (milhar) e "R$ 89,90" (centavo) saem certos sem
   * depender de a página estar em pt-BR.
   */
  function numberToCents(raw) {
    const limpo = String(raw)
      .replace(/[^\d.,]/g, "")
      .replace(/[.,]+$/, "");
    if (!limpo) return null;

    const posDecimal = Math.max(limpo.lastIndexOf(","), limpo.lastIndexOf("."));
    let inteiros = limpo;
    let centavos = "00";
    if (posDecimal >= 0) {
      const fracao = limpo.slice(posDecimal + 1);
      // 3 dígitos depois do separador é milhar ("1.299"), não centavo.
      if (fracao.length === 1 || fracao.length === 2) {
        inteiros = limpo.slice(0, posDecimal);
        centavos = fracao.padEnd(2, "0");
      }
    }

    const digitos = inteiros.replace(/\D/g, "");
    // Acima de 9 dígitos não é preço: é id de produto que escapou do PRICE_RX.
    if (!digitos || digitos.length > 9) return null;
    return Number(digitos) * 100 + Number(centavos);
  }

  /**
   * Preço em centavos. Devolve null quando não há preço — nunca 0, que é um
   * preço válido e faria o painel anunciar o produto de graça.
   */
  function parsePriceCents(raw) {
    if (!raw) return null;
    const texto = String(raw);
    const rx = new RegExp(PRICE_RX.source, "gi");
    const achados = [];
    let m;
    while ((m = rx.exec(texto)) !== null) {
      const cents = numberToCents(m[0]);
      if (cents !== null) achados.push({ cents, inicio: m.index, fim: m.index + m[0].length });
    }
    if (!achados.length) return null;

    for (let i = 1; i < achados.length; i++) {
      if (!PRICE_RANGE_SEP_RX.test(texto.slice(achados[i - 1].fim, achados[i].inicio))) continue;
      const menor = Math.min(achados[i - 1].cents, achados[i].cents);
      const maior = Math.max(achados[i - 1].cents, achados[i].cents);
      if (menor !== maior) return { cents: menor, maxCents: maior };
    }
    return { cents: Math.min(...achados.map((a) => a.cents)) };
  }

  /** Moeda lida do símbolo; undefined quando não há preço (o painel assume BRL). */
  function currencyFromPrice(raw) {
    const simbolo = String(raw || "").match(PRICE_RX)?.[1];
    return simbolo ? CURRENCY_BY_SYMBOL[simbolo.toUpperCase()] : undefined;
  }

  /**
   * URL que sobrevive à viagem até o painel. Só http(s): `blob:` morre fora da
   * aba do TikTok e `data:` estoura o doc de 1 MiB no Firestore. Domínio não é
   * filtrado de propósito — a CDN do TikTok rotaciona host.
   */
  function isUsableImageUrl(url) {
    if (!url) return false;
    const limpo = String(url).trim();
    if (limpo.length > MAX_IMAGE_URL_LEN) return false;
    return /^https?:\/\/\S+$/i.test(limpo);
  }

  /**
   * Maior resolução de um srcset. A vírgula só separa candidatos quando vem
   * antes de outra URL — a própria URL da CDN tem vírgula no recorte.
   */
  function pickBestSrcsetUrl(srcset) {
    if (!srcset) return "";
    let melhor = "";
    let melhorPeso = -1;
    for (const parte of String(srcset).split(/,\s+(?=https?:\/\/|\/)/)) {
      const [url, descritor] = parte.trim().split(/\s+/);
      if (!url) continue;
      const peso = descritor ? parseFloat(descritor) || 1 : 1;
      if (peso > melhorPeso) {
        melhorPeso = peso;
        melhor = url;
      }
    }
    return melhor;
  }

  /**
   * Foto do produto no card. Pula avatar — é para isso que looksLikeAvatar
   * existe — e prefere o srcset, que traz a resolução maior; o src costuma vir
   * na miniatura borrada que o TikTok usa enquanto carrega.
   */
  function extractImageUrl(card, imgs) {
    for (const img of imgs || []) {
      if (looksLikeAvatar(img)) continue;
      const candidata =
        pickBestSrcsetUrl(img.getAttribute?.("srcset")) || (img.getAttribute?.("src") || "").trim();
      if (isUsableImageUrl(candidata)) return candidata;
    }

    // Muito card do TikTok pinta a foto como background em vez de <img>.
    try {
      const comFundo = [card, ...Array.from(card.querySelectorAll("[style*='image']")).slice(0, 4)];
      for (const el of comFundo) {
        const url = (getComputedStyle(el).backgroundImage || "").match(
          /url\(["']?(.*?)["']?\)/,
        )?.[1];
        if (isUsableImageUrl(url)) return url;
      }
    } catch {}

    return "";
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

  /**
   * textContent emenda o texto de elementos irmãos sem espaço
   * ("CozinhaTermina em 04:08:53"), e os filtros — feitos para texto com
   * espaço — deixam o lixo passar. textOf junta os nós de texto com espaço,
   * como o innerText faria, mas sem forçar layout a cada card varrido.
   */
  function textOf(el) {
    let out = "";
    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const v = (n.nodeValue || "").trim();
        if (v) out += `${v} `;
      }
    } catch {
      out = el?.textContent || "";
    }
    return out.replace(/\s+/g, " ").trim();
  }

  /** Extrai nome/preço/descrição de um card, exigindo evidência mínima. */
  function parseProductCard(card) {
    const text = textOf(card);
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
      // O cronômetro da oferta mora dentro do próprio título: sem o strip, o
      // candidato bom era recusado pelo PRODUCT_META_RX e sobrava só o lixo.
      const s0 = stripProductMeta(t.getAttribute?.("title") || textOf(t));
      if (
        s0.length >= 4 &&
        !PRICE_RX.test(s0) &&
        !BADGE_RX.test(s0) &&
        !JUNK_NAME_RX.test(s0) &&
        !PRODUCT_UI_RX.test(s0) &&
        !PRODUCT_META_RX.test(s0)
      ) {
        name = s0;
        break;
      }
    }
    if (!name) {
      const img = imgs.find((i) => !looksLikeAvatar(i) && i.getAttribute("alt"));
      const alt = cleanName(img?.getAttribute("alt") || "");
      if (
        alt.length >= 4 &&
        !BADGE_RX.test(alt) &&
        !JUNK_NAME_RX.test(alt) &&
        !PRODUCT_UI_RX.test(alt)
      )
        name = alt;
    }
    if (!name) {
      const aria = cleanName(card.getAttribute?.("aria-label") || "");
      if (aria.length >= 4 && !BADGE_RX.test(aria) && !PRODUCT_UI_RX.test(aria)) name = aria;
    }
    if (!name) {
      const linhas = text.split(/[\n·|]/).map((l) => stripProductMeta(l));
      name =
        linhas.find(
          (l) =>
            l.length >= 6 &&
            !PRICE_RX.test(l) &&
            !BADGE_RX.test(l) &&
            !JUNK_NAME_RX.test(l) &&
            !PRODUCT_UI_RX.test(l) &&
            !PRODUCT_META_RX.test(l),
        ) || "";
    }
    if (!name) name = inferNameFromProductText(text, price);
    name = cleanName(name);
    if (isBadProductName(name)) return null;

    const description = descriptionLines(text.replace(name, "").replace(price, ""))
      .slice(0, 3)
      .join(" · ")
      .slice(0, 400);

    const centavos = parsePriceCents(price);
    const moeda = currencyFromPrice(price);
    const imageUrl = extractImageUrl(card, imgs);

    // Campo ausente em vez de vazio: o painel distingue "não sei o preço" de
    // "de graça" pela ausência, e undefined explode no setDoc do Firestore.
    return {
      pid,
      name,
      price: price.replace(/\s+/g, " ").trim().slice(0, 40),
      ...(centavos ? { priceCents: centavos.cents } : {}),
      ...(centavos?.maxCents ? { priceMaxCents: centavos.maxCents } : {}),
      ...(moeda ? { currency: moeda } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      description,
    };
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
      // Assinatura estável observada no Gerenciador de LIVE atual. O botão
      // `pc_pin_product_list_pin` pertence ao cabeçalho e não identifica card.
      "button.pc_pin_product_pin",
      "img",
    ];
    selectors.forEach((sel) => {
      try {
        root.querySelectorAll(sel).forEach((node) => {
          let cur = node instanceof HTMLElement ? node : null;
          let hops = 0;
          while (cur && hops++ < 9) {
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
        if (
          /auto|scroll/.test(st.overflowY) &&
          scroller.scrollHeight > scroller.clientHeight + 40
        ) {
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
        scroller.scrollTop = Math.min(
          y,
          Math.max(0, scroller.scrollHeight - scroller.clientHeight),
        );
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

  /** Lê a vitrine: o DOM mapeado é a verdade; a rede só enriquece. A API do TikTok
   *  entrega na mesma página a vitrine da live E o catálogo completo da conta
   *  (pesquisa/estoque) — por isso produtos vindos só da rede só entram quando o
   *  DOM não entregou nenhuma vitrine (setor ainda não mapeado). */
  async function scrapeCatalog({ deep = false } = {}) {
    const results = new Map();
    const resultsIdx = new Map(); // normKey(name) -> chave em results (O(1) sem O(n²))
    refreshAccountNames();

    // 1) rede coletada à parte: aplicada só depois de conhecer a vitrine do DOM
    const netItems = [];
    for (const p of net.products.values()) {
      if (isBadProductName(p.name)) continue;
      netItems.push({
        pid: p.pid || "",
        name: p.name,
        price: p.price || "",
        description: p.description || "",
        // A foto e o preço numérico vêm daqui, da API — remontar o produto
        // sem eles era o que apagava a imagem que o hook já tinha lido.
        ...(p.priceCents != null ? { priceCents: p.priceCents } : {}),
        ...(p.priceMaxCents != null ? { priceMaxCents: p.priceMaxCents } : {}),
        ...(p.currency ? { currency: p.currency } : {}),
        ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
      });
    }
    const apiCount = netItems.length;

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
              doc.querySelectorAll("img").forEach((img) => {
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

    // 2) verdades da vitrine: o que o DOM do setor entregou (vazio enquanto o
    //    setor não está mapeado — nesse caso a rede vira fallback).
    const vitrinePids = new Set();
    const vitrineNames = [];
    for (const p of results.values()) {
      if (p.pid) vitrinePids.add(String(p.pid));
      if (p.name) vitrineNames.push(p.name);
    }
    const hasVitrine = vitrinePids.size > 0 || vitrineNames.length > 0;
    const vitrineNameKeys = new Set(vitrineNames.map((n) => normKey(n)));

    // 3) rede enriquece produtos que existem na vitrine (preço/descrição/pid) e
    //    só adiciona produtos novos quando o DOM não entregou nenhuma vitrine.
    for (const item of netItems) {
      const key = productKey(item);
      if (!key || isBadProductName(item.name)) continue;
      const inVitrine =
        (item.pid && vitrinePids.has(String(item.pid))) ||
        vitrineNameKeys.has(normKey(item.name)) ||
        vitrineNames.some((n) => namesMatch(n, item.name));
      if (hasVitrine && !inVitrine) continue;
      upsertProduct(results, item, resultsIdx);
    }

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
        // O Gerenciador de LIVE atual separa apelido e comentário em spans,
        // mas não inclui ':' no textContent (ex.: "crisppr.24" + pergunta).
        let pieces = [];
        try {
          pieces = Array.from(node.querySelectorAll("span,p,div"))
            .map((el) => ownNodeText(el))
            .filter(
              (value, index, all) => value && value.length <= 280 && all.indexOf(value) === index,
            );
        } catch {}
        const first = pieces.find(
          (value) => value.length >= 2 && value.length <= 40 && raw.startsWith(value),
        );
        const rest = first
          ? pieces.find(
              (value) =>
                value !== first &&
                value.length >= 2 &&
                !value.startsWith(first) &&
                !CHAT_CHROME_RX.test(value) &&
                !SYSTEM_MSG_RX.test(value),
            )
          : "";
        author = first && rest ? first : "";
        text = rest || raw;
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

  // ---------- Ponte de voz com a fonte virtual (media-injector.js) ----------
  // Numa live com vídeo gravado o TikTok captura UM microfone só. Se a voz da IA
  // sair por um dispositivo do sistema (VB-Cable), ela e o áudio do vídeo se
  // atropelam. Com o Estúdio publicando, a fala vai DENTRO do microfone virtual:
  // o media-injector abaixa o vídeo (duck), fala por cima e devolve o volume.
  // O ACK do "speak" só chega QUANDO A FALA TERMINA.
  const MEDIA_CONTROL = "__pitchai_media_control__";
  const MEDIA_ACK = "__pitchai_media_ack__";
  const MEDIA_INACTIVE = "media-inactive"; // fonte publicada mas sem captura: cai no VB-Cable
  const MEDIA_ASK_MS = 2500; // status/stopSpeak: ida e volta curta
  const VOICE_TIMEOUT_MIN = 30000;
  const VOICE_TIMEOUT_MAX = 175000; // logo abaixo do teto interno do injector (180s)
  const VOICE_CHARS_PER_SECOND = 14; // locução média, só para dimensionar o timeout
  const VIRTUAL_STATUS_TTL = 5000; // evita um round-trip de status a cada fala
  const VIRTUAL_STATUS_RETRY = 2000; // Estúdio ligado, mas o TikTok ainda não pegou o microfone
  const VIRTUAL_STATUS_QUIET = 60000; // sem injector na página: não insiste a cada fala

  const pendingMedia = new Map();
  let mediaSeq = 0;
  let virtualVoice = null; // fala em andamento no microfone virtual: { done }
  let virtualSource = { until: 0, active: false };

  // Só o ACK final interessa: a conversa entre frames tem source próprio
  // ("__pitchai_media_relay_ack__") e o "claim" intermediário dela passaria por
  // resposta vazia se a comparação de source fosse frouxa.
  window.addEventListener("message", (ev) => {
    const d = ev.data;
    if (ev.source !== window || !d || d.source !== MEDIA_ACK || d.relay) return;
    const pending = pendingMedia.get(d.requestId);
    if (!pending) return;
    pendingMedia.delete(d.requestId);
    clearTimeout(pending.timer);
    pending.resolve({ ok: Boolean(d.ok), status: d.status || {}, error: d.error, code: d.code });
  });

  /**
   * Manda um comando para o media-injector. O canal do content script só aceita
   * "speak", "stopSpeak", "duck" e "status" — ligar/desligar a fonte é do painel.
   * Nunca rejeita: devolve { ok, status, error, code, timedOut }.
   */
  function sendMedia(command, payload = {}, timeoutMs = MEDIA_ASK_MS) {
    const requestId = `pitchai-voice-${++mediaSeq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingMedia.delete(requestId);
        resolve({ ok: false, timedOut: true, error: "a fonte virtual não respondeu" });
      }, timeoutMs);
      pendingMedia.set(requestId, { resolve, timer });
      try {
        window.postMessage(
          { source: MEDIA_CONTROL, command, requestId, payload },
          window.location.origin,
        );
      } catch (error) {
        clearTimeout(timer);
        pendingMedia.delete(requestId);
        resolve({ ok: false, error: String(error?.message || error) });
      }
    });
  }

  /**
   * A voz pode entrar no microfone virtual agora? Não basta o Estúdio estar
   * ligado (enabled/published): o TikTok precisa ter selecionado a fonte de
   * áudio, e é isso que audioOwner conta — vale para o topo e para os iframes.
   */
  async function isVirtualSourceActive() {
    if (Date.now() < virtualSource.until) return virtualSource.active;
    const res = await sendMedia("status");
    const s = res.ok ? res.status || {} : {};
    const publicando = Boolean(s.enabled && s.published);
    const active = publicando && Boolean(s.audioOwner);
    let ttl = VIRTUAL_STATUS_TTL;
    // silêncio total é página sem injector: não vale travar toda fala perguntando
    if (res.timedOut) ttl = VIRTUAL_STATUS_QUIET;
    // Estúdio ligado sem captura é o vendedor que ainda não escolheu a Pitch AI
    // em "Fonte de áudio". O cabo é a resposta certa, mas o aviso de captura sai
    // no instante em que ele escolher: reavalia logo para a fala seguinte já ir
    // pelo microfone virtual.
    else if (publicando && !active) ttl = VIRTUAL_STATUS_RETRY;
    virtualSource = { until: Date.now() + ttl, active };
    return active;
  }

  /**
   * Toca a voz da IA dentro do microfone virtual. O ACK do "speak" só volta
   * quando a fala termina, então este await É o fim da fala — é o que mantém
   * isAudioBusy()/waitForAudioEnd() coerentes e a IA sem falar por cima de si.
   * Devolve { ok, inactive }: "inactive" pede o caminho antigo (VB-Cable).
   */
  async function speakThroughVirtualSource(blobOrBuffer, cfg, timeoutMs) {
    let buffer = null;
    try {
      buffer = blobOrBuffer instanceof Blob ? await blobOrBuffer.arrayBuffer() : blobOrBuffer;
    } catch {}
    if (!buffer?.byteLength) return { ok: false, inactive: false };
    const voz = cfg?.voz || {};
    const request = sendMedia(
      "speak",
      // sem duckLevel de propósito: o nível do abaixamento é o que o vendedor
      // escolheu no painel (duckAuto/activate). Mandar valor daqui atropelaria
      // a chave "Abaixar o vídeo quando a IA falar".
      {
        audio: buffer,
        mime: blobOrBuffer?.type || "audio/mpeg",
        gain: Math.min(2, Math.max(0, Number(voz.gain ?? 1))),
      },
      timeoutMs || VOICE_TIMEOUT_MIN,
    );
    const speaking = {};
    speaking.done = request.then((res) => {
      if (virtualVoice === speaking) virtualVoice = null;
      return res;
    });
    virtualVoice = speaking;
    const res = await speaking.done;
    // status.spoke === false é fala cortada (stopSpeak ou fala nova): tocou, não é erro
    if (res.ok) return { ok: true, inactive: false };
    if (res.code === MEDIA_INACTIVE) {
      virtualSource = { until: Date.now() + VIRTUAL_STATUS_TTL, active: false };
      return { ok: false, inactive: true };
    }
    // Estouro do timeout: o injector ainda pode estar falando. Cortar e desistir
    // desta fala é melhor do que dobrar a voz saindo também pelo VB-Cable.
    if (res.timedOut) sendMedia("stopSpeak");
    return { ok: false, inactive: false };
  }

  /** Teto de espera da fala: sai da duração esperada, não de um número fixo. */
  function voiceTimeoutMs(text) {
    const estimated = (String(text || "").length / VOICE_CHARS_PER_SECOND) * 1000;
    return Math.min(VOICE_TIMEOUT_MAX, Math.max(VOICE_TIMEOUT_MIN, Math.round(estimated * 2)));
  }

  /**
   * A fala pronta do TTS. O objectURL só nasce se alguém for tocar local (o
   * caminho antigo ou o monitor); pelo microfone virtual vai o ArrayBuffer.
   */
  function makeVoiceSource(blob, text) {
    let url = "";
    return {
      blob,
      timeoutMs: voiceTimeoutMs(text),
      url() {
        if (!url) url = URL.createObjectURL(blob);
        return url;
      },
      revoke() {
        if (url) URL.revokeObjectURL(url);
        url = "";
      },
    };
  }

  function isAudioBusy() {
    if (virtualVoice) return true; // falando dentro do microfone virtual
    const a = audioEl;
    if (!a || !a.src) return false;
    return !a.paused && !a.ended;
  }
  function waitForAudioEnd() {
    // no microfone virtual o fim da fala é o próprio ACK do "speak"
    if (virtualVoice) return virtualVoice.done.then(() => {});
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
  /**
   * Retorno no fone do vendedor. Toca sempre local, no dispositivo padrão, nos
   * dois caminhos — este áudio é só para ele se ouvir, não vai para a live.
   */
  async function startMonitor(voice, cfg) {
    const mon = cfg?.voz?.monitor;
    if (!mon?.enabled) {
      try {
        monitorEl?.pause();
      } catch {}
      return;
    }
    const m = ensureMonitor();
    try {
      if (typeof m.setSinkId === "function") await m.setSinkId("default");
    } catch {}
    m.volume = Math.min(1, Math.max(0, Number(mon.volume ?? 0.6)));
    // sempre do começo: no fallback o monitor tem que reiniciar junto com o
    // cabo, senão o vendedor ouve adiantado o que ainda vai sair na live
    m.src = voice.url();
    m.play().catch(() => {});
  }
  /**
   * Toca a voz da IA. Com a fonte virtual publicando, a fala entra no microfone
   * virtual e o media-injector abaixa o áudio do vídeo enquanto ela fala; sem
   * ela, é o caminho de sempre: <audio> no dispositivo da live (VB-Cable).
   * Recebe a fonte de makeVoiceSource() — não mais uma URL solta.
   */
  async function playAudio(voice, cfg) {
    if (voice?.blob && (await isVirtualSourceActive())) {
      await startMonitor(voice, cfg);
      const res = await speakThroughVirtualSource(voice.blob, cfg, voice.timeoutMs);
      if (res.ok) return true;
      // erro de verdade (áudio vazio, decode falhou): insistir no cabo não ajuda
      if (!res.inactive) return false;
      // publicada mas sem captura nesta aba: não perde a fala, sai pelo cabo
    }
    return playThroughDevice(voice, cfg);
  }
  /** Caminho antigo: <audio> com setSinkId no dispositivo da live. */
  async function playThroughDevice(voice, cfg) {
    try {
      const a = ensureAudio();
      await applySink(a, cfg);
      a.volume = Math.min(1, Math.max(0, Number(cfg?.voz?.gain ?? 1)));
      a.src = voice.url();
      await startMonitor(voice, cfg);
      await a.play();
      return true;
    } catch {
      return false;
    }
  }
  /** Corta a fala onde quer que ela esteja: <audio> local e microfone virtual. */
  function stopSpeaking() {
    try {
      audioEl?.pause();
      monitorEl?.pause();
    } catch {}
    if (virtualVoice) sendMedia("stopSpeak");
  }

  const TTS_CACHE_NAME = "pitchai-tts-hourly-v1";
  const ttsMemoryCache = new Map();

  function stableHash(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function ttsCacheKey(text, voice) {
    return stableHash(`${voice.id}|${voice.speed}|${String(text).trim()}`);
  }

  async function readTtsCache(key, ttlMs) {
    const memory = ttsMemoryCache.get(key);
    if (memory && Date.now() - memory.at < ttlMs) return memory.blob;
    if (memory) ttsMemoryCache.delete(key);
    if (typeof caches === "undefined") return null;
    try {
      const cache = await caches.open(TTS_CACHE_NAME);
      const request = new Request(`${API_BASE}/__pitchai_tts_cache__/${key}`);
      const response = await cache.match(request);
      if (!response) return null;
      const createdAt = Number(response.headers.get("x-pitchai-created-at")) || 0;
      if (Date.now() - createdAt >= ttlMs) {
        await cache.delete(request);
        return null;
      }
      const blob = await response.blob();
      ttsMemoryCache.set(key, { blob, at: createdAt });
      return blob;
    } catch {
      return null;
    }
  }

  async function writeTtsCache(key, blob) {
    const at = Date.now();
    ttsMemoryCache.set(key, { blob, at });
    if (ttsMemoryCache.size > 40) {
      const oldest = ttsMemoryCache.keys().next().value;
      if (oldest) ttsMemoryCache.delete(oldest);
    }
    if (typeof caches === "undefined") return;
    try {
      const cache = await caches.open(TTS_CACHE_NAME);
      await cache.put(
        new Request(`${API_BASE}/__pitchai_tts_cache__/${key}`),
        new Response(blob, {
          headers: {
            "Content-Type": blob.type || "audio/wav",
            "x-pitchai-created-at": String(at),
          },
        }),
      );
    } catch {}
  }

  async function speakText(text, cfg, options = {}) {
    if (extSecurity.isLocked) return false;
    const ctx = classifyContext(text);
    const voice = resolveVoice(cfg, ctx);
    const ttlMs = Math.max(30, Math.min(180, Number(cfg?.pitchBank?.ttlMinutes) || 60)) * 60 * 1000;
    const cacheKey = ttsCacheKey(text, voice);
    activity.setNowSpeaking({ text, ctx });
    const startedAt = Date.now();
    let spoken = false;
    let fromCache = false;
    let voiceSource = null;
    try {
      let blob = options.useCache ? await readTtsCache(cacheKey, ttlMs) : null;
      fromCache = !!blob;
      if (!blob) {
        const authHeaders = await signRequest(cfg.syncToken, "tts_speak");
        const r = await fetch(`${API_BASE}/api/public/tts/speak`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({ text, voice: voice.id, speed: voice.speed }),
          signal: options.signal,
        });
        if (!r.ok) {
          const detail = await r.text().catch(() => "");
          throw new Error(`voz ${r.status}${detail ? ` · ${detail.slice(0, 100)}` : ""}`);
        }
        blob = await r.blob();
        if (options.useCache) await writeTtsCache(cacheKey, blob);
      }
      if (options.isCancelled?.()) throw new DOMException("cancelado", "AbortError");
      voiceSource = makeVoiceSource(blob, text);
      spoken = await playAudio(voiceSource, cfg);
      if (!spoken) throw new Error("não foi possível reproduzir a voz");
      await waitForAudioEnd();
      if (options.signal?.aborted || options.isCancelled?.()) spoken = false;
    } catch (error) {
      if (error?.name !== "AbortError") {
        activity.log({
          type: "error",
          text: `Falha ao falar resposta: ${String(error?.message || error).slice(0, 140)}`,
          ts: Date.now(),
        });
      }
    } finally {
      voiceSource?.revoke();
    }
    activity.setNowSpeaking(null);
    if (!spoken) return false;
    // OpenAI tts-1: ~$0.015 / 1k chars. Cost stored in cents (USD ~= BRL for estimate).
    const chars = (text || "").length;
    const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const costCents = fromCache ? 0 : Math.round((chars / 1000) * 1.5); // cache não sintetiza de novo
    sessionEvent({ kind: "tts", tts_seconds: seconds, estimated_cost_cents: costCents });
    // If active product, mark it as pitched (once)
    const ativo = (cfg.produtos || []).find((p) => p.active);
    if (ativo) sessionEvent({ kind: "product", product: { id: ativo.id, name: ativo.name } });
    return true;
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
    serverBackoffUntil: 0,
    pitchProductId: null,
    pitchTimer: null,
    pitchRunId: 0,
    pitchBusy: false,
    pitchAudioActive: false,
    pitchAbort: null,
    pitchBanks: new Map(),
    replyCache: new Map(),
    lastMsgAt: 0,
    detectVia: null,
    healthTimer: null,
    healthEl: null,
    sentReplies: new Map(),
    lastChatSendAt: 0,
  };
  const MIN_INTERVAL_MS = 4000;
  const CHAT_SEND_INTERVAL_MS = 6000;
  const PITCH_IDLE_MS = 8000;
  const NO_MSG_WARN_MS = 60000;
  const CHAT_DEDUPE_MS = 45000;
  const SENT_REPLY_TTL_MS = 120000;
  const MAX_CHAT_QUEUE = 20;
  const PITCH_BANK_STORAGE_KEY = "pitchai.pitchBanks.v1";
  const REPLY_CACHE_TTL_MS = 60 * 60 * 1000;
  const STANDALONE_FAQ_RX =
    /\b(pre[cç]o|valor|quanto|frete|entrega|prazo|cupom|desconto|estoque|tamanho|medida|cor|material|garantia|troca|devolu|como usa|como usar|funciona|serve|parcel|pagamento|link|onde compra)\b/i;

  function normalizedReplyQuestion(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function replyCacheKey(cfg, text) {
    if (cfg?.pitchBank?.cacheReplies === false || !STANDALONE_FAQ_RX.test(text || "")) return "";
    const product = (cfg.produtos || []).find((p) => p.active) || cfg.produtos?.[0];
    const question = normalizedReplyQuestion(text);
    if (!question || question.length < 4) return "";
    return stableHash(
      `${product?.id || product?.name || "sem-produto"}|${question}|${JSON.stringify(cfg.aiContext || {})}`,
    );
  }

  function getCachedReply(key) {
    if (!key) return null;
    const cached = chatState.replyCache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.at >= REPLY_CACHE_TTL_MS) {
      chatState.replyCache.delete(key);
      return null;
    }
    return cached.data;
  }

  function setCachedReply(key, data) {
    if (!key) return;
    chatState.replyCache.set(key, { at: Date.now(), data });
    while (chatState.replyCache.size > 100) {
      const oldest = chatState.replyCache.keys().next().value;
      if (!oldest) break;
      chatState.replyCache.delete(oldest);
    }
  }

  function splitPitchLines(script) {
    if (!script) return [];
    return script
      .replace(/[*_`#>]/g, "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12 && s.length <= 240);
  }
  function getFallbackPitchLines(cfg) {
    const ativo = (cfg.produtos || []).find((p) => p.active);
    const byProd = ativo ? cfg.roteirosPorProduto?.[ativo.id] : "";
    const script = byProd || cfg.ultimoRoteiro || "";
    if (ativo && chatState.pitchProductId !== ativo.id) {
      chatState.pitchProductId = ativo.id;
      chatState.pitchIdx = 0;
    }
    return splitPitchLines(script);
  }

  function pitchBankSettings(cfg) {
    const raw = cfg?.pitchBank || {};
    const minIntervalSec = Math.max(20, Math.min(600, Number(raw.minIntervalSec) || 45));
    return {
      enabled: raw.enabled !== false,
      variants: Math.max(10, Math.min(15, Math.round(Number(raw.variants) || 12))),
      ttlMs: Math.max(30, Math.min(180, Number(raw.ttlMinutes) || 60)) * 60 * 1000,
      minIntervalMs: minIntervalSec * 1000,
      maxIntervalMs:
        Math.max(minIntervalSec, Math.min(900, Number(raw.maxIntervalSec) || 75)) * 1000,
    };
  }

  function pitchProductKey(cfg, product) {
    return stableHash(
      JSON.stringify({
        id: product?.id || "",
        name: product?.name || "",
        price: product?.price || "",
        description: product?.description || "",
        context: cfg?.aiContext || {},
      }),
    );
  }

  function loadStoredPitchBanks() {
    if (chatState.pitchBanks.size) return;
    try {
      const stored = JSON.parse(localStorage.getItem(PITCH_BANK_STORAGE_KEY) || "{}");
      for (const [key, bank] of Object.entries(stored)) {
        if (Array.isArray(bank?.lines) && Number(bank?.expiresAt) > Date.now()) {
          chatState.pitchBanks.set(key, bank);
        }
      }
    } catch {}
  }

  function saveStoredPitchBanks() {
    try {
      const current = {};
      for (const [key, bank] of chatState.pitchBanks) {
        if (Number(bank?.expiresAt) > Date.now()) current[key] = bank;
      }
      localStorage.setItem(PITCH_BANK_STORAGE_KEY, JSON.stringify(current));
    } catch {}
  }

  function sanitizePitchLines(lines, limit) {
    const seen = new Set();
    const clean = [];
    for (const value of Array.isArray(lines) ? lines : []) {
      const line = String(value || "")
        .replace(/[*_`#>]/g, "")
        .trim()
        .slice(0, 280);
      const key = line
        .toLowerCase()
        .replace(/[^a-z0-9á-ú]+/gi, " ")
        .trim();
      if (line.length < 35 || !key || seen.has(key)) continue;
      seen.add(key);
      clean.push(line);
      if (clean.length >= limit) break;
    }
    return clean;
  }

  async function getActivePitchLines(cfg, signal) {
    const settings = pitchBankSettings(cfg);
    const product = (cfg.produtos || []).find((p) => p.active) || cfg.produtos?.[0];
    const fallback = getFallbackPitchLines(cfg);
    if (!product || !settings.enabled) return fallback;

    loadStoredPitchBanks();
    const key = pitchProductKey(cfg, product);
    const cached = chatState.pitchBanks.get(key);
    if (cached && Number(cached.expiresAt) > Date.now()) {
      return cached.lines?.length ? cached.lines : fallback;
    }

    try {
      const authHeaders = await signRequest(cfg.syncToken, "chat_reply");
      const response = await fetch(`${API_BASE}/api/public/pitch/bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          count: settings.variants,
          product: {
            name: product.name,
            price: product.price,
            description: product.description,
          },
          systemPrompt: buildSystemPrompt(cfg),
        }),
        signal,
      });
      if (!response.ok) throw new Error(`banco ${response.status}`);
      const data = await response.json();
      const lines = sanitizePitchLines(data.pitches, settings.variants);
      if (lines.length < 5) throw new Error("banco incompleto");
      const bank = { lines, expiresAt: Date.now() + settings.ttlMs };
      chatState.pitchBanks.set(key, bank);
      // Mantém uma live grande inteira em cache sem crescer para sempre.
      while (chatState.pitchBanks.size > 20) {
        const oldest = chatState.pitchBanks.keys().next().value;
        if (!oldest) break;
        chatState.pitchBanks.delete(oldest);
      }
      saveStoredPitchBanks();
      if (data.tokenRemaining !== undefined) extSecurity.tokenRemaining = data.tokenRemaining;
      activity.log({
        type: "pitch",
        text: `Banco econômico preparado: ${lines.length} variações para ${product.name}.`,
        ts: Date.now(),
      });
      return lines;
    } catch (error) {
      if (error?.name !== "AbortError") {
        // Evita martelar a API a cada ciclo quando ela estiver indisponível.
        chatState.pitchBanks.set(key, {
          lines: fallback,
          expiresAt: Date.now() + Math.min(settings.ttlMs, 5 * 60 * 1000),
        });
        saveStoredPitchBanks();
        activity.log({
          type: "error",
          text: `Banco econômico indisponível; usando roteiro salvo (${String(error?.message || error).slice(0, 80)}).`,
          ts: Date.now(),
        });
      }
      return fallback;
    }
  }

  async function pitchTick(runId) {
    if (extSecurity.isLocked || extSecurity.aiLocked) return "blocked";
    const cfg = await loadConfig();
    if (!cfg.respostasIA || !pitchBankSettings(cfg).enabled) return "disabled";
    const liveState = await refreshLiveState();
    if (liveState.known && !liveState.active && !demo.isOn()) return "idle";
    if (isAudioBusy() || chatState.busy || chatState.queue.length) return "busy";
    if (Date.now() - chatState.lastReplyAt < PITCH_IDLE_MS) return "busy";
    const controller = new AbortController();
    chatState.pitchAbort = controller;
    const lines = await getActivePitchLines(cfg, controller.signal);
    if (runId !== chatState.pitchRunId || controller.signal.aborted) return "cancelled";
    if (isAudioBusy() || chatState.busy || chatState.queue.length) return "busy";
    if (!lines.length) return "empty";
    const line = lines[chatState.pitchIdx % lines.length];
    chatState.pitchIdx++;
    chatState.pitchIdx = chatState.pitchIdx % 1000000;
    chatState.lastReplyAt = Date.now();
    activity.log({ type: "pitch", text: line, ts: Date.now() });
    chatState.pitchAudioActive = true;
    try {
      await speakText(line, cfg, {
        useCache: true,
        signal: controller.signal,
        isCancelled: () => runId !== chatState.pitchRunId,
      });
    } finally {
      chatState.pitchAudioActive = false;
      if (chatState.pitchAbort === controller) chatState.pitchAbort = null;
    }
    return "played";
  }

  function scheduleNextPitch(runId, delay) {
    if (runId !== chatState.pitchRunId) return;
    clearTimeout(chatState.pitchTimer);
    chatState.pitchTimer = setTimeout(() => runPitchLoop(runId), delay);
  }

  async function runPitchLoop(runId) {
    if (runId !== chatState.pitchRunId || chatState.pitchBusy) return;
    chatState.pitchTimer = null;
    chatState.pitchBusy = true;
    let result = "empty";
    try {
      result = await pitchTick(runId);
    } catch {
      result = "error";
    } finally {
      chatState.pitchBusy = false;
    }
    if (runId !== chatState.pitchRunId || result === "disabled") return;
    const cfg = await loadConfig();
    const settings = pitchBankSettings(cfg);
    const delay =
      result === "busy"
        ? 4000
        : settings.minIntervalMs +
          Math.random() * Math.max(0, settings.maxIntervalMs - settings.minIntervalMs);
    scheduleNextPitch(runId, delay);
  }

  function startPitchLoop() {
    if (chatState.pitchTimer || chatState.pitchBusy) return;
    const runId = ++chatState.pitchRunId;
    scheduleNextPitch(runId, 1200);
  }

  function stopPitchLoop() {
    chatState.pitchRunId++;
    if (chatState.pitchTimer) {
      clearTimeout(chatState.pitchTimer);
      chatState.pitchTimer = null;
    }
    try {
      chatState.pitchAbort?.abort();
    } catch {}
    chatState.pitchAbort = null;
    if (chatState.pitchAudioActive) stopSpeaking();
  }

  // ---------- Local filter (blacklist / whitelist) ----------
  function localFilter(text, cfg) {
    const t = (text || "").toLowerCase();
    const wl = (cfg.filtros?.whitelist || [])
      .map((w) => String(w).toLowerCase().trim())
      .filter(Boolean);

    // Lista compartilhada (blocklist.js): casa por palavra inteira e soma a
    // lista padrão às palavras do usuário. O toggle do painel é
    // filtros.usarListaPadrao (ligado por padrão).
    const BL = window.PitchAIBlocklist;
    if (BL?.match) {
      const hit = BL.match(text, {
        extra: cfg.filtros?.blacklist || [],
        usarListaPadrao: cfg.filtros?.usarListaPadrao !== false,
      });
      if (hit?.blocked) {
        return {
          block: true,
          reason:
            hit.category === "usuario"
              ? `bloqueada pela sua lista (${hit.term})`
              : `lista padrão · ${hit.category} (${hit.term})`,
        };
      }
    } else {
      // blocklist.js indisponível: mantém o filtro antigo só com a lista do usuário
      const bl = (cfg.filtros?.blacklist || [])
        .map((w) => String(w).toLowerCase().trim())
        .filter(Boolean);
      if (bl.some((w) => t.includes(w))) return { block: true, reason: "blacklist" };
    }

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

  function chatEditorValue(editor) {
    if (!editor) return "";
    if ("value" in editor) return String(editor.value || "").trim();
    return String(editor.textContent || "").trim();
  }

  function writeChatEditor(editor, value) {
    editor.focus();
    if ("value" in editor) {
      const proto =
        editor instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(editor, value);
      else editor.value = value;
    } else {
      try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("insertText", false, value);
      } catch {
        editor.textContent = value;
      }
    }
    try {
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
      );
    } catch {
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    }
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizedReplyText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function rememberSentReply(value) {
    const normalized = normalizedReplyText(value);
    if (!normalized) return;
    const now = Date.now();
    chatState.sentReplies.set(normalized, now);
    for (const [text, at] of chatState.sentReplies) {
      if (now - at > SENT_REPLY_TTL_MS) chatState.sentReplies.delete(text);
    }
  }

  function isRecentlySentReply(value) {
    const normalized = normalizedReplyText(value);
    if (!normalized) return false;
    const sentAt = chatState.sentReplies.get(normalized) || 0;
    if (!sentAt || Date.now() - sentAt > SENT_REPLY_TTL_MS) {
      if (sentAt) chatState.sentReplies.delete(normalized);
      return false;
    }
    return true;
  }

  let chatSendChain = Promise.resolve();

  /** Serializa envios para aprovação manual e automação nunca disputarem o editor. */
  function sendChatReply(reply) {
    const run = chatSendChain.then(
      () => sendChatReplyUnlocked(reply),
      () => sendChatReplyUnlocked(reply),
    );
    chatSendChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Escreve e envia a resposta no campo real "Digite algo..." do TikTok. */
  async function sendChatReplyUnlocked(reply) {
    let editor = await mapNode("chatReply", true);
    if (!editor || !DM()?.util?.isVisible?.(editor)) return false;
    const value = String(reply || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    if (!value) return false;
    // Nunca apaga uma mensagem que o apresentador esteja digitando manualmente.
    if (chatEditorValue(editor).trim()) return false;
    const waitMs = CHAT_SEND_INTERVAL_MS - (Date.now() - chatState.lastChatSendAt);
    if (waitMs > 0) await sleep(waitMs);
    const current = await loadConfig();
    if (!current.responderNoChat || extSecurity.isLocked) return false;
    if (chatEditorValue(editor).trim()) return false;
    chatState.lastChatSendAt = Date.now();
    writeChatEditor(editor, value);
    await sleep(80);
    if (!chatEditorValue(editor)) return false;
    // Marca antes do Enter porque o hook de rede pode devolver a mensagem ao
    // feed antes de o DOM limpar o editor.
    rememberSentReply(value);

    for (const type of ["keydown", "keypress", "keyup"]) {
      editor.dispatchEvent(
        new KeyboardEvent(type, {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    await sleep(350);
    if (!chatEditorValue(editor)) {
      rememberSentReply(value);
      return true;
    }

    // Algumas versões do TikTok ignoram Enter e exigem o botão de envio.
    let scope = editor.parentElement;
    for (let depth = 0; depth < 3 && scope?.parentElement; depth++) scope = scope.parentElement;
    const buttons = Array.from(scope?.querySelectorAll?.("button, [role='button']") || []).filter(
      (button) => DM()?.util?.isVisible?.(button),
    );
    const editorRect = editor.getBoundingClientRect();
    const nearEditor = buttons
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.left >= editorRect.left + editorRect.width * 0.55 &&
          Math.abs(rect.top + rect.height / 2 - (editorRect.top + editorRect.height / 2)) < 55
        );
      })
      .sort(
        (a, b) =>
          Math.abs(a.getBoundingClientRect().left - editorRect.right) -
          Math.abs(b.getBoundingClientRect().left - editorRect.right),
      );
    const send =
      nearEditor.find((button) =>
        /(enviar|send|publicar|responder)/i.test(
          `${button.getAttribute?.("aria-label") || ""} ${button.getAttribute?.("title") || ""} ${button.textContent || ""}`,
        ),
      ) || nearEditor[0];
    if (send) realClick(send);
    await sleep(400);
    editor = (await mapNode("chatReply")) || editor;
    const sent = !chatEditorValue(editor);
    // Em resultado ambíguo, mantém a supressão pelo TTL: é mais seguro ignorar
    // uma frase idêntica por 60s do que responder ao próprio eco em loop.
    return sent;
  }

  async function deliverReply(item, reply, cfg) {
    cfg = await loadConfig();
    if (!replyAutomationEnabled(cfg)) {
      activity.markStatus(item.id, "ignored", "automação de respostas desligada", reply);
      return false;
    }
    let delivered = false;
    if (cfg.responderNoChat) {
      const sent = await sendChatReply(reply);
      delivered ||= sent;
      if (!sent) {
        activity.log({
          type: "error",
          text: "Resposta em texto não enviada: campo do TikTok indisponível ou em uso.",
          ts: Date.now(),
        });
        try {
          DM()?.invalidate?.("chatReply");
        } catch {}
      }
    }
    // Os canais são independentes: uma falha no chat nunca impede a resposta por voz.
    if (cfg.respostasIA) {
      const spoken = await speakText(reply, cfg);
      delivered ||= spoken;
    }
    if (delivered) {
      activity.markStatus(item.id, "answered", null, reply);
      sessionEvent({ kind: "answered" });
    } else {
      activity.markStatus(
        item.id,
        "failed",
        "resposta criada, mas nenhum canal confirmou o envio",
        reply,
      );
    }
    return delivered;
  }

  async function processQueue() {
    if (chatState.busy) return;
    if (Date.now() < chatState.serverBackoffUntil) {
      setTimeout(processQueue, Math.max(250, chatState.serverBackoffUntil - Date.now()));
      return;
    }
    const cfg = await loadConfig();
    if (!replyAutomationEnabled(cfg)) return;

    // Trava de segurança: verifica credencial e cota
    const unlocked = await checkExtensionLock(cfg.syncToken);
    if (!unlocked || extSecurity.isLocked || extSecurity.aiLocked) {
      _credsOk = false;
      const item = chatState.queue.shift();
      if (item) {
        activity.markStatus(
          item.id,
          "failed",
          extSecurity.aiLocked
            ? `IA pausada: ${extSecurity.message || "limite de tokens atingido"}`
            : `🔒 TRAVADO: ${extSecurity.message || "Sync token inválido"}`,
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
      if (cfg.respostasIA) await waitForAudioEnd();
      const cacheKey = replyCacheKey(cfg, item.text);
      const cachedReply = getCachedReply(cacheKey);
      if (cachedReply) {
        // Resposta FAQ repetida: entrega direto sem consumir tokens da IA.
        chatState.history.push({
          role: "user",
          content: `${item.author ? item.author + ": " : ""}${item.text}`,
        });
        chatState.history.push({ role: "assistant", content: cachedReply });
        chatState.history = chatState.history.slice(-8);
        chatState.lastReplyAt = Date.now();
        const delivered = await deliverReply(item, cachedReply, cfg);
        if (!delivered) {
          chatState.busy = false;
          setTimeout(processQueue, 500);
          return;
        }
        sessionEvent({ kind: "cache_hit" });
        chatState.busy = false;
        setTimeout(processQueue, MIN_INTERVAL_MS);
        return;
      }
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
        extSecurity.tokenRemaining = data.tokenRemaining ?? extSecurity.tokenRemaining;
        extSecurity.tokenLimit = data.tokenLimit ?? extSecurity.tokenLimit;
        extSecurity.upgrade = data.upgrade || extSecurity.upgrade;
        if (data.ignore) {
          activity.markStatus(item.id, "ignored", data.reason || "off_topic");
          sessionEvent({ kind: "ignored" });
        } else {
          const reply = (data.reply || "").trim();
          if (reply) {
            setCachedReply(cacheKey, reply);
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
              const delivered = await deliverReply(item, reply, cfg);
              if (!delivered) {
                chatState.busy = false;
                setTimeout(processQueue, 500);
                return;
              }
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
            }
          } else {
            activity.markStatus(item.id, "ignored", "empty");
          }
        }
        if (data.quotaReached) {
          extSecurity.aiLocked = true;
          extSecurity.reason = "quota_exceeded";
          extSecurity.message =
            data.upgradeMessage || data.upgrade?.message || "Limite de tokens atingido.";
          updateLockUI();
        }
      } else {
        // Falha do servidor: não é "ignorado" — mostra o motivo real e tenta de novo.
        let detail = "";
        let errorData = {};
        try {
          detail = await r.text();
          errorData = JSON.parse(detail);
          detail = String(errorData.message || detail).slice(0, 120);
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
          extSecurity.aiLocked = true;
          extSecurity.reason = "quota_exceeded";
          extSecurity.message = errorData.message || "Limite de tokens do plano atingido.";
          extSecurity.upgrade = errorData.upgrade || null;
          extSecurity.tokenRemaining = errorData.tokenRemaining ?? 0;
          extSecurity.tokenLimit = errorData.tokenLimit ?? extSecurity.tokenLimit;
          activity.markStatus(item.id, "failed", extSecurity.message);
          updateLockUI();
        } else {
          chatState.serverBackoffUntil = Date.now() + 8000;
          activity.markStatus(
            item.id,
            "failed",
            `servidor ${r.status}${detail ? " · " + detail : ""}`,
          );
          requeue(item, 5000);
        }
      }
    } catch (e) {
      chatState.serverBackoffUntil = Date.now() + 8000;
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
    // A mensagem enviada pela própria extensão reaparece no feed. Não a trate
    // como uma nova pergunta, evitando um ciclo de respostas automáticas.
    if (isRecentlySentReply(msg.text)) return;
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
      if (chatState.queue.length >= MAX_CHAT_QUEUE) {
        activity.markStatus(id, "ignored", "fila cheia · proteção anti-spam");
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
      chatState.healthEl.textContent = "Buscando o chat automaticamente…";
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

  // Carimbo da última gravação de `demo.enabled` feita aqui no content script.
  // Mesmo padrão de _mappingSelfWrite: o chrome.storage.onChanged devolve a
  // nossa própria escrita e, sem isso, o listener chamava start()/stop() de novo
  // em paralelo com o toggle (trabalho duplicado e estado piscando).
  let _demoSelfWrite = 0;

  const demo = {
    on: false,
    chatTimer: null,
    saleTimer: null,
    violTimer: null,
    tourTimers: [],
    msgIdx: 0,
    saleIdx: 0,
    badge: null,

    isOn() {
      return demo.on;
    },

    /** `preloaded` evita reler/decifrar a config quando quem chama já tem uma. */
    async applyCatalog(preloaded) {
      const cfg = preloaded || (await loadConfig());
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
      await pitchTick(chatState.pitchRunId).catch(() => {});
    },

    async startTour() {
      demo.tourTimers.forEach((timer) => clearTimeout(timer));
      demo.tourTimers = [];
      if (!demo.on) await demo.start();
      await demo.applyCatalog();
      demo.nextMessage();
      ackDemo("tour", true, "1/4 · Vitrine criada e pergunta recebida");

      demo.tourTimers.push(
        setTimeout(() => {
          if (!demo.on) return;
          demo.simulateSale();
          ackDemo("tour", true, "2/4 · Venda simulada com aviso ao vivo");
        }, 2800),
      );
      demo.tourTimers.push(
        setTimeout(async () => {
          if (!demo.on) return;
          ackDemo("tour", true, "3/4 · Preparando o pitch de voz…");
          try {
            await demo.testVoice();
            ackDemo("tour", true, "4/4 · Demonstração concluída — tudo funcionando");
          } catch (error) {
            ackDemo("tour", false, `Teste de voz não concluiu: ${error?.message || error}`);
          }
        }, 5200),
      );
      return "Demonstração iniciada · acompanhe as 4 etapas na página da LIVE";
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

    /**
     * `preloaded` reaproveita a config de quem chamou (o toggle já releu).
     * Nada de rede é aguardado aqui: a vitrine simulada e a sessão sobem em
     * segundo plano para o botão da barra responder na hora.
     */
    async start(preloaded) {
      if (demo.on) return;
      demo.on = true;
      demo.showBadge();
      const cfg = preloaded || (await loadConfig());
      activity.log({
        type: "live",
        text: "Modo Demo ligado — tudo abaixo é simulado.",
        ts: Date.now(),
      });
      demo.applyCatalog(cfg).catch(() => {});
      sessionStart().catch(() => {});
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

    /** Mesma regra do start: desliga tudo na hora e deixa a rede para depois. */
    async stop(preloaded) {
      if (!demo.on) return;
      demo.on = false;
      clearInterval(demo.chatTimer);
      demo.chatTimer = null;
      clearTimeout(demo.saleTimer);
      demo.saleTimer = null;
      clearTimeout(demo.violTimer);
      demo.violTimer = null;
      demo.tourTimers.forEach((timer) => clearTimeout(timer));
      demo.tourTimers = [];
      demo.hideBadge();
      stopPitchLoop();
      stopHealthCheck();
      chatState.detectVia = null;
      updateHealth();
      activity.log({ type: "live", text: "Modo Demo desligado.", ts: Date.now() });
      // encerramento da violação simulada + fim de sessão sem travar o clique
      (async () => {
        try {
          const cfg = preloaded || (await loadConfig());
          await clearViolation(cfg);
        } catch {}
        sessionEnd().catch(() => {});
      })();
    },

    async toggle(next) {
      const on = typeof next === "boolean" ? next : !demo.on;
      // carimbo para o storage listener ignorar o eco da nossa própria gravação
      _demoSelfWrite = Date.now();
      // gravação incremental: relê antes de gravar para não sobrescrever o painel
      const cfg = await updateConfig((c) => {
        c.demo = { ...(c.demo || {}), enabled: on };
        return c;
      });
      _demoSelfWrite = Date.now();
      if (on) await demo.start(cfg);
      else await demo.stop(cfg);
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
    catalogStarted: false,
    catalogSyncPromise: null,
    catalogQueuedDeep: false,
    catalogLastDeepAt: 0,
    pinTimer: null,
    pinIdx: 0,
    pinBusy: false,
    nextPinAt: 0,
    saleObserver: null,
    saleBoot: null,
    saleSeen: new Set(),
    saleTimes: new Map(),
    violationTimer: null,
    violationActive: false,
    liveTimer: null,
    liveActive: false,
    liveStartedAt: 0,
    liveStateKnown: false,
    liveEndAttempts: 0,
    scheduledStartAttempts: 0,
    scheduledNextAttemptAt: 0,
    scheduledFor: 0,
    lastScheduledAt: 0,
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
    const anteriores = (cfg.produtos || []).filter((p) => !p.demo);
    // Leitura completa representa a vitrine atual: remove itens automáticos
    // antigos antes de reconstruí-la, mas preserva todo produto manual.
    const atual = deep ? anteriores.filter((p) => !p.fromVitrine) : [...anteriores];
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
          // Este é o objeto que vai para a config e chega ao painel: campo que
          // não for copiado aqui é campo que o usuário nunca vê.
          ...(s.priceCents != null ? { priceCents: s.priceCents } : {}),
          ...(s.priceMaxCents != null ? { priceMaxCents: s.priceMaxCents } : {}),
          ...(s.currency ? { currency: s.currency } : {}),
          ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
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

    const beforeCatalog = anteriores
      .map((p) => `${p.fromVitrine ? "A" : "M"}:${productFingerprint(p)}`)
      .sort()
      .join("\n");
    const afterCatalog = atual
      .map((p) => `${p.fromVitrine ? "A" : "M"}:${productFingerprint(p)}`)
      .sort()
      .join("\n");
    const replaced = deep && beforeCatalog !== afterCatalog;

    // Grava relendo a config: mantém a seleção e o produto ativo
    // escolhidos no painel enquanto a raspagem estava rodando.
    // Não grava a configuração quando a vitrine não mudou. A gravação anterior
    // acontecia a cada 2s e fazia o painel inteiro (inclusive a licença) piscar.
    if (!added && !updated && !cleaned && !replaced) return 0;

    const savedCfg = await updateConfig((f) => {
      const prev = new Map();
      const prevNames = new Map();
      for (const p of f.produtos || []) {
        upsertProduct(prev, { ...p }, prevNames);
      }
      f.produtos = atual.map((p) => {
        const oldKey = findProductEntry(prev, p, prevNames);
        const old = oldKey ? prev.get(oldKey) : null;
        return old ? { ...p, id: old.id || p.id, active: !!old.active } : p;
      });
      cleanupProducts(f);
      const validIds = new Set((f.produtos || []).map((p) => p.id).filter(Boolean));
      if (Array.isArray(f.autoFixar?.ids)) {
        f.autoFixar.ids = f.autoFixar.ids.filter((id) => validIds.has(id));
      }
      if (f.autoFixar) {
        f.autoFixar.names = (f.produtos || [])
          .filter((p) => f.autoFixar.ids?.includes(p.id))
          .map((p) => p.name);
      }
    });
    cfg.produtos = savedCfg.produtos;
    if (added || updated || cleaned || replaced) pushConfigToBackend(savedCfg);

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
    if (auto.catalogStarted || demo.isOn()) return;
    auto.catalogStarted = true;

    // Uma leitura inicial, com apenas duas novas tentativas caso o TikTok ainda
    // esteja montando a vitrine. Depois disso não existe polling: novas respostas
    // da API do TikTok e o botão "Atualizar Vitrine" são os únicos gatilhos.
    const delays = [0, 2500, 6000];
    const attempt = async (index) => {
      if (!auto.catalogStarted || extSecurity.isLocked) return;
      const list = await findProductList();
      const added = await syncCatalog({ silent: false, deep: index === 0 }).catch(() => 0);
      const cfg = await loadConfig();
      if (list || added > 0 || net.products.size || (cfg.produtos || []).length) {
        auto.catalogBoot = null;
        return;
      }
      if (index + 1 >= delays.length) {
        auto.catalogBoot = null;
        return;
      }
      auto.catalogBoot = setTimeout(() => attempt(index + 1).catch(() => {}), delays[index + 1]);
    };
    attempt(0).catch(() => {});
  }

  // ---------- Auto-fixar produto ----------
  const PIN_RX = /fixar|pin|destacar|topo|apresentar|mostrar/i;
  const PIN_DANGER_RX =
    /remover|excluir|apagar|editar|comprar|carrinho|detalhes|desafixar|unpin|cancelar|parar/i;
  const UNPIN_RX = /desafixar|unpin|remover (do )?destaque|parar de apresentar|cancelar apresenta/i;
  const CONFIRM_RX = /^(confirmar|apresentar|fixar|sim|ok|continuar)$/i;
  const PINNED_RX = /(fixado|apresentando|em destaque|no topo|unpin|desafixar|cancelar apresenta)/i;

  function findPinButton(card) {
    // Prioriza a ação do card. Há outro botão visualmente idêntico no
    // cabeçalho da lista (`pc_pin_product_list_pin`) que nunca deve ser usado
    // para a rotação automática de um produto específico.
    try {
      const exact = card.querySelector("button.pc_pin_product_pin");
      if (exact && DM()?.util?.isVisible?.(exact)) return exact;
    } catch {}
    let btns = [];
    try {
      btns = Array.from(
        card.querySelectorAll(
          'button, [role="button"], a[role="button"], [class*="pin" i], [class*="present" i], [class*="top" i]',
        ),
      );
    } catch {}
    for (const b of btns) {
      if (b.matches?.(".pc_pin_product_list_pin")) continue;
      const label =
        `${b.getAttribute?.("aria-label") || ""} ${b.getAttribute?.("title") || ""} ${b.textContent || ""}`.toLowerCase();
      if (PIN_RX.test(label) && !PIN_DANGER_RX.test(label)) return b.closest("button") || b;
    }
    // Fallback seguro para versões do TikTok que usam um único botão sem texto.
    // Nunca clica às cegas quando o card possui várias ações, nem quando o único
    // botão visível é o de desafixar (aria-pressed / classe unpin).
    const visibleButtons = btns.filter((b) => b.tagName === "BUTTON" && DM()?.util?.isVisible?.(b));
    if (visibleButtons.length === 1) {
      const only = visibleButtons[0];
      const pressed = only.getAttribute?.("aria-pressed") === "true";
      const label = actionLabel(only).toLowerCase();
      const looksUnpin =
        pressed || UNPIN_RX.test(label) || /unpin|unfix|desafix/i.test(`${only.className || ""}`);
      if (!looksUnpin) return only;
    }
    return null;
  }

  function actionLabel(node) {
    return `${node?.getAttribute?.("aria-label") || ""} ${node?.getAttribute?.("title") || ""} ${node?.textContent || ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function findUnpinButton(card) {
    let buttons = [];
    try {
      buttons = Array.from(
        card.querySelectorAll(
          'button, [role="button"], a[role="button"], [class*="unpin" i], [class*="unfix" i]',
        ),
      );
    } catch {}
    return (
      buttons.find(
        (button) =>
          DM()?.util?.isVisible?.(button) &&
          (UNPIN_RX.test(actionLabel(button)) ||
            button.getAttribute?.("aria-pressed") === "true" ||
            /unpin|unfix|desafix/i.test(`${button.className || ""}`)),
      ) || null
    );
  }

  function isPinnedCard(card) {
    if (!card?.isConnected) return false;
    // Sinal mais forte primeiro: botão de desafixar / aria-pressed. O texto do
    // card ("fixado", "em destaque"…) fica só como fallback, porque descrição
    // de produto pode conter essas palavras e inverter o estado.
    if (findUnpinButton(card)) return true;
    const pinBtn = findPinButton(card);
    if (pinBtn && pinBtn.getAttribute?.("aria-pressed") === "true") return true;
    return PINNED_RX.test((card.textContent || "").toLowerCase());
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
    const sector = await regionNode("products");
    let list = await mapNode("products");
    if (sector && list) {
      try {
        if (!sector.contains(list)) list = sector;
      } catch {
        list = sector;
      }
    }
    if (!list) list = sector;
    if (list) {
      collectProductCards(list, set);
    }
    if (!list && set.size < 2) {
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

  function scrollableProductAncestor(list) {
    let node = list;
    for (let hops = 0; node && hops < 6; hops++, node = node.parentElement) {
      try {
        const style = getComputedStyle(node);
        if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 40)
          return node;
      } catch {}
    }
    return null;
  }

  /** Localiza o produto e deixa a linha virtualizada visível para o clique real. */
  async function locateProductCard(name, expectedPid = "") {
    const sector = await regionNode("products");
    let list = (await mapNode("products")) || sector;
    console.debug("[PITCHAI-PIN] locateProductCard:", {
      name,
      expectedPid,
      sectorFound: !!sector,
      listFound: !!list,
      mapVia: DM()?.status?.()?.products?.via || null,
    });
    if (sector && list) {
      try {
        if (!sector.contains(list)) list = sector;
      } catch {
        list = sector;
      }
    }
    const atCurrentPosition = () => {
      const cards = new Set();
      if (list) collectProductCards(list, cards);
      const live = Array.from(cards).filter((card) => card.isConnected);
      console.debug("[PITCHAI-PIN] cards na posição atual:", live.length, {
        primeiro: live[0] ? parseProductCard(live[0]) : null,
      });
      return matchCard(live, name, expectedPid);
    };
    let found = atCurrentPosition();
    if (found) return found;
    const scroller = list && scrollableProductAncestor(list);
    console.debug("[PITCHAI-PIN] posição inicial sem match:", {
      scrollerFound: !!scroller,
    });
    if (scroller) {
      const start = scroller.scrollTop;
      const step = Math.max(140, Math.floor(scroller.clientHeight * 0.65));
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      for (let y = 0, passes = 0; y <= max && passes < 80; y += step, passes++) {
        scroller.scrollTop = Math.min(y, max);
        await sleep(120);
        found = atCurrentPosition();
        if (found) return found;
      }
      scroller.scrollTop = start;
      await sleep(80);
    }
    const fallbackCards = await productCards();
    console.debug("[PITCHAI-PIN] fallback productCards:", fallbackCards.length);
    return matchCard(fallbackCards, name, expectedPid);
  }

  /** Acha o card do produto pelo nome normalizado (tolerante a truncamento). */
  function matchCard(cards, name, expectedPid = "") {
    const key = normKey(name);
    if (!key) return null;
    // Identidade exata primeiro: se sabemos o pid do produto, um card com pid
    // diferente nunca pode ser aceito — nome parecido não basta (a vitrine
    // pode conter variações do mesmo título em produtos distintos).
    if (expectedPid) {
      const pidMatch = cards.find((card) => {
        const parsed = parseProductCard(card);
        return parsed?.pid && String(parsed.pid) === String(expectedPid);
      });
      if (pidMatch) return pidMatch;
    }
    const words = key
      .split(" ")
      .filter((w) => w.length > 3)
      .slice(0, 4);
    let best = null;
    let bestScore = 0;
    let tie = false;
    const skippedPid = [];
    for (const c of cards) {
      const parsed = parseProductCard(c);
      if (expectedPid && parsed?.pid && String(parsed.pid) !== String(expectedPid)) {
        skippedPid.push({ pid: parsed.pid, name: parsed.name });
        continue;
      }
      const t = normKey(`${parsed?.name || ""} ${c.textContent || ""}`);
      if (!t) continue;
      // substring completa do nome vale o máximo; senão conta palavras em comum
      const exact = t.includes(key) ? words.length + 1 : 0;
      const hits = words.filter((w) => t.includes(w)).length;
      const score = Math.max(exact, hits);
      console.debug("[PITCHAI-PIN] match:", { parsed, score, hits, exact, key });
      if (score > bestScore) {
        bestScore = score;
        best = c;
        tie = false;
      } else if (score === bestScore && score > 0) {
        tie = true;
      }
    }
    if (skippedPid.length) {
      console.debug("[PITCHAI-PIN] cards ignorados por pid diferente:", skippedPid);
    }
    console.debug("[PITCHAI-PIN] resultado matchCard:", {
      key,
      expectedPid,
      bestScore,
      min: Math.max(1, Math.ceil(words.length / 2)),
      tie,
      bestName: best ? parseProductCard(best)?.name : null,
    });
    // Empate de pontuação = ambiguidade: melhor não clicar do que fixar errado.
    if (tie) return null;
    return bestScore >= Math.max(1, Math.ceil(words.length / 2)) ? best : null;
  }

  async function pinProduct(alvo) {
    const card = await locateProductCard(alvo.name || "", alvo.pid || "");
    if (!card) return { ok: false, reason: "card não encontrado na vitrine" };
    if (isPinnedCard(card)) {
      return { ok: true, reason: "já estava fixado" };
    }
    // O TikTok ocasionalmente aceita o evento de clique sem executar a ação.
    // Repete uma única vez, mas somente após confirmar que o card continua no
    // estado "Fixar"; assim nunca alterna de volta um produto já fixado.
    for (let clickAttempt = 0; clickAttempt < 2; clickAttempt++) {
      const currentCard = card.isConnected
        ? card
        : await locateProductCard(alvo.name || "", alvo.pid || "");
      if (currentCard && isPinnedCard(currentCard)) return { ok: true, reason: "fixado" };
      const btn = currentCard && findPinButton(currentCard);
      if (!btn) return { ok: false, reason: "botão de fixar não encontrado" };
      realClick(btn);
      await confirmPinDialog();
      for (let attempt = 0; attempt < 10; attempt++) {
        await sleep(250);
        const current = currentCard.isConnected
          ? currentCard
          : await locateProductCard(alvo.name || "", alvo.pid || "");
        if (current && isPinnedCard(current)) return { ok: true, reason: "fixado" };
      }
    }
    return { ok: false, reason: "o TikTok não confirmou o produto em destaque" };
  }

  /** Desfixa somente o card que o TikTok identifica como produto em destaque. */
  async function unpinCurrentProduct() {
    const cards = await productCards();
    const pinned = cards.find((card) => isPinnedCard(card));
    if (!pinned) return { ok: true, changed: false, reason: "nenhum produto estava fixado" };
    const button = findUnpinButton(pinned);
    if (!button) {
      return { ok: false, changed: false, reason: "botão de desafixar não encontrado" };
    }
    const pinnedInfo = parseProductCard(pinned);
    const pinnedName = pinnedInfo?.name || "";
    const pinnedPid = pinnedInfo?.pid || "";
    realClick(button);
    await confirmPinDialog();
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(250);
      const current = pinned.isConnected
        ? pinned
        : pinnedName
          ? await locateProductCard(pinnedName, pinnedPid)
          : null;
      if (!current || !isPinnedCard(current)) {
        return { ok: true, changed: true, reason: "produto anterior desfixado" };
      }
    }
    return {
      ok: false,
      changed: false,
      reason: "o TikTok não confirmou que o produto foi desfixado",
    };
  }

  async function autoPinTick({ force = false } = {}) {
    if (auto.pinBusy) return { ok: false, reason: "fixação em andamento" };
    if (extSecurity.isLocked) {
      return { ok: false, reason: extSecurity.message || "licença não confirmada" };
    }
    const cfg = await loadConfig();
    const af = cfg.autoFixar || {};
    if (!af.enabled && !force) return { ok: false, reason: "fixação automática desativada" };
    if (!force && Date.now() < auto.nextPinAt) return { ok: false, reason: "aguardando intervalo" };
    auto.pinBusy = true;
    try {
      return await runAutoPin(cfg, af);
    } finally {
      auto.pinBusy = false;
    }
  }

  async function runAutoPin(cfg, af) {
    const min = Math.max(5, Number(af.minSec) || 20);
    const max = Math.max(min, Number(af.maxSec) || 60);
    auto.nextPinAt = Date.now() + (min + Math.random() * (max - min)) * 1000;

    let produtos = cfg.produtos || [];
    // A seleção manual de produtos tem prioridade sobre o termo de busca.
    // casa por id, pid ou nome normalizado — a vitrine pode reescrever o id.
    const ids = Array.isArray(af.ids) ? af.ids : [];
    const names = Array.isArray(af.names) ? af.names.map((n) => normKey(n)) : [];
    if (Array.isArray(af.ids) || Array.isArray(af.names)) {
      produtos = produtos.filter(
        (p) =>
          ids.includes(p.id) ||
          (p.pid && ids.includes(p.pid)) ||
          names.includes(normKey(p.name || "")),
      );
    } else if (af.query) {
      const q = normKey(af.query);
      produtos = produtos.filter((p) => normKey(p.name || "").includes(q));
    } else {
      // Nunca escolhe todos implicitamente: o operador precisa marcar quais
      // produtos participam do autofixar.
      produtos = [];
    }

    if (!produtos.length) {
      return { ok: false, reason: "nenhum produto selecionado para fixar" };
    }

    const alvo = produtos[auto.pinIdx % produtos.length];
    auto.pinIdx++;
    try {
      localStorage.setItem("pitchai.pinIdx", String(auto.pinIdx));
    } catch {}

    let res = { ok: false, reason: "modo demo" };
    if (!demo.isOn()) {
      try {
        const unpinned = await unpinCurrentProduct();
        if (!unpinned.ok) {
          res = unpinned;
        } else {
          if (unpinned.changed) await sleep(450);
          res = await pinProduct(alvo);
        }
      } catch (e) {
        res = { ok: false, reason: String(e?.message || e) };
      }
    }
    // Só anuncia o produto à IA depois de confirmar que ele foi realmente fixado.
    if (res.ok || demo.isOn()) {
      await updateConfig((f) => {
        f.produtos = (f.produtos || []).map((p) => ({ ...p, active: p.id === alvo.id }));
      });
    } else {
      try {
        DM()?.invalidate?.("products");
      } catch {}
    }
    activity.log({
      type: "pin",
      text:
        res.ok || demo.isOn()
          ? `Produto desfixado e fixado novamente: ${alvo.name}`
          : `Destaque só no roteiro (${res.reason}): ${alvo.name}`,
      ts: Date.now(),
    });
    return res;
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

  /**
   * Separa a lista superior de pedidos da lista inferior de atividades dos
   * espectadores. Ambas ficam no mesmo setor "Atividade" do TikTok.
   */
  function findOrdersFeed(activityRegion) {
    if (!activityRegion) return null;
    try {
      const lists = Array.from(
        activityRegion.querySelectorAll('[role="list"], .arco-list-content'),
      ).filter((node) => DM()?.util?.isVisible?.(node));
      return (
        lists.find((node) =>
          /os pedidos feitos durante a sua live aparecer[ãa]o aqui/i.test(
            (node.textContent || "").replace(/\s+/g, " "),
          ),
        ) || null
      );
    } catch {
      return null;
    }
  }

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
      // A área de Atividade existe antes do primeiro pedido. O detector de
      // vendas só ganha pontuação depois que uma venda aparece; portanto
      // observamos o setor real desde o início para não perder o primeiro pedido.
      const activityRegion = await regionNode("activity");
      const ordersFeed = findOrdersFeed(activityRegion);
      const node = ordersFeed || (await mapNode("sales")) || activityRegion;
      const found = node
        ? { node, confirmedRegion: node === activityRegion || node === ordersFeed }
        : null;
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
          // Setor confirmado pelos rótulos da página. Vazio significa apenas
          // que ainda não houve pedido, então o observador deve continuar.
          if (found.confirmedRegion) return;
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
    // Aviso real na área monitorada é condição de segurança: encerra a LIVE
    // imediatamente para evitar novas vendas/conteúdo enquanto o operador não
    // consegue intervir. Em modo demo, finishLive apenas registra a simulação.
    await finishLive("aviso de violação detectado");
  }

  async function clearViolation(cfg) {
    if (!auto.violationActive) return;
    auto.violationActive = false;
    updateHealth();
    if (cfg?.respostasIA && (chatState.observer || demo.isOn())) startPitchLoop();
  }

  // Regex de violação: a fonte é o dom-map (mesma lista usada no auto-scan).
  // A cópia local só entra em cena se o dom-map ainda não tiver carregado.
  const VIOLATION_RX_LOCAL =
    /(viola[çc][ãa]o|violation|infra[çc][ãa]o|aviso|warning|penalidad|restri[çc][ãa]o|adverten|bloqueio|conte[úu]do impr[óo]prio|pol[íi]tica da comunidade)/i;
  const violationRx = () => DM()?.util?.VIOLATION_RX || VIOLATION_RX_LOCAL;
  // textos que casam o regex mas significam "está tudo certo"
  const VIOLATION_OK_RX =
    /^0$|nenhum|nenhuma|sem viola|sem aviso|normal|saud[áa]vel|boa|tudo certo/i;
  // termos que sozinhos já significam violação
  const VIOLATION_STRONG_RX =
    /(viola[çc][ãa]o|violation|infra[çc][ãa]o|penalidad|adverten|conte[úu]do impr[óo]prio|pol[íi]tica da comunidade|community guideline|strike)/i;
  // termos vagos ("aviso", "warning", "restrição") só valem com contexto de live
  const VIOLATION_CTX_RX =
    /(live|transmiss[ãa]o|stream|conte[úu]do|comunidade|pol[íi]tica|regra|produto|conta|canal|banimento|remov)/i;
  // onde banners, toasts e avisos costumam viver
  const VIOLATION_HOT_SELECTOR =
    '[role="alert"], [role="status"], [aria-live], [class*="toast" i], [class*="notice" i], [class*="notification" i], [class*="banner" i], [class*="alert" i], [class*="warn" i], [class*="violat" i], [data-e2e*="warn" i], [data-e2e*="violat" i]';

  /** A UI da própria extensão nunca pode virar alvo (senão o escudo se autodetecta). */
  function isPitchaiUI(el) {
    try {
      if (!el || !(el instanceof Element)) return false;
      if (el.closest?.('[id^="pitchai"], [class*="pitchai"]')) return true;
      // shadow root / iframe: closest não sobe até o host, então confere o dono
      const rootHost = el.getRootNode?.()?.host;
      if (rootHost && rootHost !== el) return isPitchaiUI(rootHost);
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Fallback quando não há área de avisos apontada: varre a página inteira
   * (documentos, iframes acessíveis e shadow roots abertos, via dom-map.util)
   * atrás de banners/toasts com texto de violação. Devolve o candidato de texto
   * mais curto — normalmente o próprio aviso, não o container que o embrulha.
   */
  async function findViolationHeuristic() {
    const util = DM()?.util || {};
    const roots = (() => {
      try {
        return util.allRoots?.() || [document];
      } catch {
        return [document];
      }
    })();
    const visible = util.isVisible || (() => true);
    const rx = violationRx();

    // mensagens do chat citando "aviso"/"bloqueio" não são violação do TikTok
    let chatNode = null;
    try {
      if (DM()?.status?.()?.chat?.found) chatNode = await mapNode("chat");
    } catch {}

    let best = null;
    // `hot` = elemento veio de um banner/toast/aria-live; fora deles exigimos
    // termo forte, senão qualquer menu com a palavra "avisos" viraria violação.
    const consider = (el, hot) => {
      if (!(el instanceof Element)) return;
      if (isPitchaiUI(el)) return;
      if (chatNode && (chatNode === el || chatNode.contains?.(el))) return;
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length < 8 || t.length > 200) return;
      if (!rx.test(t) || VIOLATION_OK_RX.test(t)) return;
      if (!VIOLATION_STRONG_RX.test(t)) {
        if (!hot) return;
        if (t.length < 20 || !VIOLATION_CTX_RX.test(t)) return;
      }
      if (!visible(el)) return;
      if (!best || t.length < best.text.length) best = { node: el, text: t };
    };

    for (const root of roots) {
      let hot = [];
      try {
        hot = Array.from(root.querySelectorAll(VIOLATION_HOT_SELECTOR)).slice(0, 400);
      } catch {}
      for (const el of hot) consider(el, true);
    }
    if (best) return best;

    let scanned = 0;
    for (const root of roots) {
      let list = [];
      try {
        list = Array.from(root.querySelectorAll("span, p, div, button, li"));
      } catch {}
      for (const el of list) {
        if (++scanned > 5000) return best;
        consider(el, false);
      }
    }
    return best;
  }

  let _violationNoTargetWarned = false;

  async function violationTick() {
    const cfg = await loadConfig();
    if (!cfg.violacao) return;
    if (demo.isOn()) return; // em demo a violação é disparada manualmente
    const node = await mapNode("violation");
    const apontado = !!DM()?.hasManual?.("violation");
    const alvo = node && !isPitchaiUI(node) ? node : null;
    let txt = (alvo?.textContent || "").replace(/\s+/g, " ").trim();
    // nó apontado pelo usuário: qualquer texto vale. Nó achado no auto-scan:
    // só vale se o texto realmente parecer um aviso.
    let bad = !!txt && !VIOLATION_OK_RX.test(txt) && (apontado || violationRx().test(txt));

    if (!bad) {
      const found = await findViolationHeuristic();
      if (found) {
        txt = found.text;
        bad = true;
      }
    }

    if (!alvo && !apontado && !_violationNoTargetWarned) {
      _violationNoTargetWarned = true;
      activity.log({
        type: "violation",
        text: "Escudo ligado, mas a área de avisos ainda não foi apontada — use 🎯 Apontar (opção “avisos”). Enquanto isso, vasculho a página inteira atrás de banners de violação.",
        ts: Date.now(),
      });
    }

    if (bad) await setViolation(txt, cfg);
    else await clearViolation(cfg);
  }
  function startViolationWatcher() {
    if (auto.violationTimer) return;
    _violationNoTargetWarned = false;
    auto.violationTimer = setInterval(() => {
      violationTick().catch(() => {});
    }, 10000);
    violationTick().catch(() => {});
  }

  // ---------- Iniciar/encerrar LIVE e temporizador ----------
  const START_LIVE_RX =
    /(iniciar|come[çc]ar|transmitir|abrir)\s*(a\s*)?(live|transmiss[aã]o)|entrar\s+ao\s+vivo|go\s+live|start\s+(live|stream|broadcast)/i;
  const END_LIVE_RX =
    /(encerrar|finalizar|terminar|fechar)\s*(a\s*)?(live|transmiss[aã]o)|end\s+(live|stream|broadcast)|stop\s+(live|stream)|hang\s*up|power\s*off/i;
  const LIVE_CLOCK_RX = /^\d{2}:\d{2}:\d{2}$/;

  function liveControlLabel(node) {
    return `${node?.getAttribute?.("aria-label") || ""} ${node?.getAttribute?.("title") || ""} ${node?.textContent || ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function validLiveControl(node, rx) {
    return !!node && !!DM()?.util?.isVisible?.(node) && rx.test(liveControlLabel(node));
  }

  function ownNodeText(node) {
    let value = "";
    try {
      for (const child of node.childNodes || [])
        if (child.nodeType === 3) value += child.nodeValue || "";
    } catch {}
    return value.replace(/\s+/g, " ").trim();
  }

  function runningLiveClock() {
    const roots = DM()?.util?.allRoots?.() || [document];
    for (const root of roots) {
      let nodes = [];
      try {
        nodes = Array.from(root.querySelectorAll("span,div,p,time")).slice(0, 6000);
      } catch {}
      for (const node of nodes) {
        if (!DM()?.util?.isVisible?.(node)) continue;
        const value = ownNodeText(node);
        if (LIVE_CLOCK_RX.test(value) && value !== "00:00:00") return node;
      }
    }
    return null;
  }

  /**
   * Na LIVE rápida o TikTok usa apenas um ícone de energia ao lado do cronômetro.
   * O fallback exige relógio rodando + botão pequeno com ícone no mesmo toolbar,
   * evitando clicar em ações genéricas da página.
   */
  function iconEndLiveControl() {
    const clock = runningLiveClock();
    if (!clock) return null;
    let clockRect;
    try {
      clockRect = clock.getBoundingClientRect();
    } catch {
      return null;
    }
    // Gerenciador atual: o botão de energia não é um <button>; é um div
    // clicável 24x24 contendo este SVG específico, à direita do cronômetro.
    try {
      let exactScope = clock.parentElement;
      for (let hops = 0; exactScope && hops < 4; hops++, exactScope = exactScope.parentElement) {
        const icon = exactScope.querySelector?.(".arco-icon-im_close_chat");
        const control = icon?.closest?.(".cursor-pointer") || icon?.parentElement;
        if (!control || !DM()?.util?.isVisible?.(control)) continue;
        const rect = control.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - (clockRect.left + clockRect.width / 2);
        const dy = rect.top + rect.height / 2 - (clockRect.top + clockRect.height / 2);
        if (dx > 0 && dx < 100 && Math.abs(dy) < 35) return control;
      }
    } catch {}
    let scope = clock.parentElement;
    const candidates = new Set();
    for (let hops = 0; scope && hops < 5; hops++, scope = scope.parentElement) {
      try {
        scope
          .querySelectorAll('button,[role="button"]')
          .forEach((node) => candidates.add(node.closest?.("button") || node));
      } catch {}
    }
    let best = null;
    let bestScore = Infinity;
    for (const node of candidates) {
      if (!DM()?.util?.isVisible?.(node)) continue;
      const label = liveControlLabel(node).toLowerCase();
      if (/pausar|pause|roteiro|video|microfone|volume|configura|ajuda/.test(label)) continue;
      let rect;
      try {
        rect = node.getBoundingClientRect();
      } catch {
        continue;
      }
      if (rect.width < 12 || rect.height < 12 || rect.width > 80 || rect.height > 80) continue;
      const hasIcon = !!node.querySelector?.("svg,img,[class*='icon' i],[data-icon]");
      if (!hasIcon && !/(power|encerrar|end|stop|close)/i.test(label)) continue;
      const dx = rect.left + rect.width / 2 - (clockRect.left + clockRect.width / 2);
      const dy = rect.top + rect.height / 2 - (clockRect.top + clockRect.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance > 180) continue;
      // Um ícone sem rótulo à esquerda do relógio costuma ser áudio, câmera ou
      // configuração. Só aceita esse lado quando o próprio controle declara
      // explicitamente que encerra a transmissão.
      const explicitlyEnds = /(power|encerrar|end|stop|close)/i.test(label);
      if (dx < -20 && !explicitlyEnds) continue;
      const score = distance + (dx < -20 ? 60 : 0) - (explicitlyEnds ? 80 : 0);
      if (score < bestScore) {
        best = node;
        bestScore = score;
      }
    }
    return best;
  }

  function textLiveControl(rx) {
    const roots = DM()?.util?.allRoots?.() || [document];
    for (const root of roots) {
      let nodes = [];
      try {
        nodes = Array.from(root.querySelectorAll('button,[role="button"],a'));
      } catch {}
      const found = nodes.find((node) => validLiveControl(node, rx));
      if (found) return found.closest?.("button") || found;
    }
    return null;
  }

  function publishLiveState(extra = {}) {
    try {
      chrome.storage.local.set({
        [LIVE_STATE_KEY]: {
          active: auto.liveActive,
          known: auto.liveStateKnown,
          startedAt: auto.liveStartedAt || 0,
          endingAt: auto.endingAt || 0,
          endAttempts: auto.liveEndAttempts || 0,
          at: Date.now(),
          ...extra,
        },
      });
    } catch {}
  }
  async function syncSessionMetrics() {
    if (!auto.liveActive || demo?.isOn?.()) return;
    const analytics = RG()?.readAnalytics?.();
    if (!analytics || typeof analytics !== "object") return;
    const metrics = {
      gmv: analytics.gmv,
      items_sold: analytics.itensVendidos,
      viewers: analytics.espectadores,
      avg_watch: analytics.duracaoMedia,
      product_clicks: analytics.cliquesProduto,
      visitor_percent: analytics.percentVisitantes,
    };
    for (const key of Object.keys(metrics)) {
      if (typeof metrics[key] !== "string" || !metrics[key].trim()) delete metrics[key];
    }
    if (!Object.keys(metrics).length) return;
    const fingerprint = JSON.stringify(metrics);
    const now = Date.now();
    if (fingerprint === session.lastMetricsFingerprint && now - session.lastMetricsAt < 15000)
      return;
    if (!(await sessionStart())) return;
    await sessionEvent({ kind: "metrics", metrics });
    session.lastMetricsFingerprint = fingerprint;
    session.lastMetricsAt = now;
  }

  async function confirmEndLiveDialog() {
    await sleep(500);
    const roots = DM()?.util?.allRoots?.() || [document];
    for (const root of roots) {
      let buttons = [];
      try {
        buttons = Array.from(
          root.querySelectorAll(
            '[role="dialog"] button, [aria-modal="true"] button, [class*="Modal" i] button',
          ),
        );
      } catch {}
      for (const button of buttons) {
        if (!DM()?.util?.isVisible?.(button)) continue;
        const label = liveControlLabel(button);
        if (END_LIVE_RX.test(label) || /^(confirmar|sim|confirm|yes)$/i.test(label)) {
          realClick(button);
          return true;
        }
      }
    }
    return false;
  }

  async function clickLiveControl(target, rx) {
    if (extSecurity.isLocked) return false;
    try {
      DM()?.invalidate?.(target);
    } catch {}
    let node = await mapNode(target, true);
    if (!validLiveControl(node, rx)) {
      await sleep(350);
      node = await mapNode(target, true);
    }
    if (!validLiveControl(node, rx)) {
      node = target === "endLive" ? iconEndLiveControl() : textLiveControl(rx);
    }
    if (!node || !DM()?.util?.isVisible?.(node)) return false;
    realClick(node);
    if (target === "endLive") await confirmEndLiveDialog();
    return true;
  }

  async function clickStartLive() {
    return clickLiveControl("startLive", START_LIVE_RX);
  }

  async function clickEndLive() {
    return clickLiveControl("endLive", END_LIVE_RX);
  }

  async function detectLiveState() {
    if (demo.isOn()) return { active: true, known: true };
    const [endNode, startNode] = await Promise.all([mapNode("endLive"), mapNode("startLive")]);
    const hasEnd = validLiveControl(endNode, END_LIVE_RX);
    const hasStart = validLiveControl(startNode, START_LIVE_RX);
    const hasRunningClock = !!runningLiveClock();
    const hasIconEnd = hasRunningClock && !!iconEndLiveControl();
    if (hasEnd || hasIconEnd || hasRunningClock)
      return { active: true, known: true, hasEnd: hasEnd || hasIconEnd, hasStart };
    if (hasStart) return { active: false, known: true, hasEnd, hasStart };
    return { active: false, known: false, hasEnd, hasStart };
  }

  async function refreshLiveState() {
    const detected = await detectLiveState();
    if (!detected.known) {
      auto.liveStateKnown = false;
      publishLiveState({ hasStart: false, hasEnd: false });
      return detected;
    }
    const wasActive = auto.liveActive;
    auto.liveStateKnown = true;
    auto.liveActive = detected.active;
    if (detected.active && !wasActive) {
      auto.liveStartedAt = Date.now();
      auto.liveEndAttempts = 0;
      auto.endingAt = 0;
      auto.ended = false;
      sessionStart();
      activity.log({
        type: "live",
        text: "LIVE detectada. Temporizador iniciado.",
        ts: Date.now(),
      });
    } else if (!detected.active && wasActive) {
      auto.liveStartedAt = 0;
      auto.endingAt = 0;
      auto.ended = false;
      auto.liveEndAttempts = 0;
      if (auto.banner) auto.banner.remove();
      auto.banner = null;
      sessionEnd();
      activity.log({
        type: "live",
        text: "LIVE encerrada detectada automaticamente.",
        ts: Date.now(),
      });
    }
    publishLiveState({ hasStart: detected.hasStart, hasEnd: detected.hasEnd });
    return detected;
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
    if (extSecurity.isLocked) return false;
    if (auto.ended || auto.liveEndAttempts >= 3) return false;
    auto.liveEndAttempts++;
    const clicked = demo.isOn() ? true : await clickEndLive();
    if (!clicked) {
      auto.endingAt = 0;
      if (auto.banner) auto.banner.remove();
      auto.banner = null;
      publishLiveState({ error: "Não encontrei o botão Encerrar LIVE" });
      activity.log({
        type: "live",
        text: `Tentativa ${auto.liveEndAttempts}/3: botão Encerrar LIVE não encontrado.`,
        ts: Date.now(),
      });
      if (auto.liveEndAttempts >= 3) {
        // Para aqui para não martelar a interface. Uma nova sessão detectada
        // rearma automaticamente o encerramento.
        auto.ended = true;
        publishLiveState({
          error:
            "Não foi possível encerrar automaticamente após 3 tentativas. Encerre a LIVE no TikTok.",
        });
      }
      return false;
    }
    auto.ended = true;
    stopPitchLoop();
    stopChatListener();
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
    return true;
  }

  function startLiveTimer() {
    if (auto.liveTimer) return;
    auto.liveTimer = setInterval(async () => {
      const cfg = await loadConfig();
      const state = await refreshLiveState();
      if (state.active) syncSessionMetrics().catch(() => {});
      const schedule = cfg.agendar || {};
      const scheduledAt = Date.parse(schedule.at || "");
      if (Number.isFinite(scheduledAt) && auto.scheduledFor !== scheduledAt) {
        auto.scheduledFor = scheduledAt;
        auto.scheduledStartAttempts = 0;
        auto.scheduledNextAttemptAt = 0;
      }
      if (
        schedule.enabled &&
        Number.isFinite(scheduledAt) &&
        Date.now() >= scheduledAt &&
        !state.active &&
        auto.lastScheduledAt !== scheduledAt &&
        auto.scheduledStartAttempts < 3 &&
        Date.now() >= auto.scheduledNextAttemptAt
      ) {
        auto.scheduledStartAttempts++;
        const started = await clickStartLive();
        auto.scheduledNextAttemptAt = Date.now() + 10000;
        if (started || auto.scheduledStartAttempts >= 3) auto.lastScheduledAt = scheduledAt;
        activity.log({
          type: "live",
          text: started
            ? "Comando automático para iniciar a LIVE enviado."
            : `Tentativa ${auto.scheduledStartAttempts}/3: botão Iniciar LIVE não encontrado.`,
          ts: Date.now(),
        });
        publishLiveState({ startAttempted: true, startClicked: started });
      }
      const et = cfg.encerrarTempo || {};
      if (!et.enabled || auto.ended || !state.active || !auto.liveStartedAt) return;
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
      await finishLive("tempo limite");
    }, 2000);
    refreshLiveState().catch(() => {});
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
    auto.catalogStarted = false;
    [
      "catalogBoot",
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
      stopSpeaking();
    });
    document.addEventListener("keyup", async (e) => {
      const cfg = await loadConfig();
      if (!cfg.voz?.pushToTalk?.enabled) return;
      if (e.code !== cfg.voz.pushToTalk.key) return;
      down = false;
    });
  }

  // Atividade permanece somente em memoria para diagnostico. A antiga fila
  // flutuante e o Picture-in-Picture foram removidos para nao cobrir a live.
  // Quando a revisao estiver ligada, aparece apenas uma aprovacao compacta.
  const activity = (() => {
    const state = {
      items: [],
      nowSpeaking: null,
      reviewQueue: [],
      reviewToast: null,
      reviewTimer: null,
    };
    const MAX_LOG = 40;

    function trim() {
      if (state.items.length > MAX_LOG) state.items.splice(0, state.items.length - MAX_LOG);
    }
    function add(entry) {
      state.items.push(entry);
      trim();
    }
    function log(entry) {
      add({ id: "p" + Date.now(), status: "info", ...entry });
    }
    function markStatus(id, status, reason, reply) {
      const it = state.items.find((x) => x.id === id);
      if (!it) return;
      it.status = status;
      if (reason !== undefined) it.reason = reason;
      if (reply !== undefined) it.reply = reply;
    }
    function closeReviewToast(showNext = true) {
      clearTimeout(state.reviewTimer);
      state.reviewTimer = null;
      state.reviewToast?.remove();
      state.reviewToast = null;
      if (showNext) queueMicrotask(showNextReview);
    }
    function showNextReview() {
      if (state.reviewToast || !state.reviewQueue.length) return;
      const { item, cfg } = state.reviewQueue.shift();
      if (!item || item.status !== "pending_review") return showNextReview();

      const root = document.createElement("section");
      root.className = "pitchai-review-toast";
      const label = document.createElement("span");
      label.className = "pitchai-review-label";
      label.textContent = "CONFIRMAR RESPOSTA · EXPIRA EM 25s";
      const question = document.createElement("p");
      question.className = "pitchai-review-question";
      question.textContent = item.author ? `${item.author}: ${item.text}` : item.text;
      const answer = document.createElement("p");
      answer.className = "pitchai-review-answer";
      answer.textContent = item.reply;
      const actions = document.createElement("div");
      actions.className = "pitchai-review-actions";
      const skip = document.createElement("button");
      skip.className = "pitchai-btn";
      skip.textContent = "Descartar";
      skip.onclick = () => {
        markStatus(item.id, "ignored", "descartado");
        closeReviewToast();
      };
      const speak = document.createElement("button");
      speak.className = "pitchai-btn primary";
      speak.textContent = cfg.responderNoChat
        ? cfg.respostasIA
          ? "▶ Enviar e falar"
          : "▶ Enviar no chat"
        : "▶ Falar";
      speak.onclick = async () => {
        speak.disabled = true;
        const current = await loadConfig();
        if (!replyAutomationEnabled(current)) {
          markStatus(item.id, "ignored", "automação de respostas desligada");
          closeReviewToast();
          return;
        }
        closeReviewToast(false);
        await deliverReply(item, item.reply, current);
        showNextReview();
      };
      actions.append(skip, speak);
      root.append(label, question, answer, actions);
      document.body.appendChild(root);
      state.reviewToast = root;
      state.reviewTimer = setTimeout(() => {
        markStatus(item.id, "ignored", "confirmação expirada");
        closeReviewToast();
      }, 25000);
    }
    function addPending(item, reply, cfg) {
      const it = state.items.find((x) => x.id === item.id);
      if (!it) return;
      it.status = "pending_review";
      it.reply = reply;
      state.reviewQueue.push({ item: it, cfg });
      showNextReview();
    }
    function setNowSpeaking(value) {
      state.nowSpeaking = value;
    }
    function setFilter() {}

    return { add, log, markStatus, addPending, setNowSpeaking, setFilter };
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
  const DEMO_ONLY = new Set([
    "tour",
    "vitrine",
    "produto",
    "mensagem",
    "venda",
    "violacao",
    "pitch",
  ]);

  async function runDemoCommand(action) {
    const map = {
      tour: async () => demo.startTour(),
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
      "live:start": async () => {
        const state = await detectLiveState();
        if (state.active) return "A LIVE já está ativa.";
        if (!(await clickStartLive())) throw new Error("botão Iniciar LIVE não encontrado");
        return "Comando para iniciar a LIVE enviado ao TikTok.";
      },
      "live:end": async () => {
        const state = await detectLiveState();
        if (!state.active) throw new Error("nenhuma LIVE ativa foi detectada");
        if (!(await finishLive("comando do painel"))) {
          throw new Error("botão Encerrar LIVE não encontrado");
        }
        return "Comando para encerrar a LIVE enviado ao TikTok.";
      },
      "pin:now": async () => {
        const current = await loadConfig();
        if (!(await checkExtensionLock(current.syncToken))) {
          throw new Error(extSecurity.message || "licença não confirmada");
        }
        const result = await autoPinTick({ force: true });
        if (!result?.ok) throw new Error(result?.reason || "não foi possível fixar o produto");
        return "Produto desfixado e fixado novamente com sucesso.";
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
      "pick:startLive": async () => {
        await startPickMode("startLive");
        return "Clique no botão de iniciar a LIVE";
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
        if (!total)
          throw new Error("nenhum produto encontrado — abra a vitrine da LIVE e tente novamente");
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

    const cfg = await loadConfigWithPendingSync();
    scanFx.mount();
    const unlocked = await checkExtensionLock(cfg.syncToken);
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
      "aria-pressed": String(!!cfg.protecaoGeral),
    });
    master.addEventListener("click", async () => {
      const alvo = !master.classList.contains("on");
      master.classList.toggle("on", alvo); // feedback imediato
      try {
        const c = await loadConfig();
        if (!(await checkExtensionLock(c.syncToken))) {
          master.classList.toggle("on", !alvo); // sem licença: desfaz
          return;
        }
        // gravação incremental: relê antes de gravar para não desfazer o que o
        // painel acabou de salvar (antes gravava a config inteira em memória)
        await updateConfig((fresh) => {
          fresh.protecaoGeral = alvo;
          return fresh;
        });
        master.setAttribute("aria-pressed", String(alvo));
        health.textContent = alvo ? "✓ Proteção ativada" : "Proteção pausada";
        health.className = alvo ? "pitchai-status ok" : "pitchai-status";
        setTimeout(updateHealth, 1800);
      } catch {
        master.classList.toggle("on", !alvo);
      }
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
      const alvo = window.prompt(
        "Apontar qual elemento? Digite: chat, vitrine, vendas ou avisos",
        "chat",
      );
      if (!alvo) return;
      const map = {
        chat: "pick:chat",
        vitrine: "pick:products",
        produtos: "pick:products",
        vendas: "pick:sales",
        avisos: "pick:violation",
        aviso: "pick:violation",
        violacao: "pick:violation",
        violação: "pick:violation",
      };
      const cmd = map[alvo.trim().toLowerCase()];
      if (cmd) runDemoCommand(cmd);
    });
    // O contador e a antiga fila flutuante foram removidos da navegacao.
    // O processamento continua em segundo plano e o estado fica resumido em `health`.
    chatState.statusEl = null;

    // Rótulos do botão de escuta em um só lugar (barra e eco do painel).
    const LISTEN_ON_LABEL = "👁️ IA de olho";
    const LISTEN_OFF_LABEL = "👁️ Ligar IA";

    const listenBtn = el(
      "button",
      {
        class: "pitchai-btn" + (replyAutomationEnabled(cfg) ? " primary" : ""),
        id: "pitchai-listen",
        title: "Ligar/desligar a leitura do chat pela IA",
      },
      replyAutomationEnabled(cfg) ? LISTEN_ON_LABEL : LISTEN_OFF_LABEL,
    );
    // Estado visual da escuta em um lugar só (clique e eco do painel).
    const applyListenUi = (on) => {
      listenBtn.classList.toggle("primary", on);
      listenBtn.textContent = on ? LISTEN_ON_LABEL : LISTEN_OFF_LABEL;
    };
    listenBtn.addEventListener("click", async () => {
      const on = !listenBtn.classList.contains("primary");
      applyListenUi(on); // feedback imediato
      // O botão é o interruptor mestre da IA: liga/desliga a leitura do chat.
      // Ao LIGAR não força a voz — se o vendedor deixou só "responder no chat",
      // mantém texto puro; sem nenhum canal ativo, assume a voz (padrão).
      await updateConfig((fresh) => {
        if (on) {
          if (!fresh.respostasIA && !fresh.responderNoChat) fresh.respostasIA = true;
        } else {
          fresh.respostasIA = false;
          fresh.responderNoChat = false;
        }
        return fresh;
      }).catch(() => null);
      if (on) {
        sessionStart();
        const ok = await startChatListener();
        if (!ok) {
          let tries = 0;
          const iv = setInterval(async () => {
            if ((await startChatListener()) || ++tries > 20) clearInterval(iv);
          }, 1000);
        }
      } else {
        stopPitchLoop();
        stopChatListener();
        sessionEnd();
      }
    });

    const reviewBtn = el(
      "button",
      {
        class: "pitchai-btn" + (cfg.revisarAntesDeEnviar ? " primary" : ""),
        title: "Confirmar cada resposta antes de a IA enviar ou falar",
      },
      cfg.revisarAntesDeEnviar ? "👀 Confirmando" : "👀 Confirmar",
    );
    reviewBtn.addEventListener("click", async () => {
      const on = !reviewBtn.classList.contains("primary");
      reviewBtn.classList.toggle("primary", on);
      reviewBtn.textContent = on ? "👀 Confirmando" : "👀 Confirmar";
      await updateConfig((fresh) => {
        fresh.revisarAntesDeEnviar = on;
        return fresh;
      }).catch(() => {});
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

    // Estado visual do Demo em um lugar só (clique, eco do painel e reversão).
    const applyDemoUi = (on) => {
      demoBtn.classList.toggle("demo-on", on);
      demoBtn.textContent = on ? "🧪 Demo ON" : "🧪 Demo";
      tray.classList.toggle("open", on);
    };

    demoBtn.addEventListener("click", () => {
      const on = !demoBtn.classList.contains("demo-on");
      applyDemoUi(on); // otimista: a barra responde no clique
      // o trabalho pesado (config cifrada, catálogo, sessão) roda depois
      demo.toggle(on).catch(() => applyDemoUi(!on));
    });

    const openBtn = el(
      "button",
      {
        class: "pitchai-btn primary pitchai-panel-trigger",
        id: "pitchai-open",
        title: "Abrir os controles completos da extensão",
      },
      "Painel ▾",
    );
    const tabBtn = el(
      "button",
      {
        class: "pitchai-btn pitchai-open-tab",
        id: "pitchai-open-tab",
        title: "Abrir o painel em uma aba separada",
      },
      "Nova aba ↗",
    );
    tabBtn.addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome?.runtime?.getURL) {
        window.open(chrome.runtime.getURL("panel.html"), "_blank");
      } else {
        window.open("/app", "_blank");
      }
    });

    const brandGroup = el("div", { class: "pitchai-header-brand" }, logo, ver, health);
    const protectionLabel = el(
      "div",
      {
        class: "pitchai-protection",
        title: "Ativar ou pausar a proteção geral",
        role: "button",
        tabindex: "0",
        "aria-label": "Ativar ou pausar a proteção geral",
      },
      el("span", { class: "pitchai-control-label" }, "Proteção"),
      master,
    );
    protectionLabel.addEventListener("click", () => toggleProtection().catch(() => {}));
    protectionLabel.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleProtection().catch(() => {});
    });
    const controlsGroup = el(
      "div",
      { class: "pitchai-header-controls" },
      protectionLabel,
      listenBtn,
      scrapeBtn,
      demoBtn,
    );
    const actionsGroup = el("div", { class: "pitchai-header-actions" }, openBtn, tabBtn);

    header.append(brandGroup, controlsGroup, actionsGroup);
    document.body.appendChild(header);

    if (replyAutomationEnabled(cfg)) {
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

    if (cfg.demo?.enabled) demo.start(cfg).catch(() => {});

    // Comandos vindos do painel (iframe/aba) via chrome.storage
    chrome.storage.onChanged.addListener(async (changes) => {
      const pending = changes[PENDING_SYNC_KEY]?.newValue;
      if (SYNC_UUID_RE.test(String(pending || ""))) {
        const current = await loadConfig();
        current.syncToken = String(pending);
        const encrypted = await encryptConfigObj(current);
        await chrome.storage.local.set({ [STORAGE_KEY]: encrypted });
        await chrome.storage.local.remove(PENDING_SYNC_KEY);
        const licensed = await checkExtensionLock(current.syncToken);
        if (licensed) startAutomations();
        else stopAutomations();
      }
      const storedConfig = changes[STORAGE_KEY]?.newValue;
      if (storedConfig) {
        const c = normalizeConfig(await decryptConfigObj(storedConfig));
        if (String(c.syncToken || "") !== extSecurity.syncToken) {
          const licensed = await checkExtensionLock(c.syncToken);
          if (licensed) startAutomations();
          else stopAutomations();
        }
        master.classList.toggle("on", !!c.protecaoGeral);
        master.setAttribute("aria-pressed", String(!!c.protecaoGeral));
        applyListenUi(replyAutomationEnabled(c));
        if (replyAutomationEnabled(c)) {
          sessionStart();
          startChatListener().catch(() => {});
        } else {
          stopChatListener();
          sessionEnd();
        }
        const wants = !!c.demo?.enabled;
        // ignora o eco da nossa própria gravação (senão start/stop roda duas vezes)
        if (wants !== demo.isOn() && Date.now() - _demoSelfWrite > 1500) {
          applyDemoUi(wants);
          (wants ? demo.start(c) : demo.stop(c)).catch(() => {});
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

/**
 * Pitch AI Content Script - Main entry point
 * Injects Live control bar + activity panel into TikTok Shop
 */

// ============================================================================
// Constantes
// ============================================================================

const STORAGE_KEY = "pitchai.config.v1";
const DEMO_CMD_KEY = "pitchai.demo.cmd";
const MAP_STATUS_KEY = "pitchai.dommap.status";
const DM_MANUAL_KEY = "pitchai_dommap_manual_v1";
const RG_MANUAL_KEY = "pitchai_regions_manual_v1";

// ============================================================================
// Verificação de Injeção
// ============================================================================

// Evita injeção duplicada
if (window.__pitchaiInjected) {
  console.log("[PitchAI] Already injected");
} else {
  window.__pitchaiInjected = true;

  // Inicializa
  notifyExtensionInstalled();
}

// ============================================================================
// Notificação para o Site
// ============================================================================

/**
 * Notifica o site do Pitch AI que a extensão está instalada
 */
function notifyExtensionInstalled(): void {
  try {
    window.pitchAiExtensionInstalled = true;
    window.dispatchEvent(
      new CustomEvent("pitchai-extension-detected", { detail: { version: "0.14.5" } }),
    );

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "PITCHAI_SYNC_TOKEN" && event.data.token) {
        if (typeof chrome !== "undefined" && chrome?.storage?.local) {
          (chrome.storage.local as {
            get: (keys: string[], callback: (result: Record<string, unknown>) => void) => void;
            set: (items: Record<string, unknown>, callback?: () => void) => void;
          }).get(
            [STORAGE_KEY],
            (res) => {
              const current = (res[STORAGE_KEY] as Record<string, unknown> | undefined) || {};
              current.syncToken = (event as MessageEvent).data.token;
              (chrome.storage.local as {
                set: (items: Record<string, unknown>, callback?: () => void) => void;
              }).set(
                { [STORAGE_KEY]: current },
                () => {
                  window.postMessage({ type: "PITCHAI_SYNC_TOKEN_SUCCESS" }, "*");
                },
              );
            },
          );
        }
      }
    });
  } catch (e) {
    console.warn("Pitch AI extension bridge init warning", e);
  }
}

// ============================================================================
// Função de Injeção de UI para Testes
// ============================================================================

/**
 * Função utilitária temporária para forçar a injeção do `pitchai-header` e `pitchai-panel-frame`
 * para fins de testes e auditoria de CSS no TikTok Shop.
 */
function forceInjectPitchAiTestUI(options?: {
  open?: boolean;
  iframeSrc?: string;
  forceStyles?: boolean;
}): Record<string, unknown> | null {
  const opts = Object.assign(
    {
      open: true,
      iframeSrc: typeof chrome !== "undefined" && chrome?.runtime?.getURL ? chrome.runtime.getURL("panel.html") : "/app",
      forceStyles: true,
    },
    options || {},
  );

  console.log("🧪 [Pitch AI Audit] Injetando pitchai-header e pitchai-panel-frame para testes...");

  // 1. Injeta CSS inline emergencial
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
      0%, 100% { box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.75), 0 0 16px 2px rgba(124, 58, 237, 0.3) !important; }
      50% { box-shadow: 0 20px 60px -10px rgba(0, 0, 0, 0.85), 0 0 28px 6px rgba(168, 85, 247, 0.5) !important; }
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
    header.innerHTML = `
    <span class="pitchai-logo">pitch<b>ai</b></span>
    <span class="pitchai-ver">v0.14.5 [TEST]</span>
    <span class="pitchai-status ok"><span class="pitchai-dot on"></span> Teste Ativo</span>
    <button class="pitchai-btn primary" id="pitchai-test-toggle-btn">Painel ▴</button>
    <button class="pitchai-btn" id="pitchai-test-tab-btn" title="Abrir painel">↗ Aba</button>
    `;
    document.body.appendChild(header);
  }

  // 3. Garante ou cria o pitchai-panel-frame
  let frame = document.getElementById("pitchai-frame");
  let iframe: HTMLIFrameElement | null = null;
  
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

  // 4. Auditoria de Estilos Computados
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
}

// Adiciona ao window para uso global
window.__forceInjectPitchAiTestUI = forceInjectPitchAiTestUI;
window.forceInjectPitchAiLayout = forceInjectPitchAiTestUI;

// ============================================================================
// Inicialização
// ============================================================================

// (a chamada de notifyExtensionInstalled() agora está dentro do bloco de anti-duplicação acima)

// Exporta para uso em outros módulos
export {
  notifyExtensionInstalled,
  forceInjectPitchAiTestUI,
  STORAGE_KEY,
  DEMO_CMD_KEY,
  MAP_STATUS_KEY,
  DM_MANUAL_KEY,
  RG_MANUAL_KEY,
};

// ============================================================================
// Tipos globais (Window)
// ============================================================================

declare global {
  interface Window {
    __pitchaiInjected?: boolean;
    pitchAiExtensionInstalled?: boolean;
    __forceInjectPitchAiTestUI?: typeof forceInjectPitchAiTestUI;
    forceInjectPitchAiLayout?: typeof forceInjectPitchAiTestUI;
  }
}

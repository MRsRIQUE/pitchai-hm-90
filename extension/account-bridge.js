// Ponte mínima entre o painel web oficial e a extensão.
// O token fica pendente até o painel/content script criptografá-lo na config.
(function () {
  const PENDING_KEY = "pitchai.pendingSyncToken";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const RESULT_TYPE = "PITCHAI_SYNC_TOKEN_RESULT";

  function postResult(requestId, result) {
    window.postMessage(
      {
        type: RESULT_TYPE,
        requestId,
        version: chrome.runtime.getManifest().version,
        ...result,
      },
      window.location.origin,
    );
  }

  function setPendingToken(token) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [PENDING_KEY]: token }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        chrome.storage.local.get([PENDING_KEY], (stored) => {
          const readError = chrome.runtime.lastError;
          if (readError || stored?.[PENDING_KEY] !== token) {
            reject(new Error(readError?.message || "token não persistido"));
            return;
          }
          resolve();
        });
      });
    });
  }

  function announceExtension() {
    try {
      if (!document.documentElement) return false;
      const version = chrome.runtime.getManifest().version;
      document.documentElement.setAttribute("data-pitchai-extension", version);
      window.dispatchEvent(new CustomEvent("pitchai-extension-detected", { detail: { version } }));
      return true;
    } catch {
      return false;
    }
  }

  if (!announceExtension()) {
    document.addEventListener("DOMContentLoaded", announceExtension, { once: true });
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type !== "PITCHAI_SYNC_TOKEN") return;
    const token = String(event.data.token || "").trim();
    const requestId = String(event.data.requestId || "").slice(0, 100);
    if (!requestId) return;
    if (!UUID_RE.test(token)) {
      postResult(requestId, {
        ok: false,
        reason: "invalid_token",
        message: "O código de conexão está incompleto ou inválido.",
      });
      return;
    }

    try {
      const response = await fetch(`${window.location.origin}/api/public/live/verify`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const status = await response.json().catch(() => ({}));
      if (!response.ok || !status.valid || status.locked) {
        postResult(requestId, {
          ok: false,
          reason: status.reason || "verification_failed",
          message:
            status.message ||
            "O servidor não conseguiu validar esse código. Gere um novo no painel.",
        });
        return;
      }

      await setPendingToken(token);
      postResult(requestId, {
        ok: true,
        aiLocked: Boolean(status.aiLocked),
        reason: status.reason || "",
        message: status.aiLocked
          ? "Conexão salva; somente a cota de IA está pausada."
          : "Token validado e salvo na extensão.",
      });
    } catch {
      postResult(requestId, {
        ok: false,
        reason: "storage_or_network_error",
        message: "Não foi possível validar e salvar o código na extensão. Tente novamente.",
      });
    }
  });
})();

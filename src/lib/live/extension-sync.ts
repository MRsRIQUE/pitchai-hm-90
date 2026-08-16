export type ExtensionSyncResult = {
  ok: boolean;
  message?: string;
  reason?: string;
  version?: string;
  aiLocked?: boolean;
};

const RESULT_TYPE = "PITCHAI_SYNC_TOKEN_RESULT";

function requestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `pitchai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Envia o Sync Token para a extensão e só conclui depois que a própria
 * extensão validar o token no servidor e confirmar a gravação no storage.
 */
export function connectSyncTokenToExtension(
  token: string,
  timeoutMs = 8_000,
): Promise<ExtensionSyncResult> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ok: false, reason: "browser_unavailable" });
  }

  const id = requestId();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ExtensionSyncResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.type !== RESULT_TYPE || event.data?.requestId !== id) return;
      finish({
        ok: Boolean(event.data.ok),
        message: String(event.data.message || ""),
        reason: String(event.data.reason || ""),
        version: String(event.data.version || ""),
        aiLocked: Boolean(event.data.aiLocked),
      });
    };
    const timer = window.setTimeout(
      () =>
        finish({
          ok: false,
          reason: "extension_timeout",
          message:
            "A extensão instalada não confirmou a conexão. Baixe a versão mais recente e recarregue em chrome://extensions.",
        }),
      timeoutMs,
    );

    window.addEventListener("message", onMessage);
    window.postMessage(
      { type: "PITCHAI_SYNC_TOKEN", token: token.trim(), requestId: id },
      window.location.origin,
    );
  });
}

/**
 * Ponte entre o painel web e a captura individual de produto.
 *
 * Este content script apenas transporta o pedido para o service worker e
 * devolve a resposta na mesma janela. Sync token e dados de conta continuam
 * isolados em `account-bridge.js`.
 */
(function () {
  const PEDIDO = "PITCHAI_SCRAPE_PRODUCT";
  const RESULTADO = "PITCHAI_SCRAPE_PRODUCT_RESULT";

  function anunciar() {
    if (!document.documentElement) return false;
    try {
      document.documentElement.setAttribute(
        "data-pitchai-scrape",
        chrome.runtime.getManifest().version,
      );
      return true;
    } catch {
      return false;
    }
  }

  if (!anunciar()) document.addEventListener("DOMContentLoaded", anunciar, { once: true });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type !== PEDIDO) return;

    const requestId = String(event.data.requestId || "").slice(0, 100);
    if (!requestId) return;
    const entrada = String(event.data.entrada || "").slice(0, 2048);

    const responder = (dados) =>
      window.postMessage({ type: RESULTADO, requestId, ...dados }, window.location.origin);

    const semResposta = {
      ok: false,
      motivo: "extensao",
      mensagem: "A extensão não respondeu. Recarregue-a em chrome://extensions e tente de novo.",
    };

    try {
      chrome.runtime.sendMessage({ type: PEDIDO, entrada }, (resposta) => {
        if (chrome.runtime.lastError || !resposta) {
          responder(semResposta);
          return;
        }
        responder(resposta);
      });
    } catch {
      responder(semResposta);
    }
  });
})();

/**
 * Ponte do painel para a raspagem de produto.
 *
 * Fica separada de `account-bridge.js` de propósito: aquela cuida do Sync
 * Token. Aqui só passa o pedido de "leia esse produto" para o service worker e
 * devolve a resposta na mesma janela.
 */
(function () {
  const PEDIDO = "PITCHAI_SCRAPE_PRODUCT";
  const RESULTADO = "PITCHAI_SCRAPE_PRODUCT_RESULT";

  /**
   * Marca a capacidade, não só a presença da extensão: quem está numa versão
   * anterior à 0.19 não sabe raspar, e o painel precisa mandar atualizar em vez
   * de esperar por uma resposta que nunca vem.
   */
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

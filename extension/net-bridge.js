// Pitch AI — ponte de frames.
// O hook de rede roda em todos os frames, mas o painel só existe no frame
// principal. Este script retransmite os payloads de produtos/mensagens
// capturados dentro de iframes para a janela do topo.
(function () {
  if (window.top === window) return; // no topo o content.js já escuta direto
  const TAG = "__pitchai_net__";
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    // Só aceita posts da propria origem (hook.js roda no MAIN world do mesmo frame).
    if (ev.origin !== window.location.origin) return;
    const d = ev.data;
    if (!d || d.source !== TAG || d.relay) return;
    try {
      // Relay para o top com target origin restrito à origin do top (mesmo site TikTok).
      const target = window.top ? window.top.location.origin || "*" : "*";
      window.top.postMessage({ ...d, relay: true }, target);
    } catch {}
  });
})();

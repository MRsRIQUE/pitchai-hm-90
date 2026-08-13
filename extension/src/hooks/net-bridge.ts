/**
 * Pitch AI — ponte de frames.
 * O hook de rede roda em todos os frames, mas o painel só existe no frame principal.
 * Este script retransmite os payloads de produtos/mensagens capturados dentro de iframes
 * para a janela do topo.
 */

// ============================================================================
// Constantes
// ============================================================================

const TAG = "__pitchai_net__";

// ============================================================================
// Verificação de Contexto
// ============================================================================

/**
 * Verifica se está no frame principal
 */
function isTopWindow(): boolean {
  return window.top === window;
}

// ============================================================================
// Tipos
// ============================================================================

interface NetMessage {
  source: string;
  kind: "products" | "messages";
  payload: unknown[];
  relay?: boolean;
}

// ============================================================================
// Função Principal
// ============================================================================

/**
 * Inicializa a ponte de rede
 */
export function initNetBridge(): void {
  // Se estiver no frame principal, o content.js já escuta direto
  if (isTopWindow()) return;

  // Escuta mensagens do hook de rede
  window.addEventListener("message", (ev) => {
    // Verifica se a mensagem vem desta janela
    if (ev.source !== window) return;

    const d = ev.data as NetMessage | null;
    
    // Verifica se é uma mensagem do hook de rede e não é um repasse
    if (!d || d.source !== TAG || d.relay) return;

    try {
      // Repassa a mensagem para o frame principal
      window.top?.postMessage({ ...d, relay: true }, "*");
    } catch {
      // Ignora erros
    }
  });
}

// ============================================================================
// Inicialização Automática
// ============================================================================

// Inicializa automaticamente
initNetBridge();

// Exporta para uso programático
export { TAG, isTopWindow };
export default initNetBridge;

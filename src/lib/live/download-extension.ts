import { APP_VERSION } from "@/lib/live/version";

/**
 * Baixa o pacote .zip da extensão do Chrome.
 *
 * Dois detalhes que fazem o download falhar se ignorados: o Firefox só dispara
 * o clique de uma âncora que esteja no documento, e revogar a object URL na
 * mesma volta do event loop cancela a transferência antes de começar.
 *
 * Lança em caso de falha de rede ou resposta não-OK — quem chama decide como
 * avisar o usuário.
 */
export async function downloadExtensionZip(): Promise<void> {
  const res = await fetch(`/pitchai-extension.zip?v=${APP_VERSION}`);
  if (!res.ok) throw new Error(`Download falhou: ${res.status}`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pitchai-extension.zip";

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

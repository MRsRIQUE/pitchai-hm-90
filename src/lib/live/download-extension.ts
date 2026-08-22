import { getFirebaseAuth } from "@/lib/firebase";

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
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Entre na sua conta para baixar a extensao.");

  const idToken = await user.getIdToken();
  const res = await fetch("/api/account/extension-download", {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Download falhou: ${res.status}`);
  }

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

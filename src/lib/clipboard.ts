/**
 * Cópia para a área de transferência com resposta honesta.
 *
 * `navigator.clipboard` falha em contexto inseguro (http), quando a permissão é
 * negada ou quando a aba não está em foco. Chamar sem tratar faz a interface
 * anunciar "copiado!" sem ter copiado nada — por isso esta função devolve o
 * resultado em vez de lançar, e quem chama decide a mensagem.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof document === "undefined") return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Segue para o fallback abaixo.
  }

  // Fallback para navegadores sem Clipboard API ou em contexto não seguro.
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(field);
    return copied;
  } catch {
    return false;
  }
}

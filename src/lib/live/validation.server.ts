/**
 * Server-side validation helpers to prevent empty or whitespace-only content
 * from being published or sent to live streams or speech services.
 */

/**
 * Checks whether a value is a string with non-whitespace content.
 * Accounts for standard whitespace, non-breaking spaces (\u00A0),
 * and zero-width spaces (\u200B-\u200D, \uFEFF).
 */
export function isNonEmptyText(val: unknown): val is string {
  if (typeof val !== "string") return false;
  const cleaned = val.replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, "");
  return cleaned.length > 0;
}

/**
 * Validates text content prior to publishing or sending to TikTok live interface.
 * Returns { valid: true, content: string } if valid, or { valid: false, error: string } if empty/whitespace.
 */
export function validateContentForPublish(rawText: unknown): {
  valid: boolean;
  content: string;
  error?: string;
} {
  if (typeof rawText !== "string") {
    return {
      valid: false,
      content: "",
      error: "Content must be a valid string",
    };
  }

  const trimmed = rawText.trim();
  if (!isNonEmptyText(trimmed)) {
    return {
      valid: false,
      content: "",
      error: "Content is empty or composed only of whitespace",
    };
  }

  return {
    valid: true,
    content: trimmed,
  };
}

/**
 * Limpeza server-side da resposta gerada antes de devolver ao cliente:
 * remove emojis (incluindo sequências ZWJ e modificadores de tom de pele),
 * asteriscos de markdown e quebras de linha duplicadas. Não altera o restante
 * do texto além do trim. Não-string vira "".
 */
export function sanitizeReplyForPublish(text: unknown): string {
  if (typeof text !== "string") return "";
  return (
    text
      // A regra `no-misleading-character-class` avisa que emoji composto
      // (bandeira, familia, tom de pele) sai caractere a caractere em vez de
      // inteiro. Aqui isso e o comportamento desejado: o que nao pode e sobrar
      // pedaco de emoji no texto que a IA publica no chat da live.
      // eslint-disable-next-line no-misleading-character-class
      .replace(/[\p{Extended_Pictographic}\u200D\uFE0F\p{Emoji_Modifier}]/gu, "")
      .replace(/\*/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

/**
 * Fecha a resposta em uma frase que cabe no chat da live. Nunca acrescenta
 * reticências: quando o modelo passa do limite, preserva a primeira frase
 * completa ou encerra no último limite de palavra com pontuação final.
 */
export function finalizeLiveReply(text: unknown, maxChars = 96): string {
  const clean = sanitizeReplyForPublish(text)
    .replace(/\s+/g, " ")
    .replace(/(?:\.{2,}|…)+\s*$/u, "")
    .trim();
  if (!clean) return "";

  const limit = Math.max(24, Math.min(500, Math.round(maxChars) || 96));
  let result = clean;
  if (result.length > limit) {
    const complete = result.match(/^.{1,}?[.!?](?=\s|$)/u)?.[0]?.trim();
    if (complete && complete.length <= limit) {
      result = complete;
    } else {
      const cut = result.slice(0, limit - 1).trimEnd();
      const lastSpace = cut.lastIndexOf(" ");
      result = (lastSpace >= Math.floor(limit * 0.55) ? cut.slice(0, lastSpace) : cut).trim();
    }
  }

  result = result.replace(/(?:\.{2,}|…)+\s*$/u, "").trim();
  if (!/[.!?]$/u.test(result)) {
    if (result.length >= limit) result = result.slice(0, limit - 1).trimEnd();
    result += ".";
  }
  return result.slice(0, limit);
}

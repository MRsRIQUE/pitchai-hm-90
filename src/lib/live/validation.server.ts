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
  return text
    .replace(/[\p{Extended_Pictographic}\u200D\uFE0F\p{Emoji_Modifier}]/gu, "")
    .replace(/\*/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

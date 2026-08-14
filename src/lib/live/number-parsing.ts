/** Converte moeda/número nos formatos pt-BR e internacional sem perder milhares. */
export function parseLocaleNumber(value: string | undefined): number {
  if (!value) return 0;
  const negativeByParentheses = /^\s*\(.*\)\s*$/.test(value);
  let normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return 0;

  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    normalized = normalized.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0) {
    const dotCount = (normalized.match(/\./g) ?? []).length;
    const digitsAfterDot = normalized.length - dot - 1;
    if (dotCount > 1 || digitsAfterDot === 3) normalized = normalized.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return negativeByParentheses ? -Math.abs(parsed) : parsed;
}

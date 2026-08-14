/**
 * Aceita somente estados positivos inequívocos do provedor. A checagem negativa
 * vem primeiro para impedir falsos positivos como `unpaid`/`disapproved`, que
 * contêm literalmente `paid`/`approved`.
 */
export function isApprovedPaymentStatus(value: unknown): boolean {
  const numeric = Number(value);
  // PerfectPay: 2 = aprovado, 10 = completo.
  if (Number.isInteger(numeric)) return numeric === 2 || numeric === 10;
  const status = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  if (!status) return false;

  if (
    /(^|_)(unpaid|not_paid|not_approved|disapproved|pending|waiting|refused|rejected|failed|canceled|cancelled|cancelado|refunded|refund|estornado|chargeback|expired|overdue|past_due)($|_)/.test(
      status,
    )
  ) {
    return false;
  }

  return /(^|_)(approved|paid|aprovado|pago|completed)($|_)/.test(status);
}

/** Estados que removem uma assinatura previamente concedida para a mesma venda. */
export function isReversedPaymentStatus(value: unknown): boolean {
  const numeric = Number(value);
  // PerfectPay: 6 = cancelado, 7 = reembolsado, 9 = chargeback.
  if (Number.isInteger(numeric)) return numeric === 6 || numeric === 7 || numeric === 9;
  const status = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
  return /(^|_)(canceled|cancelled|cancelado|refunded|refund|reembolsado|estornado|chargeback)($|_)/.test(
    status,
  );
}

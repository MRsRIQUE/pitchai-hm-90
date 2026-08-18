import { getFirebaseAuth } from "@/lib/firebase";
import { PITCHAI_PLANS } from "@/lib/live/plans";
import { normalizePlanSlug } from "@/lib/live/quotas";

export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function readableServerError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (
    !message.trim() ||
    /<(?:!doctype|html|head|body)\b/i.test(message) ||
    /unexpected token\s+['"]?</i.test(message)
  ) {
    return fallback;
  }
  return message || fallback;
}

export async function courtesyRequest<T>(
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sua sessão terminou. Entre novamente.");
  const token = await user.getIdToken();
  const response = await fetch("/api/admin/courtesy", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `Falha no servidor (${response.status}).`);
  return payload as T;
}

/**
 * Deriva preços mensais equivalentes a partir da fonte única de verdade
 * (PITCHAI_PLANS), sem valores hardcoded. Legado (pro/starter/studio) mapeia
 * para o plano equivalente via normalizePlanSlug.
 */
export const PLAN_PRICES: Record<string, number> = {
  gratuito: 0,
  ...Object.fromEntries(
    PITCHAI_PLANS.map((plan) => [plan.priceId, plan.amountCents / 100 / plan.months]),
  ),
  ...Object.fromEntries(
    ["pro", "starter", "studio"].map((alias) => {
      const slug = normalizePlanSlug(alias);
      const plan = PITCHAI_PLANS.find((p) => p.priceId === slug);
      return [alias, plan ? plan.amountCents / 100 / plan.months : 0];
    }),
  ),
};

export const PAID_PLAN_IDS = PITCHAI_PLANS.map((plan) => plan.priceId);

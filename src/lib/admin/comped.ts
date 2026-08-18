import { fsSet, getUserByEmail, type FirestoreAuthMode } from "../firebase.server";
import {
  COURTESY_DEFAULT_PLAN,
  COURTESY_MAX_DAYS,
  COURTESY_MIN_DAYS,
  COURTESY_NOTE_MAX,
  COURTESY_NOTE_MIN,
  COURTESY_PLAN_IDS,
  isCourtesyPlanId,
  type CourtesyPlanId,
} from "../live/plans";

/**
 * Lógica única de cortesia (comped_access), compartilhada entre a rota
 * `/api/admin/courtesy` e as server functions de `comped.functions.ts`.
 * As duas vias usam as MESMAS regras e gravam os MESMOS campos, mantendo a
 * compatibilidade com `useUserSubscription` (lê `comped_access/{uid}`).
 */

export type CompedFirestoreOptions = { mode?: FirestoreAuthMode; userToken?: string };

export type GrantCompedValue = {
  email: string;
  days: number;
  plan: CourtesyPlanId;
  note: string | null;
};

export type GrantCompedResult =
  | { ok: true; userId: string; plan: CourtesyPlanId; grantedUntil: string }
  | { ok: false; error: string; status: number };

/** Valida e normaliza a entrada de uma concessão (função pura, roda no cliente também). */
export function validateGrantCompedInput(raw: {
  email?: unknown;
  days?: unknown;
  plan?: unknown;
  note?: unknown;
}): { ok: true; value: GrantCompedValue } | { ok: false; error: string; status: number } {
  const email = String(raw?.email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Digite um e-mail válido.", status: 400 };
  }
  const days = Number(raw?.days);
  if (!Number.isInteger(days) || days < COURTESY_MIN_DAYS || days > COURTESY_MAX_DAYS) {
    return {
      ok: false,
      error: `O período deve ser de ${COURTESY_MIN_DAYS} a ${COURTESY_MAX_DAYS} dias.`,
      status: 400,
    };
  }
  const plan = String(raw?.plan || COURTESY_DEFAULT_PLAN);
  if (!isCourtesyPlanId(plan)) {
    return {
      ok: false,
      error: `Plano inválido. Use ${COURTESY_PLAN_IDS.join(" ou ")}.`,
      status: 400,
    };
  }
  const note = String(raw?.note ?? "")
    .trim()
    .slice(0, COURTESY_NOTE_MAX);
  if (note.length < COURTESY_NOTE_MIN) {
    return {
      ok: false,
      error: "Descreva o motivo da cortesia (mínimo 3 caracteres).",
      status: 400,
    };
  }
  return { ok: true, value: { email, days, plan, note: note || null } };
}

export function validateCompedUserId(
  raw: unknown,
): { ok: true; userId: string } | { ok: false; error: string } {
  const userId = String(raw ?? "").trim();
  // Firebase Auth UIDs não são necessariamente UUIDs.
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(userId)) return { ok: false, error: "Conta inválida." };
  return { ok: true, userId };
}

/**
 * Concede cortesia a um e-mail existente por N dias.
 * Input deve ter passado por `validateGrantCompedInput`.
 */
export async function grantComped(
  value: GrantCompedValue,
  grantedBy: string,
  options: CompedFirestoreOptions,
): Promise<GrantCompedResult> {
  const user = await getUserByEmail(value.email, options);
  if (!user) {
    return {
      ok: false,
      error: "Conta não encontrada. A pessoa precisa criar e acessar a conta antes da cortesia.",
      status: 404,
    };
  }
  const now = new Date();
  const grantedUntil = new Date(now.getTime() + value.days * 86_400_000).toISOString();
  await fsSet(
    `comped_access/${user.id}`,
    {
      email: value.email,
      plan: value.plan,
      status: "comped",
      grantedUntil,
      note: value.note,
      grantedBy,
      grantedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    options,
  );
  return { ok: true, userId: user.id, plan: value.plan, grantedUntil };
}

/** Revoga o acesso de cortesia de uma conta. */
export async function revokeComped(
  userId: string,
  revokedBy: string,
  options: CompedFirestoreOptions,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const check = validateCompedUserId(userId);
  if (!check.ok) return { ok: false, error: check.error, status: 400 };
  const now = new Date().toISOString();
  await fsSet(
    `comped_access/${check.userId}`,
    {
      status: "revoked",
      grantedUntil: new Date(0).toISOString(),
      note: "revoked",
      grantedBy: revokedBy,
      revokedBy,
      revokedAt: now,
      updatedAt: now,
    },
    options,
  );
  return { ok: true };
}

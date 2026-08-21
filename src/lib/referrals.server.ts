import { fsCreate, fsCreateIfAbsent, fsGet, fsSet } from "@/lib/firebase.server";
import { codeFromUserId, normalizeReferralCode, type ReferralSource } from "@/lib/referrals.shared";

export const REFERRAL_RATE = 0.6;
export { normalizeReferralCode as normalizeCode } from "@/lib/referrals.shared";

export { codeFromUserId } from "@/lib/referrals.shared";

/**
 * Garante que o usuário tenha um código de indicação no Firestore.
 * Armazenado em referral_codes/{code} (público) e users/{uid}/referral.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const firestore = { mode: "server" as const };
  const userDoc = await fsGet(`users/${userId}/referral/main`, firestore);
  const savedCode = normalizeReferralCode(String(userDoc?.data?.code || ""));
  const candidates = Array.from(
    new Set([
      ...(savedCode ? [savedCode] : []),
      ...Array.from({ length: 9 }, (_, attempt) =>
        codeFromUserId(attempt === 0 ? userId : `${userId}:${attempt}`),
      ),
    ]),
  );
  const now = new Date().toISOString();
  let code = "";
  let codeData: Record<string, unknown> | null = null;

  for (const candidate of candidates) {
    const current = await fsGet(`referral_codes/${candidate}`, firestore);
    if (current?.data?.uid === userId) {
      code = candidate;
      codeData = current.data;
      break;
    }
    if (current) continue;

    const created = await fsCreateIfAbsent(
      `referral_codes/${candidate}`,
      { uid: userId, active: false, createdAt: now },
      firestore,
    );
    if (created) {
      code = candidate;
      codeData = { uid: userId, active: false, createdAt: now };
      break;
    }

    // Outro cadastro pode ter reservado o mesmo candidato entre o GET e o
    // CREATE. Se foi esta própria conta, reutiliza; se não, tenta o próximo.
    const winner = await fsGet(`referral_codes/${candidate}`, firestore);
    if (winner?.data?.uid === userId) {
      code = candidate;
      codeData = winner.data;
      break;
    }
  }
  if (!code || !codeData) {
    throw new Error("Não foi possível reservar um código de indicação único.");
  }

  const active = codeData.active === true;
  await fsSet(
    `users/${userId}/referral/main`,
    {
      code,
      active,
      createdAt: String(userDoc?.data?.createdAt || codeData.createdAt || now),
      ...(active && codeData.activatedAt ? { activatedAt: String(codeData.activatedAt) } : {}),
    },
    firestore,
  );
  return code;
}

/**
 * Resolve um código de indicação para o dono. Só códigos ativados valem:
 * o código nasce inativo e só o aceite do programa (activateReferralProgram)
 * o libera.
 */
export async function resolveReferralCode(code: string): Promise<string | null> {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  const doc = await fsGet(`referral_codes/${normalized}`, { mode: "public" });
  if (doc?.data?.active !== true) return null;
  return (doc?.data?.uid as string) ?? null;
}

/** Registra o vínculo indicador -> indicado. */
export async function createReferralLink(
  referrerUid: string,
  refereeUid: string,
  code: string,
  options: {
    userToken?: string;
    source?: ReferralSource;
    landingPath?: string | null;
  } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await fsCreate(
    "referral_claims",
    {
      referrerUid,
      refereeUid,
      code,
      status: "claimed",
      source: options.source ?? "link",
      landingPath: options.landingPath?.slice(0, 240) || null,
      createdAt: now,
      updatedAt: now,
    },
    refereeUid,
    { mode: "server", userToken: options.userToken },
  );
}

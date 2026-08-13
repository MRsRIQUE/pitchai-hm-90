import { fsGet, fsSet, fsCreate } from "@/lib/firebase.server";

export const REFERRAL_RATE = 0.6;
export const REFERRAL_STORAGE_KEY = "pitchai:ref";

/** Código curto e estável derivado do id do usuário. */
export function codeFromUserId(userId: string): string {
  const hex = userId.replace(/-/g, "").slice(0, 12);
  return parseInt(hex, 16).toString(36).toUpperCase().padStart(8, "0").slice(-8);
}

export function normalizeCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

/**
 * Garante que o usuário tenha um código de indicação no Firestore.
 * Armazenado em referral_codes/{code} (público) e users/{uid}/referral.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const userDoc = await fsGet(`users/${userId}/referral/main`, { mode: "server" });
  const existing = userDoc?.data?.code as string | undefined;
  if (existing) return existing;

  let code = codeFromUserId(userId);
  for (let attempt = 0; attempt < 8; attempt++) {
    const clash = await fsGet(`referral_codes/${code}`, { mode: "public" });
    if (!clash) break;
    code = normalizeCode(code.slice(0, 6) + Math.random().toString(36).slice(2, 4));
  }
  await fsSet(`referral_codes/${code}`, { uid: userId }, { mode: "server" });
  await fsSet(
    `users/${userId}/referral/main`,
    { code, createdAt: new Date().toISOString() },
    { mode: "server" },
  );
  return code;
}

/** Resolve um código de indicação para o dono. */
export async function resolveReferralCode(code: string): Promise<string | null> {
  const doc = await fsGet(`referral_codes/${code}`, { mode: "public" });
  return (doc?.data?.uid as string) ?? null;
}

/** Registra o vínculo indicador -> indicado. */
export async function createReferralLink(
  referrerUid: string,
  refereeUid: string,
  code: string,
): Promise<void> {
  await fsSet(
    `users/${referrerUid}/referrals/${refereeUid}`,
    { referredAt: new Date().toISOString(), code },
    { mode: "server" },
  );
  await fsCreate(
    "referral_claims",
    {
      referrerUid,
      refereeUid,
      code,
      status: "claimed",
      createdAt: new Date().toISOString(),
    },
    refereeUid,
    { mode: "server" },
  );
}

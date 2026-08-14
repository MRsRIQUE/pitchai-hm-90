import { fsGet, fsSet, fsCreate, type FirestoreAuthMode } from "@/lib/firebase.server";

export const REFERRAL_RATE = 0.6;
export const REFERRAL_STORAGE_KEY = "pitchai:ref";

/** Código curto e estável derivado do id do usuário. */
export function codeFromUserId(userId: string): string {
  // Firebase UIDs não são hexadecimais. O parseInt anterior gerava "NAN"
  // para grande parte das contas Google e fazia usuários colidirem no mesmo
  // código. FNV-1a aceita o UID alfanumérico completo e permanece estável.
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0").slice(-8);
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
type ReferralAuth = { mode: FirestoreAuthMode; userToken: string };

export async function ensureReferralCode(userId: string, userToken: string): Promise<string> {
  const auth: ReferralAuth = { mode: "server", userToken };
  const userDoc = await fsGet(`users/${userId}/referral/main`, auth);
  const existing = userDoc?.data?.code as string | undefined;
  if (existing) return existing;

  let code = codeFromUserId(userId);
  let codeAlreadyOwned = false;
  let codeAvailable = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const clash = await fsGet(`referral_codes/${code}`, { mode: "public" });
    if (!clash) {
      codeAvailable = true;
      break;
    }
    if (clash.data.uid === userId) {
      codeAlreadyOwned = true;
      break;
    }
    code = codeFromUserId(`${userId}:${attempt + 1}`);
  }
  if (!codeAvailable && !codeAlreadyOwned) {
    throw new Error("Não foi possível reservar um código de indicação único.");
  }
  if (!codeAlreadyOwned) {
    await fsSet(`referral_codes/${code}`, { uid: userId }, auth);
  }
  await fsSet(`users/${userId}/referral/main`, { code, createdAt: new Date().toISOString() }, auth);
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
  userToken: string,
): Promise<void> {
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
    { mode: "server", userToken },
  );
}

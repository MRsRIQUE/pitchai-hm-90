export const REFERRAL_STORAGE_KEY = "pitchai:ref";
export const REFERRAL_SOURCE_STORAGE_KEY = "pitchai:ref-source";
export const REFERRAL_LANDING_STORAGE_KEY = "pitchai:ref-landing";
export const REFERRAL_TERMS_VERSION = "2026-08-20";

export const REFERRAL_SOURCES = ["link", "seller_code", "checkout"] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

/** Código curto e estável derivado do UID completo do Firebase. */
export function codeFromUserId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0").slice(-8);
}

export function normalizeReferralCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 16);
}

export function isReferralSource(value: unknown): value is ReferralSource {
  return typeof value === "string" && REFERRAL_SOURCES.includes(value as ReferralSource);
}

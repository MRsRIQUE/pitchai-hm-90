export const REFERRAL_STORAGE_KEY = "pitchai:ref";
export const REFERRAL_SOURCE_STORAGE_KEY = "pitchai:ref-source";
export const REFERRAL_LANDING_STORAGE_KEY = "pitchai:ref-landing";

export const REFERRAL_SOURCES = ["link", "seller_code", "checkout"] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

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

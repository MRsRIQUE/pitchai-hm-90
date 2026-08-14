import { fsGet, getSubscription, type FirestoreAuthMode } from "@/lib/firebase.server";
import {
  hasActiveCompedAccess,
  hasPaidAccess,
  type CompedAccessRecord,
  type PlanTier,
  PRICE_TO_PLAN,
} from "@/lib/live/plans";

export type AccessFirestoreOptions = {
  mode?: FirestoreAuthMode;
  userToken?: string;
};

export type EffectiveAccess = {
  active: boolean;
  source: "paid" | "comped" | "none";
  plan: string;
  tier: PlanTier;
  expiresAt: string | null;
};

export async function getCompedAccess(
  userId: string,
  options: AccessFirestoreOptions = {},
): Promise<CompedAccessRecord | null> {
  const document = await fsGet(`comped_access/${userId}`, options);
  return document ? (document.data as CompedAccessRecord) : null;
}

/** Fonte unica de verdade para o acesso efetivo, sem misturar cortesia e pagamento. */
export async function resolveUserAccess(
  userId: string,
  options: AccessFirestoreOptions = {},
): Promise<EffectiveAccess> {
  const [subscription, comped] = await Promise.all([
    getSubscription(userId, options).catch(() => null),
    getCompedAccess(userId, options).catch(() => null),
  ]);

  if (hasPaidAccess(subscription)) {
    const plan = subscription?.plan || "pitchai_mensal";
    return {
      active: true,
      source: "paid",
      plan,
      tier: PRICE_TO_PLAN[plan] || "pro",
      expiresAt: subscription?.current_period_end || subscription?.granted_until || null,
    };
  }

  if (hasActiveCompedAccess(comped)) {
    const plan = comped?.plan || "pitchai_trimestral";
    return {
      active: true,
      source: "comped",
      plan,
      tier: PRICE_TO_PLAN[plan] || "pro",
      expiresAt: comped?.grantedUntil || null,
    };
  }

  return { active: false, source: "none", plan: "free", tier: "free", expiresAt: null };
}

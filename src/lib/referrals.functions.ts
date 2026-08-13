import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth";
import { fsQuery } from "@/lib/firebase.server";
import {
  ensureReferralCode,
  resolveReferralCode,
  createReferralLink,
} from "@/lib/referrals.server";

export type ReferralCommission = {
  id: string;
  plan: string | null;
  base_cents: number;
  amount_cents: number;
  status: string;
  created_at: string;
  paid_at: string | null;
};

export type ReferralSummary = {
  code: string;
  totalIndicados: number;
  totalAssinantes: number;
  totalPendenteCents: number;
  totalPagoCents: number;
  commissions: ReferralCommission[];
};

export const getMyReferralSummary = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<ReferralSummary> => {
    const userId = context.userId;
    const code = await ensureReferralCode(userId);

    const claims = await fsQuery("referral_claims", {
      where: [
        { field: "referrerUid", op: "EQUAL", value: userId },
        { field: "status", op: "EQUAL", value: "claimed" },
      ],
      mode: "server",
    });

    const commissions = await fsQuery("referral_commissions", {
      where: [{ field: "referrerUid", op: "EQUAL", value: userId }],
      orderBy: { field: "createdAt", direction: "DESCENDING" },
      limit: 200,
      mode: "server",
    });

    const mappedCommissions: ReferralCommission[] = commissions.map((c) => ({
      id: c.id,
      plan: (c.data.plan as string) ?? null,
      base_cents: (c.data.base_cents as number) ?? 0,
      amount_cents: (c.data.amount_cents as number) ?? 0,
      status: (c.data.status as string) ?? "pendente",
      created_at: (c.data.createdAt as string) ?? "",
      paid_at: (c.data.paidAt as string) ?? null,
    }));

    return {
      code,
      totalIndicados: claims.length,
      totalAssinantes: claims.length,
      totalPendenteCents: mappedCommissions
        .filter((c) => c.status === "pendente")
        .reduce((s, c) => s + c.amount_cents, 0),
      totalPagoCents: mappedCommissions
        .filter((c) => c.status === "pago")
        .reduce((s, c) => s + c.amount_cents, 0),
      commissions: mappedCommissions,
    };
  });

export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { code: string }) => {
    if (!data?.code || typeof data.code !== "string") throw new Error("Código inválido");
    return { code: data.code.slice(0, 32) };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    const userId = context.userId;
    const { normalizeCode } = await import("@/lib/referrals.server");
    const code = normalizeCode(data.code);
    if (!code) return { ok: false, reason: "invalid" };

    const existing = await fsQuery("referral_claims", {
      where: [{ field: "refereeUid", op: "EQUAL", value: userId }],
      limit: 1,
      mode: "server",
    });
    if (existing.length) return { ok: false, reason: "already" };

    const ownerUid = await resolveReferralCode(code);
    if (!ownerUid || ownerUid === userId) return { ok: false, reason: "notfound" };

    await createReferralLink(ownerUid, userId, code);
    return { ok: true };
  });

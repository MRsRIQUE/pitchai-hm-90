import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth";
import { fsGet, fsQuery, fsSet } from "@/lib/firebase.server";
import {
  ensureReferralCode,
  resolveReferralCode,
  createReferralLink,
} from "@/lib/referrals.server";
import {
  isReferralSource,
  normalizeReferralCode,
  REFERRAL_TERMS_VERSION,
  type ReferralSource,
} from "@/lib/referrals.shared";

export type ReferralCommission = {
  id: string;
  plan: string | null;
  base_cents: number;
  amount_cents: number;
  status: string;
  created_at: string;
  paid_at: string | null;
};

export type ReferralLead = {
  id: string;
  code: string;
  source: ReferralSource | "unknown";
  status: "lead" | "assinante";
  created_at: string;
};

export type ReferralSummary = {
  code: string;
  active: boolean;
  activatedAt: string | null;
  totalIndicados: number;
  totalAssinantes: number;
  totalPendenteCents: number;
  totalPagoCents: number;
  totalCanceladoCents: number;
  conversionRate: number;
  leads: ReferralLead[];
  commissions: ReferralCommission[];
};

export const getMyReferralSummary = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<ReferralSummary> => {
    const userId = context.userId;
    const firestore = { mode: "server" as const, userToken: context.firebaseToken };
    const code = await ensureReferralCode(userId);
    const referralDoc = await fsGet(`users/${userId}/referral/main`, firestore);

    // Todo vínculo é gravado como "claimed" no momento do uso; não há outro
    // status. O filtro extra por status exigia um índice composto
    // (referrerUid + status) que não está implantado e derrubava a consulta
    // inteira com "requires an index", quebrando a página de indicações.
    const claims = await fsQuery("referral_claims", {
      where: [{ field: "referrerUid", op: "EQUAL", value: userId }],
      ...firestore,
    });

    const commissions = await fsQuery("referral_commissions", {
      where: [{ field: "referrerUid", op: "EQUAL", value: userId }],
      orderBy: { field: "createdAt", direction: "DESCENDING" },
      ...firestore,
    });

    const allMappedCommissions: ReferralCommission[] = commissions.map((c) => ({
      id: c.id,
      plan: (c.data.plan as string) ?? null,
      base_cents: (c.data.base_cents as number) ?? 0,
      amount_cents: (c.data.amount_cents as number) ?? 0,
      status: (c.data.status as string) ?? "pendente",
      created_at: (c.data.createdAt as string) ?? (c.data.created_at as string) ?? "",
      paid_at: (c.data.paidAt as string) ?? (c.data.paid_at as string) ?? null,
    }));
    const mappedCommissions = allMappedCommissions.slice(0, 200);
    const subscriberIds = new Set(
      commissions.map((c) => c.data.refereeUid as string).filter(Boolean),
    );
    const leads: ReferralLead[] = claims
      .map((claim) => ({
        id: claim.id,
        code: (claim.data.code as string) ?? code,
        source: isReferralSource(claim.data.source)
          ? (claim.data.source as ReferralSource)
          : ("unknown" as const),
        status: subscriberIds.has(String(claim.data.refereeUid || claim.id))
          ? ("assinante" as const)
          : ("lead" as const),
        created_at: (claim.data.createdAt as string) ?? "",
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const totalAssinantes = subscriberIds.size;

    return {
      code,
      // Só `true` conta. Tratar o campo ausente como ativo escondia o botão de
      // adesão de todo mundo que nunca ativou, e o link exibido nunca funcionava
      // porque referral_codes/{code} continuava inativo.
      active: referralDoc?.data?.active === true,
      activatedAt: (referralDoc?.data?.activatedAt as string) ?? null,
      totalIndicados: claims.length,
      // Um indicado só vira assinante quando há uma comissão registrada para ele.
      totalAssinantes,
      totalPendenteCents: allMappedCommissions
        .filter((c) => c.status === "pendente")
        .reduce((s, c) => s + c.amount_cents, 0),
      totalPagoCents: allMappedCommissions
        .filter((c) => c.status === "pago")
        .reduce((s, c) => s + c.amount_cents, 0),
      totalCanceladoCents: allMappedCommissions
        .filter((c) => c.status === "cancelado")
        .reduce((s, c) => s + c.amount_cents, 0),
      conversionRate: claims.length ? (totalAssinantes / claims.length) * 100 : 0,
      leads,
      commissions: mappedCommissions,
    };
  });

export const activateReferralProgram = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { termsAccepted: boolean; termsVersion: string }) => {
    if (data?.termsAccepted !== true || data?.termsVersion !== REFERRAL_TERMS_VERSION) {
      throw new Error("Aceite dos termos do programa é obrigatório.");
    }
    return { termsAccepted: true as const, termsVersion: REFERRAL_TERMS_VERSION };
  })
  .handler(async ({ context }): Promise<{ ok: true; activatedAt: string }> => {
    const code = await ensureReferralCode(context.userId);
    const activatedAt = new Date().toISOString();

    // Confere a posse do código antes de ativá-lo com a service account, que
    // passa por cima das regras do Firestore. `ensureReferralCode` já garante
    // isso, mas a checagem é barata e a escrita é privilegiada.
    const codeDoc = await fsGet(`referral_codes/${code}`, { mode: "public" });
    if (codeDoc && codeDoc.data?.uid !== context.userId) {
      throw new Error("Código de indicação pertence a outra conta.");
    }

    // `referral_codes/{code}` primeiro: é ele que faz o link funcionar. Se esta
    // escrita falhar, o resumo continua dizendo "inativo" e o usuário pode
    // tentar de novo — em vez de ficar com a conta marcada como ativa e um link
    // que não vincula ninguém.
    //
    // Sem `userToken` de propósito: somente o backend pode alterar o estado do
    // programa. A service account também evita que o cliente forje o aceite.
    await fsSet(
      `referral_codes/${code}`,
      {
        uid: context.userId,
        active: true,
        activatedAt,
        termsAcceptedAt: activatedAt,
        termsVersion: REFERRAL_TERMS_VERSION,
      },
      { mode: "server" },
    );
    await fsSet(
      `users/${context.userId}/referral/main`,
      {
        code,
        active: true,
        activatedAt,
        termsAcceptedAt: activatedAt,
        termsVersion: REFERRAL_TERMS_VERSION,
      },
      { mode: "server" },
    );
    return { ok: true, activatedAt };
  });

export const claimReferral = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { code: string; source?: ReferralSource; landingPath?: string | null }) => {
    if (!data?.code || typeof data.code !== "string") throw new Error("Código inválido");
    return {
      code: data.code.slice(0, 32),
      source: isReferralSource(data.source) ? data.source : ("link" as const),
      landingPath: typeof data.landingPath === "string" ? data.landingPath.slice(0, 240) : null,
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    const userId = context.userId;
    const code = normalizeReferralCode(data.code);
    if (!code) return { ok: false, reason: "invalid" };

    const existing = await fsGet(`referral_claims/${userId}`, {
      mode: "server",
      userToken: context.firebaseToken,
    });
    if (existing) return { ok: false, reason: "already" };

    const ownerUid = await resolveReferralCode(code);
    // "self" é definitivo (abriu o próprio link) e "notfound" é retentável (o
    // indicador ainda pode concluir a adesão). Separados para que o cliente
    // saiba qual dos dois pode descartar.
    if (ownerUid && ownerUid === userId) return { ok: false, reason: "self" };
    if (!ownerUid) return { ok: false, reason: "notfound" };

    await createReferralLink(ownerUid, userId, code, {
      userToken: context.firebaseToken,
      source: data.source,
      landingPath: data.landingPath,
    });
    return { ok: true };
  });

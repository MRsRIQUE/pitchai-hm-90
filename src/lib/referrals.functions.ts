import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth";
import { fsGet, fsQuery, fsSet } from "@/lib/firebase.server";
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
  active: boolean;
  activatedAt: string | null;
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
    const firestore = { mode: "server" as const, userToken: context.firebaseToken };
    const code = await ensureReferralCode(userId, context.firebaseToken);
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
      limit: 200,
      ...firestore,
    });

    const mappedCommissions: ReferralCommission[] = commissions.map((c) => ({
      id: c.id,
      plan: (c.data.plan as string) ?? null,
      base_cents: (c.data.base_cents as number) ?? 0,
      amount_cents: (c.data.amount_cents as number) ?? 0,
      status: (c.data.status as string) ?? "pendente",
      created_at: (c.data.createdAt as string) ?? (c.data.created_at as string) ?? "",
      paid_at: (c.data.paidAt as string) ?? (c.data.paid_at as string) ?? null,
    }));

    return {
      code,
      // Só `true` conta. Tratar o campo ausente como ativo escondia o botão de
      // adesão de todo mundo que nunca ativou, e o link exibido nunca funcionava
      // porque referral_codes/{code} continuava inativo.
      active: referralDoc?.data?.active === true,
      activatedAt: (referralDoc?.data?.activatedAt as string) ?? null,
      totalIndicados: claims.length,
      // Um indicado só vira assinante quando há uma comissão registrada para ele.
      totalAssinantes: new Set(commissions.map((c) => c.data.refereeUid as string).filter(Boolean))
        .size,
      totalPendenteCents: mappedCommissions
        .filter((c) => c.status === "pendente")
        .reduce((s, c) => s + c.amount_cents, 0),
      totalPagoCents: mappedCommissions
        .filter((c) => c.status === "pago")
        .reduce((s, c) => s + c.amount_cents, 0),
      commissions: mappedCommissions,
    };
  });

export const activateReferralProgram = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; activatedAt: string }> => {
    const firestore = { mode: "server" as const, userToken: context.firebaseToken };
    const code = await ensureReferralCode(context.userId, context.firebaseToken);
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
    // Sem `userToken` de propósito: a regra de update de referral_codes exige
    // isServer(), condição que o token do usuário não satisfaz (isServer() é a
    // conta técnica legada). Quem ativa é o servidor, com a service account.
    await fsSet(
      `referral_codes/${code}`,
      { uid: context.userId, active: true, activatedAt },
      { mode: "server" },
    );
    await fsSet(
      `users/${context.userId}/referral/main`,
      { code, active: true, activatedAt },
      firestore,
    );
    return { ok: true, activatedAt };
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

    await createReferralLink(ownerUid, userId, code, context.firebaseToken);
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/lib/firebase-auth";
import { isAdmin, fsQuery, fsSet, fsDelete, fsGet, getSubscription } from "@/lib/firebase.server";

export type RankedProduct = {
  id: string;
  nome: string;
  vendas: number;
  receita: number;
  destaque: boolean;
  link: string | null;
  preco: number;
  imagem_url: string | null;
  categoria: string | null;
  comissao_pct: number;
  ordem: number;
};

export type NewRankedProduct = {
  nome: string;
  vendas?: number;
  receita?: number;
  link?: string | null;
  preco?: number;
  imagem_url?: string | null;
  categoria?: string | null;
  comissao_pct?: number;
  destaque?: boolean;
};

export type Plan = {
  id: string;
  slug: string;
  nome: string;
  preco_mensal: number;
  assinantes: number;
  ordem: number;
};

export type Costs = {
  chat_per_1k_in: number;
  chat_per_1k_out: number;
  tts_per_min: number;
  tokens_in_mes: number;
  tokens_out_mes: number;
  minutos_tts_mes: number;
  usd_brl: number;
};

async function ensureAdmin(ctx: {
  userId: string;
  user?: { email?: string | null };
}): Promise<void> {
  if (!(await isAdmin(ctx.userId, ctx.user?.email))) throw new Error("Forbidden");
}

/* ---------- Auth ---------- */
export async function checkIsAdmin(userId: string, email?: string | null): Promise<boolean> {
  return isAdmin(userId, email);
}

/* ---------- Ranking (server-only) ---------- */
const getRanking = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<RankedProduct[]> => {
    await ensureAdmin(context);
    const docs = await fsQuery("ranked_products", { mode: "server" });
    return docs
      .map((d) => ({
        id: d.id,
        nome: (d.data.nome as string) ?? "",
        vendas: (d.data.vendas as number) ?? 0,
        receita: (d.data.receita as number) ?? 0,
        destaque: (d.data.destaque as boolean) ?? false,
        link: (d.data.link as string) ?? null,
        preco: (d.data.preco as number) ?? 0,
        imagem_url: (d.data.imagem_url as string) ?? null,
        categoria: (d.data.categoria as string) ?? null,
        comissao_pct: (d.data.comissao_pct as number) ?? 0,
        ordem: (d.data.ordem as number) ?? 0,
      }))
      .sort(
        (a, b) =>
          Number(b.destaque) - Number(a.destaque) || a.ordem - b.ordem || b.vendas - a.vendas,
      );
  });

export async function fetchRanking(): Promise<RankedProduct[]> {
  return getRanking({});
}

const insertProducts = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { items: NewRankedProduct[] }) => {
    if (!Array.isArray(data.items)) throw new Error("Invalid items");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    for (const item of data.items) {
      const id = crypto.randomUUID();
      await fsSet(
        `ranked_products/${id}`,
        {
          nome: item.nome,
          vendas: item.vendas ?? 0,
          receita: item.receita ?? 0,
          destaque: item.destaque ?? false,
          link: item.link ?? null,
          preco: item.preco ?? 0,
          imagem_url: item.imagem_url ?? null,
          categoria: item.categoria ?? null,
          comissao_pct: item.comissao_pct ?? 0,
          ordem: 0,
          createdAt: new Date().toISOString(),
        },
        { mode: "server" },
      );
    }
    return { ok: true };
  });

export async function insertRankedProducts(items: NewRankedProduct[]) {
  if (!items.length) return;
  await insertProducts({ data: { items } });
}

const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { id: string; patch: Record<string, unknown> }) => {
    if (!data?.id || typeof data.patch !== "object") throw new Error("Invalid update payload");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { id, patch } = data;
    const current = await fsGet(`ranked_products/${id}`, { mode: "server" });
    if (!current) throw new Error("Produto não encontrado");
    await fsSet(
      `ranked_products/${id}`,
      { ...(current.data as any), ...patch },
      { mode: "server" },
    );
    return { ok: true };
  });

export async function updateRankedProduct(id: string, patch: Partial<Omit<RankedProduct, "id">>) {
  await updateProduct({ data: { id, patch } });
}

const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { id: string }) => {
    if (!data?.id) throw new Error("Invalid id");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    await fsDelete(`ranked_products/${data.id}`, { mode: "server" });
    return { ok: true };
  });

export async function deleteRankedProduct(id: string) {
  await deleteProduct({ data: { id } });
}

const deleteAllProducts = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const docs = await fsQuery("ranked_products", { mode: "server" });
    for (const d of docs) await fsDelete(`ranked_products/${d.id}`, { mode: "server" });
    return { ok: true };
  });

export async function deleteAllRankedProducts() {
  await deleteAllProducts({});
}

/**
 * Parseia CSV/colagens:
 *   nome,vendas,receita[,preco[,comissao_pct[,link[,imagem_url[,categoria]]]]]
 *
 * Separador: , ; ou tab.
 * Se a primeira linha começar com "nome"/"name"/"produto"/"product"
 * e a segunda coluna com "vendas"/"sales"/"qtd", é tratada como cabeçalho.
 *
 * Colunas opcionais (a partir da 4ª) são reconhecidas por nome de cabeçalho
 * ou por posição ordinal quando ausente o cabeçalho.
 */
export function parseRankingCSV(raw: string): NewRankedProduct[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: NewRankedProduct[] = [];
  if (!lines.length) return out;

  const isHeaderRow = (cols: string[]) =>
    /^(nome|name|produto|product)$/i.test(cols[0]) && /^(vendas|sales|qtd)$/i.test(cols[1] ?? "");

  const firstCols = lines[0].split(/[,;\t]/).map((c) => c.trim());
  const hasHeader = isHeaderRow(firstCols);
  const headerCols = hasHeader ? firstCols.map((c) => c.toLowerCase()) : [];

  const colIndex = (names: string[]): number => {
    if (!hasHeader) return -1;
    for (const n of names) {
      const idx = headerCols.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const revenueIdx = colIndex(["receita", "revenue"]);
  const priceIdx = colIndex(["preco", "price"]);
  const commissionIdx = colIndex(["comissao_pct", "comissao", "commission"]);
  const linkIdx = colIndex(["link", "url"]);
  const imageIdx = colIndex(["imagem_url", "imagem", "image"]);
  const categoryIdx = colIndex(["categoria", "category"]);

  const dataLines = hasHeader ? lines.slice(1) : lines;

  for (const line of dataLines) {
    const cols = line.split(/[,;\t]/).map((c) => c.trim());
    if (cols.length < 2) continue;

    const nome = cols[0];
    if (!nome) continue;

    const numOr0 = (v: string | undefined) => (v ? Number(v.replace(/[^\d.-]/g, "")) || 0 : 0);

    const vendas = numOr0(cols[1]);
    const receita = revenueIdx >= 0 ? numOr0(cols[revenueIdx]) : numOr0(cols[2]);
    const preco = priceIdx >= 0 ? numOr0(cols[priceIdx]) : numOr0(cols[3]);
    const comissao = commissionIdx >= 0 ? numOr0(cols[commissionIdx]) : numOr0(cols[4]);
    const link = linkIdx >= 0 ? (cols[linkIdx] ?? "") : (cols[5] ?? "");
    const imagem = imageIdx >= 0 ? (cols[imageIdx] ?? "") : (cols[6] ?? "");
    const categoria = categoryIdx >= 0 ? (cols[categoryIdx] ?? "") : (cols[7] ?? "");

    const finalReceita = receita || (preco && vendas ? preco * vendas : 0);

    out.push({
      nome,
      vendas,
      receita: finalReceita,
      preco: preco || undefined,
      comissao_pct: comissao || undefined,
      link: link.trim() || undefined,
      imagem_url: imagem.trim() || undefined,
      categoria: categoria.trim() || undefined,
    });
  }
  return out;
}

/* ---------- Planos (server-only) ---------- */
const getPlans = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<Plan[]> => {
    await ensureAdmin(context);
    const docs = await fsQuery("admin_plans", {
      orderBy: { field: "ordem", direction: "ASCENDING" },
      mode: "server",
    });
    return docs.map((d) => ({
      id: d.id,
      slug: (d.data.slug as string) ?? d.id,
      nome: (d.data.nome as string) ?? "",
      preco_mensal: (d.data.preco_mensal as number) ?? 0,
      assinantes: (d.data.assinantes as number) ?? 0,
      ordem: (d.data.ordem as number) ?? 0,
    }));
  });

export async function fetchPlans(): Promise<Plan[]> {
  return getPlans({});
}

const updatePlanFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { id: string; patch: Record<string, unknown> }) => {
    if (!data?.id || typeof data.patch !== "object") throw new Error("Invalid update payload");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { id, patch } = data;
    const current = await fsGet(`admin_plans/${id}`, { mode: "server" });
    await fsSet(
      `admin_plans/${id}`,
      { ...((current?.data as any) ?? {}), ...patch },
      { mode: "server" },
    );
    return { ok: true };
  });

export async function updatePlan(id: string, patch: Partial<Plan>) {
  await updatePlanFn({ data: { id, patch } });
}

/* ---------- Custos IA (server-only) ---------- */
const getCosts = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<Costs> => {
    await ensureAdmin(context);
    const doc = await fsGet("admin_settings/costs", { mode: "server" });
    return {
      chat_per_1k_in: (doc?.data?.chat_per_1k_in as number) ?? 0.0001,
      chat_per_1k_out: (doc?.data?.chat_per_1k_out as number) ?? 0.0004,
      tts_per_min: (doc?.data?.tts_per_min as number) ?? 0.015,
      tokens_in_mes: (doc?.data?.tokens_in_mes as number) ?? 0,
      tokens_out_mes: (doc?.data?.tokens_out_mes as number) ?? 0,
      minutos_tts_mes: (doc?.data?.minutos_tts_mes as number) ?? 0,
      usd_brl: (doc?.data?.usd_brl as number) ?? 5.6,
    };
  });

export async function fetchCosts(): Promise<Costs> {
  return getCosts({});
}

const COST_KEYS: (keyof Costs)[] = [
  "chat_per_1k_in",
  "chat_per_1k_out",
  "tts_per_min",
  "tokens_in_mes",
  "tokens_out_mes",
  "minutos_tts_mes",
  "usd_brl",
];

const updateCostsFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: Record<string, unknown>) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid payload");
    const sanitized: Record<string, number> = {};
    for (const key of COST_KEYS) {
      if (key in data) {
        const val = Number((data as Record<string, unknown>)[key]);
        if (!Number.isFinite(val)) throw new Error(`Invalid value for ${key}`);
        sanitized[key] = val;
      }
    }
    if (Object.keys(sanitized).length === 0) throw new Error("No valid cost fields provided");
    return sanitized;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const current = await fsGet("admin_settings/costs", { mode: "server" });
    await fsSet(
      "admin_settings/costs",
      { ...((current?.data as any) ?? {}), ...data },
      { mode: "server" },
    );
    return { ok: true };
  });

export async function updateCosts(patch: Partial<Costs>) {
  await updateCostsFn({ data: patch });
}

/* ---------- Indicações (afiliados) ---------- */
export type AdminCommission = {
  id: string;
  referrer_id: string;
  referred_id: string;
  plan: string | null;
  base_cents: number;
  amount_cents: number;
  status: string;
  created_at: string;
  paid_at: string | null;
};

const getCommissions = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<AdminCommission[]> => {
    await ensureAdmin(context);
    const docs = await fsQuery("referral_commissions", {
      orderBy: { field: "createdAt", direction: "DESCENDING" },
      limit: 500,
      mode: "server",
    });
    return docs.map((d) => ({
      id: d.id,
      referrer_id: (d.data.referrerUid as string) ?? "",
      referred_id: (d.data.refereeUid as string) ?? "",
      plan: (d.data.plan as string) ?? null,
      base_cents: (d.data.base_cents as number) ?? 0,
      amount_cents: (d.data.amount_cents as number) ?? 0,
      status: (d.data.status as string) ?? "pendente",
      created_at: (d.data.createdAt as string) ?? "",
      paid_at: (d.data.paidAt as string) ?? null,
    }));
  });

export async function fetchCommissions(): Promise<AdminCommission[]> {
  return getCommissions({});
}

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { id: string; status: "pendente" | "pago" | "cancelado" }) => {
    if (!data?.id || !["pendente", "pago", "cancelado"].includes(data.status))
      throw new Error("Invalid status payload");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { id, status } = data;
    const current = await fsGet(`referral_commissions/${id}`, { mode: "server" });
    if (current) {
      await fsSet(
        `referral_commissions/${id}`,
        {
          ...(current.data as any),
          status,
          paidAt: status === "pago" ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        },
        { mode: "server" },
      );
    }
    return { ok: true };
  });

export async function setCommissionStatus(id: string, status: "pendente" | "pago" | "cancelado") {
  await setStatusFn({ data: { id, status } });
}

/* ---------- Custos por Usuário & Cotas (funções puras) ---------- */
export type UserCostProfile = {
  userId: string;
  email: string;
  plan: "gratuito" | "starter" | "pro" | "studio";
  status: "active" | "comped" | "quota_exceeded" | "blocked";
  tokensIn: number;
  tokensOut: number;
  ttsMinutes: number;
  livesCount: number;
  estimatedCostUsd: number;
  estimatedCostBrl: number;
  planRevenueBrl: number;
  netMarginBrl: number;
  lastActive: string;
};

export type PlanQuota = {
  planSlug: string;
  planName: string;
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
  ttsMinutesLimit: number;
  allowedModel: "flash" | "pro" | "both";
  overLimitAction: "block" | "throttle" | "alert";
};

export const DEFAULT_PLAN_QUOTAS: Record<string, PlanQuota> = {
  gratuito: {
    planSlug: "gratuito",
    planName: "Gratuito (Trial)",
    dailyTokenLimit: 15000,
    monthlyTokenLimit: 100000,
    ttsMinutesLimit: 5,
    allowedModel: "flash",
    overLimitAction: "block",
  },
  starter: {
    planSlug: "starter",
    planName: "Iniciante",
    dailyTokenLimit: 100000,
    monthlyTokenLimit: 1000000,
    ttsMinutesLimit: 30,
    allowedModel: "flash",
    overLimitAction: "throttle",
  },
  pro: {
    planSlug: "pro",
    planName: "Profissional",
    dailyTokenLimit: 500000,
    monthlyTokenLimit: 5000000,
    ttsMinutesLimit: 180,
    allowedModel: "both",
    overLimitAction: "alert",
  },
  studio: {
    planSlug: "studio",
    planName: "Live Studio High Scale",
    dailyTokenLimit: 2000000,
    monthlyTokenLimit: 20000000,
    ttsMinutesLimit: 600,
    allowedModel: "both",
    overLimitAction: "alert",
  },
};

/** Calcula os custos estimados e a margem líquida de um usuário com base no consumo e nos preços do provedor */
export function calculateUserCost(
  tokensIn: number,
  tokensOut: number,
  ttsMinutes: number,
  prices: Costs,
  planPriceBrl: number,
) {
  const chatInUsd = (tokensIn / 1000) * Number(prices.chat_per_1k_in || 0.0001);
  const chatOutUsd = (tokensOut / 1000) * Number(prices.chat_per_1k_out || 0.0004);
  const ttsUsd = ttsMinutes * Number(prices.tts_per_min || 0.015);
  const totalUsd = chatInUsd + chatOutUsd + ttsUsd;
  const totalBrl = totalUsd * Number(prices.usd_brl || 5.6);
  const netMarginBrl = planPriceBrl - totalBrl;
  const marginPct =
    planPriceBrl > 0 ? (netMarginBrl / planPriceBrl) * 100 : totalBrl > 0 ? -100 : 0;

  return {
    chatInUsd,
    chatOutUsd,
    ttsUsd,
    totalUsd,
    totalBrl,
    netMarginBrl,
    marginPct,
  };
}

/* ---------- Usuários com uso de IA (server-only) ---------- */

export type AdminUserUsage = {
  userId: string;
  email: string;
  plan: string;
  status: string;
  tokensInput: number;
  tokensOutput: number;
  totalTokens: number;
  ttsMinutes: number;
  apiCallCount: number;
  lastApiCallAt: string;
  activeModel: string;
  isBlocked: boolean;
  isComped: boolean;
  costEstimateUsd: number;
};

const getUsersWithUsage = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<AdminUserUsage[]> => {
    await ensureAdmin(context);
    // Lê todos os docs de ai_usage_stats para obter uso real
    const docs = await fsQuery("ai_usage_stats", { limit: 500, mode: "server" });
    const out: AdminUserUsage[] = [];
    for (const d of docs) {
      const sub = await getSubscription(d.id, { mode: "server" });
      const planFromSub = sub?.plan ?? "gratuito";
      const statFromSub = sub?.status ?? "active";
      const isComped = sub?.status === "comped";
      const usageStatus = (d.data.status as string) ?? "active";
      const isBlocked = usageStatus === "blocked";
      out.push({
        userId: d.id,
        email: (d.data.userEmail as string) ?? "(sem e-mail)",
        plan: planFromSub,
        status: statFromSub,
        tokensInput: (d.data.tokensInput as number) ?? 0,
        tokensOutput: (d.data.tokensOutput as number) ?? 0,
        totalTokens: (d.data.totalTokens as number) ?? 0,
        ttsMinutes: (d.data.ttsMinutes as number) ?? 0,
        apiCallCount: (d.data.apiCallCount as number) ?? 0,
        lastApiCallAt: (d.data.lastApiCallAt as string) ?? "",
        activeModel: (d.data.activeModel as string) ?? "gemini-2.5-flash",
        isBlocked,
        isComped,
        costEstimateUsd: (d.data.costEstimateUsd as number) ?? 0,
      });
    }
    return out;
  });

export async function fetchUsersWithUsage(): Promise<AdminUserUsage[]> {
  return getUsersWithUsage({});
}

const setBlockedFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { userId: string; blocked: boolean }) => {
    if (!data?.userId) throw new Error("Invalid userId");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const current = await fsGet(`ai_usage_stats/${data.userId}`, { mode: "server" });
    const status = data.blocked ? "blocked" : "active";
    await fsSet(
      `ai_usage_stats/${data.userId}`,
      {
        ...((current?.data as any) ?? {}),
        status,
        updatedAt: new Date().toISOString(),
      },
      { mode: "server" },
    );
    return { ok: true };
  });

export async function setUserBlocked(userId: string, blocked: boolean) {
  await setBlockedFn({ data: { userId, blocked } });
}

const resetUsageAdminFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { userId: string }) => {
    if (!data?.userId) throw new Error("Invalid userId");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const current = await fsGet(`ai_usage_stats/${data.userId}`, { mode: "server" });
    if (!current) return { ok: true };
    await fsSet(
      `ai_usage_stats/${data.userId}`,
      {
        ...(current.data as any),
        tokensInput: 0,
        tokensOutput: 0,
        totalTokens: 0,
        apiCallCount: 0,
        callFrequencyPerMin: 0,
        costEstimateUsd: 0,
        updatedAt: new Date().toISOString(),
      },
      { mode: "server" },
    );
    return { ok: true };
  });

export async function resetUserUsageAdmin(userId: string) {
  await resetUsageAdminFn({ data: { userId } });
}

/* ---------- Cotas / Planos (server-only) ---------- */

const getPlanQuotas = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<Record<string, PlanQuota>> => {
    await ensureAdmin(context);
    const doc = await fsGet("admin_settings/plan_quotas", { mode: "server" });
    if (!doc?.data) return DEFAULT_PLAN_QUOTAS;
    const stored = doc.data as Record<string, unknown>;
    const out: Record<string, PlanQuota> = {};
    for (const [key, val] of Object.entries(DEFAULT_PLAN_QUOTAS)) {
      const override = stored[key] as Record<string, unknown> | undefined;
      out[key] = {
        ...val,
        ...(override ?? {}),
      };
    }
    return out;
  });

export async function fetchPlanQuotas(): Promise<Record<string, PlanQuota>> {
  return getPlanQuotas({});
}

const savePlanQuotasFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: Record<string, PlanQuota>) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid quotas payload");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const current = await fsGet("admin_settings/plan_quotas", { mode: "server" });
    await fsSet(
      "admin_settings/plan_quotas",
      {
        ...((current?.data as any) ?? {}),
        ...data,
        savedAt: new Date().toISOString(),
      },
      { mode: "server" },
    );
    return { ok: true };
  });

export async function savePlanQuotas(quotas: Record<string, PlanQuota>) {
  await savePlanQuotasFn({ data: quotas });
}

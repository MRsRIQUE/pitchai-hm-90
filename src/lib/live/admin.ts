import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth, type FirebaseAuthContext } from "@/lib/firebase-auth";
import {
  isAdmin,
  fsQuery,
  fsGetMany,
  fsSet,
  fsDelete,
  fsGet,
  type SubscriptionData,
} from "@/lib/firebase.server";
import { PITCHAI_PLANS } from "@/lib/live/plans";
import { DEFAULT_PLAN_QUOTAS, PLAN_QUOTA_SCHEMA_VERSION, type PlanQuota } from "@/lib/live/quotas";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import { AdminError } from "@/lib/admin/errors";
import { fsDeleteMany } from "@/lib/admin/firestore";
import { normalizeReferralCode } from "@/lib/referrals.shared";
import type Stripe from "stripe";

export { DEFAULT_PLAN_QUOTAS, type PlanQuota } from "@/lib/live/quotas";
import { parseLocaleNumber } from "@/lib/live/number-parsing";
export { parseLocaleNumber } from "@/lib/live/number-parsing";

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
  amount_cents: number;
  months: number;
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

export type StripeAdminSubscription = {
  id: string;
  customerId: string;
  email: string;
  plan: string;
  amountCents: number;
  currency: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  firestoreSynced: boolean;
  dashboardUrl: string;
};

export type StripeAdminInvoice = {
  id: string;
  email: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
  hostedUrl: string | null;
};

export type StripeAdminSnapshot = {
  environment: StripeEnv;
  currency: string;
  mrrCents: number;
  paidLast30DaysCents: number;
  availableBalanceCents: number;
  pendingBalanceCents: number;
  active: number;
  trialing: number;
  pastDue: number;
  canceled: number;
  unsynced: number;
  subscriptions: StripeAdminSubscription[];
  recentInvoices: StripeAdminInvoice[];
  fetchedAt: string;
};

export type AdminPromotionCode = {
  id: string;
  couponId: string;
  code: string;
  active: boolean;
  percentOff: number;
  duration: "once" | "forever" | "repeating";
  durationInMonths: number | null;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  firstTimeOnly: boolean;
  affiliateUid: string;
  affiliateCode: string;
  affiliateName: string;
  createdAt: string;
  environment: StripeEnv;
};

export type CreateAdminPromotionCode = {
  code: string;
  percentOff: number;
  duration: "once" | "forever";
  affiliateCode: string;
  firstTimeOnly?: boolean;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
};

/** Falha de leitura do Firestore nunca derruba o fluxo: vira "não é admin". */
async function safeIsAdmin(
  uid: string,
  email?: string | null,
  options?: { mode?: "server"; userToken?: string },
): Promise<boolean> {
  try {
    return await isAdmin(uid, email, options);
  } catch {
    return false;
  }
}

async function ensureAdmin(ctx: FirebaseAuthContext): Promise<void> {
  if (!(await safeIsAdmin(ctx.userId, ctx.user?.email, adminFirestoreOptions(ctx))))
    throw new AdminError(403, "Forbidden");
}

function adminFirestoreOptions(ctx: FirebaseAuthContext) {
  return { mode: "server" as const, userToken: ctx.firebaseToken };
}

type SubscriptionWithUser = SubscriptionData & { userId: string };

async function fetchSubscriptionsForUsers(
  ctx: FirebaseAuthContext,
  userIds: string[],
): Promise<SubscriptionWithUser[]> {
  const firestore = adminFirestoreOptions(ctx);
  const docs = await fsGetMany(
    userIds.map((userId) => `users/${userId}/subscription/current`),
    firestore,
  );
  return docs
    .filter((doc) => doc.id === "current")
    .map((doc) => {
      const match = doc.path.match(/^users\/([^/]+)\/subscription\/current$/);
      const data = doc.data as unknown as SubscriptionData;
      return { ...data, userId: data.user_id || match?.[1] || "" };
    })
    .filter((subscription) => Boolean(subscription.userId));
}

async function fetchAllSubscriptions(ctx: FirebaseAuthContext): Promise<SubscriptionWithUser[]> {
  const users = await fsQuery("users", adminFirestoreOptions(ctx));
  return fetchSubscriptionsForUsers(
    ctx,
    users.map((user) => user.id),
  );
}

function isRevenueActive(subscription: SubscriptionData): boolean {
  if (subscription.status !== "active") return false;
  const end = subscription.current_period_end || subscription.granted_until;
  return !end || (Number.isFinite(Date.parse(end)) && Date.parse(end) > Date.now());
}

/* ---------- Auth ---------- */
const getAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const admin = await safeIsAdmin(
        context.userId,
        context.user?.email,
        adminFirestoreOptions(context),
      );
      return { ok: admin };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[getAdminStatus] Erro:", msg);
      return { ok: false, error: msg };
    }
  });

export async function checkIsAdmin(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await getAdminStatus({});
    if (res.error) console.error("[checkIsAdmin] Server error:", res.error);
    return res;
  } catch (e) {
    const msg =
      e instanceof Response
        ? `HTTP ${e.status}: ${await e.text().catch(() => "")}`
        : e instanceof Error
          ? e.message
          : String(e);
    console.error("[checkIsAdmin] Network/HTTP error:", msg);
    return { ok: false, error: msg };
  }
}

/* ---------- Ranking (server-only) ---------- */
const getRanking = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<RankedProduct[]> => {
    await ensureAdmin(context);
    const docs = await fsQuery("ranked_products", adminFirestoreOptions(context));
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
    const firestore = adminFirestoreOptions(context);
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
        firestore,
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
    const allowed = new Set([
      "nome",
      "vendas",
      "receita",
      "destaque",
      "link",
      "preco",
      "imagem_url",
      "categoria",
      "comissao_pct",
      "ordem",
    ]);
    const patch = Object.fromEntries(
      Object.entries(data.patch).filter(([key]) => allowed.has(key)),
    );
    if (!Object.keys(patch).length) throw new Error("No valid product fields provided");
    return { id: data.id, patch };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const firestore = adminFirestoreOptions(context);
    const { id, patch } = data;
    const current = await fsGet(`ranked_products/${id}`, firestore);
    if (!current) throw new Error("Produto não encontrado");
    await fsSet(`ranked_products/${id}`, { ...(current.data as any), ...patch }, firestore);
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
    await fsDelete(`ranked_products/${data.id}`, adminFirestoreOptions(context));
    return { ok: true };
  });

export async function deleteRankedProduct(id: string) {
  await deleteProduct({ data: { id } });
}

const deleteAllProducts = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const firestore = adminFirestoreOptions(context);
    const docs = await fsQuery("ranked_products", firestore);
    await fsDeleteMany(
      docs.map((d) => `ranked_products/${d.id}`),
      firestore,
    );
    return { ok: true };
  });

export async function deleteAllRankedProducts() {
  await deleteAllProducts({});
}

function detectDelimiter(line: string): "," | ";" | "\t" {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
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

  const delimiter = detectDelimiter(lines[0]);
  const firstCols = splitDelimitedLine(lines[0], delimiter);
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
    const cols = splitDelimitedLine(line, delimiter);
    if (cols.length < 2) continue;

    const nome = cols[0];
    if (!nome) continue;

    const vendas = parseLocaleNumber(cols[1]);
    const receita =
      revenueIdx >= 0 ? parseLocaleNumber(cols[revenueIdx]) : parseLocaleNumber(cols[2]);
    const preco = priceIdx >= 0 ? parseLocaleNumber(cols[priceIdx]) : parseLocaleNumber(cols[3]);
    const comissao =
      commissionIdx >= 0 ? parseLocaleNumber(cols[commissionIdx]) : parseLocaleNumber(cols[4]);
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
    const subscriptions = await fetchAllSubscriptions(context);
    const activeCounts = subscriptions.reduce<Record<string, number>>((counts, subscription) => {
      if (isRevenueActive(subscription)) {
        counts[subscription.plan] = (counts[subscription.plan] ?? 0) + 1;
      }
      return counts;
    }, {});
    return PITCHAI_PLANS.map((plan, index) => ({
      id: plan.priceId,
      slug: plan.priceId,
      nome: plan.name,
      amount_cents: plan.amountCents,
      months: plan.months,
      preco_mensal: plan.amountCents / 100 / plan.months,
      assinantes: activeCounts[plan.priceId] ?? 0,
      ordem: index,
    }));
  });

export async function fetchPlans(): Promise<Plan[]> {
  return getPlans({});
}

function stripeEnvironment(): StripeEnv {
  return process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "sandbox";
}

function monthlyRecurringCents(
  price: Stripe.Price | Stripe.DeletedPrice | undefined,
  quantity = 1,
): number {
  const live = price && !price.deleted ? price : undefined;
  const amount = Number(live?.unit_amount || 0) * Math.max(1, Number(quantity || 1));
  const interval = live?.recurring?.interval;
  const count = Math.max(1, Number(live?.recurring?.interval_count || 1));
  if (interval === "year") return Math.round(amount / (12 * count));
  if (interval === "week") return Math.round((amount * 52) / (12 * count));
  if (interval === "day") return Math.round((amount * 365) / (12 * count));
  return Math.round(amount / count);
}

async function listAllStripeSubscriptions(stripe: Stripe): Promise<Stripe.Subscription[]> {
  const subscriptions: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.subscriptions.list({
      status: "all",
      limit: 100,
      expand: ["data.customer"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    subscriptions.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    if (page.has_more && !startingAfter) throw new Error("Stripe retornou paginação inválida");
  } while (startingAfter);
  return subscriptions;
}

async function listAllStripeInvoicesSince(
  stripe: Stripe,
  since: number,
): Promise<Stripe.Invoice[]> {
  const invoices: Stripe.Invoice[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.invoices.list({
      created: { gte: since },
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    invoices.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    if (page.has_more && !startingAfter) throw new Error("Stripe retornou paginação inválida");
  } while (startingAfter);
  return invoices;
}

const getStripeAdminSnapshot = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<StripeAdminSnapshot> => {
    await ensureAdmin(context);
    const environment = stripeEnvironment();
    const stripe = createStripeClient(environment);
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

    const [stripeSubscriptions, stripeInvoices, balance, firestoreSubs] = await Promise.all([
      listAllStripeSubscriptions(stripe),
      listAllStripeInvoicesSince(stripe, since),
      stripe.balance.retrieve(),
      fetchAllSubscriptions(context),
    ]);

    const firestoreIds = new Set(
      firestoreSubs.map((sub) => sub.stripe_subscription_id).filter(Boolean),
    );
    const dashboardBase =
      environment === "live" ? "https://dashboard.stripe.com" : "https://dashboard.stripe.com/test";

    const subscriptions = stripeSubscriptions.map((sub): StripeAdminSubscription => {
      const item = sub.items?.data?.[0];
      const customer =
        typeof sub.customer === "object" && sub.customer !== null && !sub.customer.deleted
          ? sub.customer
          : null;
      const email = String(customer?.email || sub.metadata?.email || "");
      const price = item?.price && !item.price.deleted ? item.price : undefined;
      const periodEnd = item?.current_period_end;
      return {
        id: sub.id,
        customerId: String(customer?.id || sub.customer || ""),
        email,
        plan: String(price?.lookup_key || sub.metadata?.plan || "Sem lookup_key"),
        amountCents: Number(price?.unit_amount || 0) * Number(item?.quantity || 1),
        currency: String(price?.currency || "brl").toUpperCase(),
        status: String(sub.status || "unknown"),
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        firestoreSynced: firestoreIds.has(sub.id),
        dashboardUrl: `${dashboardBase}/subscriptions/${sub.id}`,
      };
    });

    const revenueStatuses = new Set(["active", "trialing", "past_due"]);
    const mrrCents = stripeSubscriptions.reduce((sum, sub) => {
      if (!revenueStatuses.has(String(sub.status))) return sum;
      return (
        sum +
        (sub.items?.data || []).reduce(
          (itemSum, item) => itemSum + monthlyRecurringCents(item.price, item.quantity),
          0,
        )
      );
    }, 0);

    const balanceAmount = (kind: "available" | "pending") =>
      (balance[kind] || [])
        .filter((item) => item.currency === "brl")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paidInvoices = stripeInvoices.filter((invoice) => invoice.status === "paid");

    return {
      environment,
      currency: "BRL",
      mrrCents,
      paidLast30DaysCents: paidInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.amount_paid || 0),
        0,
      ),
      availableBalanceCents: balanceAmount("available"),
      pendingBalanceCents: balanceAmount("pending"),
      active: subscriptions.filter((sub) => sub.status === "active").length,
      trialing: subscriptions.filter((sub) => sub.status === "trialing").length,
      pastDue: subscriptions.filter((sub) =>
        ["past_due", "unpaid", "incomplete"].includes(sub.status),
      ).length,
      canceled: subscriptions.filter((sub) => sub.status === "canceled").length,
      unsynced: subscriptions.filter(
        (sub) => ["active", "trialing", "past_due"].includes(sub.status) && !sub.firestoreSynced,
      ).length,
      subscriptions,
      recentInvoices: stripeInvoices.slice(0, 20).map((invoice): StripeAdminInvoice => ({
        id: invoice.id,
        email: String(invoice.customer_email || ""),
        amountCents: Number(invoice.amount_paid || invoice.amount_due || 0),
        currency: String(invoice.currency || "brl").toUpperCase(),
        status: String(invoice.status || "unknown"),
        createdAt: new Date(Number(invoice.created || 0) * 1000).toISOString(),
        hostedUrl: invoice.hosted_invoice_url || null,
      })),
      fetchedAt: new Date().toISOString(),
    };
  });

export async function fetchStripeAdminSnapshot(): Promise<StripeAdminSnapshot> {
  return getStripeAdminSnapshot({});
}

async function listAllPromotionCodes(stripe: Stripe): Promise<Stripe.PromotionCode[]> {
  const result: Stripe.PromotionCode[] = [];
  let startingAfter: string | undefined;
  do {
    const page = await stripe.promotionCodes.list({
      limit: 100,
      expand: ["data.promotion.coupon"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    result.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    if (page.has_more && !startingAfter) throw new Error("Stripe retornou paginação inválida");
  } while (startingAfter);
  return result;
}

function mapPromotionCode(
  promotionCode: Stripe.PromotionCode,
  environment: StripeEnv,
): AdminPromotionCode | null {
  const metadata = promotionCode.metadata ?? {};
  if (metadata.managedBy !== "pitchai-admin") return null;
  const coupon =
    typeof promotionCode.promotion.coupon === "object" ? promotionCode.promotion.coupon : null;
  if (!coupon) return null;
  return {
    id: promotionCode.id,
    couponId: coupon.id,
    code: promotionCode.code,
    active: promotionCode.active,
    percentOff: Number(coupon.percent_off || metadata.discountPercent || 0),
    duration: coupon.duration,
    durationInMonths: coupon.duration_in_months ?? null,
    timesRedeemed: promotionCode.times_redeemed,
    maxRedemptions: promotionCode.max_redemptions,
    expiresAt: promotionCode.expires_at
      ? new Date(promotionCode.expires_at * 1000).toISOString()
      : null,
    firstTimeOnly: promotionCode.restrictions.first_time_transaction,
    affiliateUid: String(metadata.affiliateUid || ""),
    affiliateCode: String(metadata.affiliateCode || ""),
    affiliateName: String(metadata.affiliateName || "Afiliado"),
    createdAt: new Date(promotionCode.created * 1000).toISOString(),
    environment,
  };
}

const getPromotionCodesAdmin = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<AdminPromotionCode[]> => {
    await ensureAdmin(context);
    const environment = stripeEnvironment();
    const stripe = createStripeClient(environment);
    const codes = await listAllPromotionCodes(stripe);
    return codes
      .map((code) => mapPromotionCode(code, environment))
      .filter((code): code is AdminPromotionCode => code !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

export async function fetchPromotionCodesAdmin(): Promise<AdminPromotionCode[]> {
  return getPromotionCodesAdmin({});
}

function promotionCodeInput(data: CreateAdminPromotionCode): CreateAdminPromotionCode {
  const code = String(data?.code || "")
    .trim()
    .toUpperCase();
  const affiliateCode = normalizeReferralCode(data?.affiliateCode || "");
  const percentOff = Number(data?.percentOff);
  const duration = data?.duration === "once" ? "once" : "forever";
  const maxRedemptions =
    data?.maxRedemptions == null || data.maxRedemptions === 0
      ? null
      : Math.floor(Number(data.maxRedemptions));
  const expiresAt = data?.expiresAt ? new Date(data.expiresAt).toISOString() : null;
  if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
    throw new Error("O cupom deve ter entre 3 e 32 letras, números ou hífens");
  }
  if (!affiliateCode) throw new Error("Selecione um afiliado");
  if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
    throw new Error("O desconto deve ser maior que 0 e menor ou igual a 100%");
  }
  if (maxRedemptions !== null && maxRedemptions < 1) {
    throw new Error("O limite de usos deve ser positivo");
  }
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    throw new Error("A validade precisa estar no futuro");
  }
  return {
    code,
    affiliateCode,
    percentOff,
    duration,
    firstTimeOnly: data.firstTimeOnly === true,
    maxRedemptions,
    expiresAt,
  };
}

const createPromotionCodeAdminFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator(promotionCodeInput)
  .handler(async ({ data, context }): Promise<AdminPromotionCode> => {
    await ensureAdmin(context);
    const environment = stripeEnvironment();
    const stripe = createStripeClient(environment);
    const affiliate = await fsGet(`referral_codes/${data.affiliateCode}`, { mode: "server" });
    const affiliateUid = String(affiliate?.data?.uid || "");
    if (!affiliateUid || affiliate?.data?.active !== true) {
      throw new Error("O código do afiliado não existe ou está pausado");
    }
    const profile = await fsGet(`users/${affiliateUid}`, { mode: "server" });
    const affiliateName = String(
      profile?.data?.displayName ||
        profile?.data?.name ||
        profile?.data?.email ||
        data.affiliateCode,
    ).slice(0, 120);
    const duplicate = await stripe.promotionCodes.list({ code: data.code, active: true, limit: 1 });
    if (duplicate.data.length) throw new Error("Já existe um cupom ativo com esse código");

    const metadata: Record<string, string> = {
      managedBy: "pitchai-admin",
      affiliateUid,
      affiliateCode: data.affiliateCode,
      affiliateName,
      discountPercent: String(data.percentOff),
    };
    const coupon = await stripe.coupons.create({
      name: `${data.code} · ${data.percentOff}%`,
      percent_off: data.percentOff,
      duration: data.duration,
      metadata,
    });

    let promotionCode: Stripe.PromotionCode | null = null;
    try {
      promotionCode = await stripe.promotionCodes.create({
        code: data.code,
        active: true,
        promotion: { type: "coupon", coupon: coupon.id },
        metadata,
        ...(data.expiresAt ? { expires_at: Math.floor(Date.parse(data.expiresAt) / 1000) } : {}),
        ...(data.maxRedemptions ? { max_redemptions: data.maxRedemptions } : {}),
        restrictions: { first_time_transaction: data.firstTimeOnly === true },
        expand: ["promotion.coupon"],
      });
      await fsSet(
        `affiliate_coupon_codes/${promotionCode.id}`,
        {
          promotionCodeId: promotionCode.id,
          couponId: coupon.id,
          code: data.code,
          affiliateUid,
          affiliateCode: data.affiliateCode,
          affiliateName,
          percentOff: data.percentOff,
          active: true,
          environment,
          createdAt: new Date().toISOString(),
          createdBy: context.userId,
        },
        { mode: "server" },
      );
    } catch (error) {
      if (promotionCode) {
        await stripe.promotionCodes
          .update(promotionCode.id, { active: false })
          .catch(() => undefined);
      }
      await stripe.coupons.del(coupon.id).catch(() => undefined);
      throw error;
    }

    const mapped = mapPromotionCode(promotionCode, environment);
    if (!mapped) throw new Error("A Stripe criou o cupom sem os metadados esperados");
    return mapped;
  });

export async function createPromotionCodeAdmin(
  data: CreateAdminPromotionCode,
): Promise<AdminPromotionCode> {
  return createPromotionCodeAdminFn({ data });
}

const setPromotionCodeActiveAdminFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { id: string; active: boolean }) => {
    if (!/^promo_[A-Za-z0-9]+$/.test(data?.id || "") || typeof data?.active !== "boolean") {
      throw new Error("Cupom inválido");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const stripe = createStripeClient(stripeEnvironment());
    const current = await stripe.promotionCodes.retrieve(data.id);
    if (current.metadata?.managedBy !== "pitchai-admin") {
      throw new Error("Esse cupom não é gerenciado pelo Pitch AI");
    }
    await stripe.promotionCodes.update(data.id, { active: data.active });
    await fsSet(
      `affiliate_coupon_codes/${data.id}`,
      { active: data.active, updatedAt: new Date().toISOString(), updatedBy: context.userId },
      { mode: "server" },
    );
    return { ok: true };
  });

export async function setPromotionCodeActiveAdmin(id: string, active: boolean): Promise<void> {
  await setPromotionCodeActiveAdminFn({ data: { id, active } });
}

const updatePlanFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { id: string; patch: Record<string, unknown> }) => {
    if (!data?.id || typeof data.patch !== "object") throw new Error("Invalid update payload");
    const allowed = new Set(["nome", "preco_mensal", "assinantes", "ordem"]);
    const patch = Object.fromEntries(
      Object.entries(data.patch).filter(([key]) => allowed.has(key)),
    );
    if (!Object.keys(patch).length) throw new Error("No valid plan fields provided");
    return { id: data.id, patch };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const firestore = adminFirestoreOptions(context);
    const { id, patch } = data;
    const current = await fsGet(`admin_plans/${id}`, firestore);
    await fsSet(`admin_plans/${id}`, { ...((current?.data as any) ?? {}), ...patch }, firestore);
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
    const doc = await fsGet("admin_settings/costs", adminFirestoreOptions(context));
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
    const firestore = adminFirestoreOptions(context);
    const current = await fsGet("admin_settings/costs", firestore);
    await fsSet("admin_settings/costs", { ...((current?.data as any) ?? {}), ...data }, firestore);
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
  referral_code: string | null;
  attribution_source: string;
};

export type AdminAffiliate = {
  code: string;
  uid: string;
  name: string;
  email: string;
  active: boolean;
  created_at: string | null;
  activated_at: string | null;
  referrals: number;
  subscribers: number;
  conversion_rate: number;
  pending_cents: number;
  paid_cents: number;
  cancelled_cents: number;
  last_referral_at: string | null;
  sources: Record<string, number>;
};

export type AdminAffiliateDashboard = {
  affiliates: AdminAffiliate[];
  totalReferrals: number;
  totalSubscribers: number;
  totalPendingCents: number;
  totalPaidCents: number;
  conversionRate: number;
};

function mapCommission(d: { id: string; data: Record<string, unknown> }): AdminCommission {
  return {
    id: d.id,
    referrer_id: (d.data.referrerUid as string) ?? "",
    referred_id: (d.data.refereeUid as string) ?? "",
    plan: (d.data.plan as string) ?? null,
    base_cents: (d.data.base_cents as number) ?? 0,
    amount_cents: (d.data.amount_cents as number) ?? 0,
    status: (d.data.status as string) ?? "pendente",
    created_at: (d.data.createdAt as string) ?? (d.data.created_at as string) ?? "",
    paid_at: (d.data.paidAt as string) ?? (d.data.paid_at as string) ?? null,
    referral_code: (d.data.referralCode as string) ?? null,
    attribution_source: (d.data.attributionSource as string) ?? "unknown",
  };
}

const getAffiliateDashboard = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<AdminAffiliateDashboard> => {
    await ensureAdmin(context);
    const firestore = { mode: "server" as const };
    const [codes, claims, commissions] = await Promise.all([
      fsQuery("referral_codes", firestore),
      fsQuery("referral_claims", firestore),
      fsQuery("referral_commissions", firestore),
    ]);
    const ownerIds = Array.from(
      new Set(codes.map((code) => String(code.data.uid || "")).filter(Boolean)),
    );
    const profiles = await fsGetMany(
      ownerIds.map((uid) => `users/${uid}`),
      firestore,
    );
    const profileByUid = new Map(profiles.map((profile) => [profile.id, profile.data]));

    const affiliates = codes
      .map((codeDoc): AdminAffiliate | null => {
        const uid = String(codeDoc.data.uid || "");
        if (!uid) return null;
        const profile = profileByUid.get(uid);
        const affiliateClaims = claims.filter(
          (claim) => claim.data.referrerUid === uid && claim.data.code === codeDoc.id,
        );
        const affiliateCommissions = commissions.filter(
          (commission) => commission.data.referrerUid === uid,
        );
        const subscribers = new Set(
          affiliateCommissions
            .map((commission) => String(commission.data.refereeUid || ""))
            .filter(Boolean),
        ).size;
        const sumStatus = (status: string) =>
          affiliateCommissions
            .filter((commission) => commission.data.status === status)
            .reduce((sum, commission) => sum + Number(commission.data.amount_cents || 0), 0);
        const sources = affiliateClaims.reduce<Record<string, number>>((result, claim) => {
          const source = String(claim.data.source || "unknown");
          result[source] = (result[source] || 0) + 1;
          return result;
        }, {});
        const lastReferralAt = affiliateClaims
          .map((claim) => String(claim.data.createdAt || ""))
          .filter(Boolean)
          .sort()
          .at(-1);

        return {
          code: codeDoc.id,
          uid,
          name: String(profile?.displayName || profile?.name || "Afiliado sem nome"),
          email: String(profile?.email || ""),
          active: codeDoc.data.active === true,
          created_at: (codeDoc.data.createdAt as string) ?? null,
          activated_at: (codeDoc.data.activatedAt as string) ?? null,
          referrals: affiliateClaims.length,
          subscribers,
          conversion_rate: affiliateClaims.length
            ? (subscribers / affiliateClaims.length) * 100
            : 0,
          pending_cents: sumStatus("pendente"),
          paid_cents: sumStatus("pago"),
          cancelled_cents: sumStatus("cancelado"),
          last_referral_at: lastReferralAt || null,
          sources,
        };
      })
      .filter((affiliate): affiliate is AdminAffiliate => affiliate !== null)
      .sort((a, b) => b.referrals - a.referrals || a.code.localeCompare(b.code));

    const totalSubscribers = new Set(
      commissions.map((commission) => String(commission.data.refereeUid || "")).filter(Boolean),
    ).size;
    const totalReferrals = claims.length;
    return {
      affiliates,
      totalReferrals,
      totalSubscribers,
      totalPendingCents: commissions
        .filter((commission) => commission.data.status === "pendente")
        .reduce((sum, commission) => sum + Number(commission.data.amount_cents || 0), 0),
      totalPaidCents: commissions
        .filter((commission) => commission.data.status === "pago")
        .reduce((sum, commission) => sum + Number(commission.data.amount_cents || 0), 0),
      conversionRate: totalReferrals ? (totalSubscribers / totalReferrals) * 100 : 0,
    };
  });

export async function fetchAffiliateDashboard(): Promise<AdminAffiliateDashboard> {
  return getAffiliateDashboard({});
}

const setAffiliateActiveFn = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { code: string; active: boolean }) => {
    const code = normalizeReferralCode(data?.code || "");
    if (!code || typeof data?.active !== "boolean") throw new Error("Invalid affiliate payload");
    return { code, active: data.active };
  })
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const firestore = adminFirestoreOptions(context);
    const codeDoc = await fsGet(`referral_codes/${data.code}`, firestore);
    const uid = String(codeDoc?.data?.uid || "");
    if (!uid) throw new Error("Código de afiliado não encontrado");
    const now = new Date().toISOString();
    const privilegedFirestore = { mode: "server" as const };
    await fsSet(
      `referral_codes/${data.code}`,
      { active: data.active, updatedAt: now },
      privilegedFirestore,
    );
    await fsSet(
      `users/${uid}/referral/main`,
      { active: data.active, updatedAt: now },
      privilegedFirestore,
    );
    return { ok: true };
  });

export async function setAffiliateActive(code: string, active: boolean) {
  await setAffiliateActiveFn({ data: { code, active } });
}

const getCommissions = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }): Promise<AdminCommission[]> => {
    await ensureAdmin(context);
    const docs = await fsQuery("referral_commissions", {
      orderBy: { field: "createdAt", direction: "DESCENDING" },
      ...adminFirestoreOptions(context),
    });
    return docs.map(mapCommission);
  });

export async function fetchCommissions(): Promise<AdminCommission[]> {
  return getCommissions({});
}

export type AdminCommissionPage = {
  items: AdminCommission[];
  nextCursor: string | null;
};

const getCommissionsPage = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((data: { cursor?: string | null }) => ({ cursor: data?.cursor || null }))
  .handler(async ({ data, context }): Promise<AdminCommissionPage> => {
    await ensureAdmin(context);
    const pageSize = 100;
    const docs = await fsQuery("referral_commissions", {
      orderBy: { field: "createdAt", direction: "DESCENDING" },
      ...(data.cursor ? { startAfter: data.cursor } : {}),
      limit: pageSize + 1,
      ...adminFirestoreOptions(context),
    });
    const hasMore = docs.length > pageSize;
    const pageDocs = docs.slice(0, pageSize);
    return {
      items: pageDocs.map(mapCommission),
      nextCursor: hasMore
        ? ((pageDocs.at(-1)?.data.createdAt as string | undefined) ??
          (pageDocs.at(-1)?.data.created_at as string | undefined) ??
          null)
        : null,
    };
  });

export async function fetchCommissionsPage(cursor?: string | null): Promise<AdminCommissionPage> {
  return getCommissionsPage({ data: { cursor } });
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
    const firestore = adminFirestoreOptions(context);
    const { id, status } = data;
    const current = await fsGet(`referral_commissions/${id}`, firestore);
    if (current) {
      await fsSet(
        `referral_commissions/${id}`,
        {
          ...(current.data as any),
          status,
          paidAt: status === "pago" ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        },
        firestore,
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
  plan: string;
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
    const firestore = adminFirestoreOptions(context);
    // Perfis são a base da listagem. Uso e cortesia são complementares,
    // portanto contas novas ou ainda sem consumo também aparecem.
    const [profiles, usageDocs, compedDocs] = await Promise.all([
      fsQuery("users", firestore),
      fsQuery("ai_usage_stats", firestore),
      fsQuery("comped_access", firestore),
    ]);
    const userIds = Array.from(
      new Set([
        ...profiles.map((doc) => doc.id),
        ...usageDocs.map((doc) => doc.id),
        ...compedDocs.map((doc) => doc.id),
      ]),
    );
    const currentMonth = new Date().toISOString().slice(0, 7);
    const [subscriptions, monthlyUsage] = await Promise.all([
      fetchSubscriptionsForUsers(context, userIds),
      fsGetMany(
        userIds.map((userId) => `users/${userId}/token_usage/${currentMonth}`),
        firestore,
      ),
    ]);
    const subscriptionsByUser = new Map(subscriptions.map((sub) => [sub.userId, sub]));
    const profilesByUser = new Map(profiles.map((profile) => [profile.id, profile.data]));
    const usageByUser = new Map(usageDocs.map((doc) => [doc.id, doc.data]));
    const activeCompedByUser = new Map(
      compedDocs
        .filter((doc) => {
          if (doc.data.status !== "comped") return false;
          const until = String(doc.data.grantedUntil || "");
          return !until || (Number.isFinite(Date.parse(until)) && Date.parse(until) > Date.now());
        })
        .map((doc) => [doc.id, doc.data]),
    );
    const monthlyUsageByUser = new Map(
      monthlyUsage.map((usage) => {
        const match = usage.path.match(/^users\/([^/]+)\/token_usage\/[^/]+$/);
        return [match?.[1] ?? "", usage.data] as const;
      }),
    );
    return userIds
      .map((userId): AdminUserUsage => {
        const profile = profilesByUser.get(userId);
        const usage = usageByUser.get(userId);
        const sub = subscriptionsByUser.get(userId);
        const comped = activeCompedByUser.get(userId);
        const isComped = Boolean(comped);
        const planFromSub = String(comped?.plan || sub?.plan || "gratuito");
        const statFromSub = isComped ? "comped" : (sub?.status ?? "free");
        const usageStatus = (usage?.status as string) ?? "active";
        const isBlocked = usageStatus === "blocked";
        const currentUsage = monthlyUsageByUser.get(userId);
        const tokensInput = (currentUsage?.tokensInput as number) ?? 0;
        const tokensOutput = (currentUsage?.tokensOutput as number) ?? 0;
        return {
          userId,
          email:
            (profile?.email as string) ??
            (usage?.userEmail as string) ??
            (comped?.email as string) ??
            "(sem e-mail)",
          plan: planFromSub,
          status: statFromSub,
          tokensInput,
          tokensOutput,
          totalTokens: tokensInput + tokensOutput,
          ttsMinutes: (usage?.ttsMinutes as number) ?? 0,
          apiCallCount: (usage?.apiCallCount as number) ?? 0,
          lastApiCallAt: (usage?.lastApiCallAt as string) ?? "",
          activeModel: (usage?.activeModel as string) ?? "não informado",
          isBlocked,
          isComped,
          costEstimateUsd: (usage?.costEstimateUsd as number) ?? 0,
        };
      })
      .sort((a, b) => b.lastApiCallAt.localeCompare(a.lastApiCallAt));
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
    const firestore = adminFirestoreOptions(context);
    const current = await fsGet(`ai_usage_stats/${data.userId}`, firestore);
    const status = data.blocked ? "blocked" : "active";
    await fsSet(
      `ai_usage_stats/${data.userId}`,
      {
        ...((current?.data as any) ?? {}),
        status,
        updatedAt: new Date().toISOString(),
      },
      firestore,
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
    const firestore = adminFirestoreOptions(context);
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const [stats, daily, monthly] = await Promise.all([
      fsGet(`ai_usage_stats/${data.userId}`, firestore),
      fsGet(`users/${data.userId}/usage/${day}`, firestore),
      fsGet(`users/${data.userId}/token_usage/${month}`, firestore),
    ]);
    const updatedAt = now.toISOString();
    await Promise.all([
      fsSet(
        `ai_usage_stats/${data.userId}`,
        {
          ...((stats?.data as any) ?? {}),
          tokensInput: 0,
          tokensOutput: 0,
          totalTokens: 0,
          apiCallCount: 0,
          callFrequencyPerMin: 0,
          costEstimateUsd: 0,
          updatedAt,
        },
        firestore,
      ),
      fsSet(
        `users/${data.userId}/usage/${day}`,
        {
          ...((daily?.data as any) ?? {}),
          userId: data.userId,
          chat_reply: 0,
          tts_speak: 0,
          tokensInput: 0,
          tokensOutput: 0,
          totalTokens: 0,
          updatedAt,
        },
        firestore,
      ),
      fsSet(
        `users/${data.userId}/token_usage/${month}`,
        {
          ...((monthly?.data as any) ?? {}),
          userId: data.userId,
          period: month,
          tokensInput: 0,
          tokensOutput: 0,
          totalTokens: 0,
          updatedAt,
        },
        firestore,
      ),
    ]);
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
    const doc = await fsGet("admin_settings/plan_quotas", adminFirestoreOptions(context));
    if (!doc?.data) return DEFAULT_PLAN_QUOTAS;
    const stored = doc.data as Record<string, unknown>;
    if (Number(stored.quotaSchemaVersion) !== PLAN_QUOTA_SCHEMA_VERSION) {
      return DEFAULT_PLAN_QUOTAS;
    }
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
    const firestore = adminFirestoreOptions(context);
    const current = await fsGet("admin_settings/plan_quotas", firestore);
    await fsSet(
      "admin_settings/plan_quotas",
      {
        ...((current?.data as any) ?? {}),
        ...data,
        quotaSchemaVersion: PLAN_QUOTA_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
      },
      firestore,
    );
    return { ok: true };
  });

export async function savePlanQuotas(quotas: Record<string, PlanQuota>) {
  await savePlanQuotasFn({ data: quotas });
}

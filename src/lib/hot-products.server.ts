import { fsDelete, fsQuery, fsSet, type FirestoreAuthMode } from "./firebase.server";

export interface HotProductInput {
  pid: string;
  name: string;
  price?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  description?: string | null;
}

export interface HotProduct extends HotProductInput {
  uid: string;
  createdAt: string;
}

export const HOT_PRODUCTS_LIMIT = 200;

/** Id determinístico por (dono, produto): re-add é upsert, remove é exato. */
function hotProductDocId(uid: string, pid: string): string {
  return `${uid}_${pid}`;
}

/** Todas as entradas, mais recentes primeiro (limite 200). */
export async function listHotProducts(): Promise<HotProduct[]> {
  const docs = await fsQuery("hot_products", {
    mode: "server",
    orderBy: { field: "createdAt", direction: "DESCENDING" },
    limit: HOT_PRODUCTS_LIMIT,
  });
  return docs.map((doc) => {
    const data = doc.data;
    return {
      uid: String(data.uid ?? ""),
      pid: String(data.pid ?? ""),
      name: String(data.name ?? ""),
      price: typeof data.price === "string" ? data.price : undefined,
      priceCents: typeof data.priceCents === "number" ? data.priceCents : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
      imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
      createdAt: String(data.createdAt ?? ""),
    };
  });
}

export async function addHotProduct(
  uid: string,
  product: HotProductInput,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsSet(
    `hot_products/${hotProductDocId(uid, product.pid)}`,
    {
      uid,
      pid: product.pid,
      name: product.name,
      price: product.price ?? null,
      priceCents: product.priceCents ?? null,
      currency: product.currency ?? null,
      imageUrl: product.imageUrl ?? null,
      description: product.description ?? null,
      createdAt: new Date().toISOString(),
    },
    { mode: "server", ...options },
  );
}

export async function removeHotProduct(
  uid: string,
  pid: string,
  options: { mode?: FirestoreAuthMode; userToken?: string } = {},
): Promise<void> {
  await fsDelete(`hot_products/${hotProductDocId(uid, pid)}`, { mode: "server", ...options });
}

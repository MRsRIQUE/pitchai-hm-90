import { fsDelete, fsQuery, fsSet, type FirestoreAuthMode } from "./firebase.server";

export interface HotProductInput {
  pid: string;
  name: string;
  price?: string | null;
  priceCents?: number | null;
  priceMaxCents?: number | null;
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
  const seen = new Set<string>();
  return docs.flatMap((doc) => {
    const data = doc.data;
    const pid = String(data.pid ?? "");
    // A mesma curadoria é compartilhada entre mestres. Como os documentos
    // legados ainda incluem o UID no id, mantemos apenas a publicação mais
    // recente de cada produto na resposta.
    if (!pid || seen.has(pid)) return [];
    seen.add(pid);
    return [
      {
        uid: String(data.uid ?? ""),
        pid,
        name: String(data.name ?? ""),
        price: typeof data.price === "string" ? data.price : undefined,
        priceCents: typeof data.priceCents === "number" ? data.priceCents : undefined,
        priceMaxCents: typeof data.priceMaxCents === "number" ? data.priceMaxCents : undefined,
        currency: typeof data.currency === "string" ? data.currency : undefined,
        imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
        description: typeof data.description === "string" ? data.description : undefined,
        createdAt: String(data.createdAt ?? ""),
      },
    ];
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
      priceMaxCents: product.priceMaxCents ?? null,
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

/** Remove todas as publicações legadas do mesmo produto, independentemente da mestre. */
export async function removeHotProductEverywhere(pid: string): Promise<void> {
  const matches = await fsQuery("hot_products", {
    mode: "server",
    where: [{ field: "pid", op: "EQUAL", value: pid }],
  });
  await Promise.all(matches.map((doc) => fsDelete(doc.path, { mode: "server" })));
}

import { useCallback, useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase";

export type HotProduct = {
  id: string;
  name: string;
  description: string;
  price: string;
  priceCents?: number | null;
  priceMaxCents?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
};

type HotProductApi = HotProduct & { pid: string; uid: string; createdAt: string };

type HotProductsResponse = {
  items: HotProductApi[];
  isMaster: boolean;
};

async function authHeaders(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export function useHotProducts() {
  const [items, setItems] = useState<HotProduct[]>([]);
  const [isMaster, setIsMaster] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const headers = await authHeaders();
      const res = await fetch("/api/hot-products", { headers });
      if (!res.ok) return;
      const data = (await res.json()) as HotProductsResponse;
      // `pid` é o id do produto no TikTok; mantemos em `id` para compat com
      // Product/mergeVitrineProducts.
      setItems(
        (data.items ?? []).map((item) => ({
          id: item.pid || item.id,
          name: item.name,
          description: item.description ?? "",
          price: item.price ?? "",
          priceCents: item.priceCents ?? null,
          priceMaxCents: item.priceMaxCents ?? null,
          currency: item.currency ?? null,
          imageUrl: item.imageUrl ?? null,
        })),
      );
      setIsMaster(Boolean(data.isMaster));
    } catch {
      // silencioso — hook não derruba a UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return { items, isMaster, loading, refresh: fetchItems };
}

export async function sendHotProduct(
  product: Omit<HotProduct, "id"> & { id?: string },
): Promise<boolean> {
  try {
    const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
    const res = await fetch("/api/hot-products", {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "add",
        product: {
          pid: product.id ?? product.name,
          name: product.name,
          price: product.price || undefined,
          priceCents: product.priceCents ?? undefined,
          priceMaxCents: product.priceMaxCents ?? undefined,
          currency: product.currency ?? undefined,
          imageUrl: product.imageUrl ?? undefined,
          description: product.description || undefined,
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeHotProduct(pid: string): Promise<boolean> {
  try {
    const headers = { "Content-Type": "application/json", ...(await authHeaders()) };
    const res = await fetch("/api/hot-products", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "remove", pid }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

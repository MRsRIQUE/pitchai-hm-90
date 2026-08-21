import { beforeEach, describe, expect, it, vi } from "vitest";

const firebase = vi.hoisted(() => ({
  fsQuery: vi.fn(),
  fsDelete: vi.fn(async () => undefined),
  fsSet: vi.fn(async () => undefined),
}));

vi.mock("@/lib/firebase.server", () => firebase);

import { listHotProducts, removeHotProductEverywhere } from "../../src/lib/hot-products.server";

describe("curadoria compartilhada de Produtos Quentes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mantém apenas a publicação mais recente de um mesmo produto", async () => {
    firebase.fsQuery.mockResolvedValueOnce([
      {
        id: "new",
        path: "hot_products/new",
        data: {
          uid: "master-b",
          pid: "product-1",
          name: "Produto atualizado",
          priceCents: 8990,
          priceMaxCents: 10990,
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      },
      {
        id: "old",
        path: "hot_products/old",
        data: {
          uid: "master-a",
          pid: "product-1",
          name: "Produto antigo",
          createdAt: "2026-08-19T12:00:00.000Z",
        },
      },
    ]);

    const items = await listHotProducts();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      uid: "master-b",
      pid: "product-1",
      name: "Produto atualizado",
      priceMaxCents: 10990,
    });
  });

  it("remove todas as publicações do produto entre contas mestres", async () => {
    firebase.fsQuery.mockResolvedValueOnce([
      { id: "a", path: "hot_products/master-a_product-1", data: {} },
      { id: "b", path: "hot_products/master-b_product-1", data: {} },
    ]);

    await removeHotProductEverywhere("product-1");

    expect(firebase.fsQuery).toHaveBeenCalledWith("hot_products", {
      mode: "server",
      where: [{ field: "pid", op: "EQUAL", value: "product-1" }],
    });
    expect(firebase.fsDelete).toHaveBeenCalledTimes(2);
  });
});

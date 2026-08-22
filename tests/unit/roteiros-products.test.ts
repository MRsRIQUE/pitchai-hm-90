import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mergeVitrineProducts, type Product } from "@/lib/live/config";

const section = readFileSync(
  fileURLToPath(
    new URL(
      "../../src/components/live/LiveDashboard/sections/RoteirosSection.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const dashboard = readFileSync(
  fileURLToPath(new URL("../../src/components/live/LiveDashboard/index.tsx", import.meta.url)),
  "utf8",
);
const sync = readFileSync(
  fileURLToPath(new URL("../../src/lib/live/sync.ts", import.meta.url)),
  "utf8",
);
const config = readFileSync(
  fileURLToPath(new URL("../../src/lib/live/config.ts", import.meta.url)),
  "utf8",
);

describe("produtos no gerador de roteiros", () => {
  it("usa a sincronização canônica da vitrine e permite atualizar pela própria aba", () => {
    expect(dashboard).toContain("<RoteirosSection onSyncProducts={syncVitrine} />");
    expect(section).toContain("onSyncProducts: () => Promise<VitrineSyncOutcome>");
    expect(section).toContain("Puxar lista de produtos");
    expect(section).toContain("Atualizar produtos");
  });

  it("mostra e pesquisa todo o catálogo usado para gerar o roteiro", () => {
    expect(section).toContain("const visibleProducts = useMemo");
    expect(section).toContain("config.produtos.filter");
    expect(section).toContain("visibleProducts.map");
    expect(section).toContain("product.aiKnowledge");
    expect(section).toContain("formatarPreco(product)");
  });

  it("transporta a ficha aprendida junto com preço e descrição", () => {
    expect(sync).toContain("item.aiKnowledge = aiKnowledge");
    expect(sync).toContain("item.aiLearnedAt = aiLearnedAt");
    expect(config).toContain("fields.aiKnowledge = item.aiKnowledge.trim()");
    expect(config).toContain("fields.aiLearnedAt = item.aiLearnedAt.trim()");
  });

  it("cria produto completo e preenche lacunas sem apagar edição local", () => {
    const remote = {
      id: "p1",
      name: "Produto completo",
      price: "R$ 49,90",
      description: "Descrição confirmada",
      aiKnowledge: "Benefícios e objeções aprendidos",
      aiLearnedAt: "2026-08-21T20:00:00.000Z",
    };
    const created = mergeVitrineProducts([], [remote]).produtos[0];
    expect(created).toMatchObject(remote);

    const local: Product = {
      id: "p1",
      name: "Nome editado",
      price: "",
      description: "Descrição manual",
      active: true,
    };
    const enriched = mergeVitrineProducts([local], [remote]).produtos[0];
    expect(enriched).toMatchObject({
      name: "Nome editado",
      price: "R$ 49,90",
      description: "Descrição manual",
      aiKnowledge: "Benefícios e objeções aprendidos",
    });
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const routeSource = read("../../src/routes/api/product/learn.ts");
const productsSource = read("../../src/components/live/LiveDashboard/sections/ProdutosSection.tsx");
const extensionSource = read("../../extension/content.js");
const extensionPanelSource = read("../../extension/panel.js");

describe("aprendizado da IA por produto", () => {
  it("expõe o botão no catálogo e salva a ficha no produto correto", () => {
    expect(productsSource).toContain("IA aprender");
    expect(productsSource).toContain('fetch("/api/product/learn"');
    expect(productsSource).toContain("item.id === product.id");
    expect(productsSource).toContain("aiKnowledge: result.knowledge");
    expect(productsSource).toContain("Reaprender");
    expect(extensionPanelSource).toContain("/api/product/learn");
    expect(extensionPanelSource).toContain("🧠 IA aprender");
  });

  it("não permite que o aprendizado invente fatos ausentes", () => {
    expect(routeSource).toContain("Use somente fatos presentes nos dados");
    expect(routeSource).toContain("missingFacts");
    expect(routeSource).toContain('guardAiRequest(request, "chat_reply")');
    expect(routeSource).toContain("recordAiUsageTokens");
  });

  it("injeta a ficha aprendida em respostas e pitches e invalida caches antigos", () => {
    expect(extensionSource).toContain("Ficha aprendida:");
    expect(extensionSource).toContain('product?.aiKnowledge || ""');
    expect(extensionSource).toContain("aiKnowledge: product.aiKnowledge");
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelPath = fileURLToPath(new URL("../panel.js", import.meta.url));
const panelSource = readFileSync(panelPath, "utf8");

describe("painel distribuído", () => {
  it("não chama os nomes antigos das funções de seleção de produtos", () => {
    expect(panelSource).not.toMatch(/\brodizio\s*\(/);
    expect(panelSource).not.toContain("syncRodizioNames");
    expect(panelSource).toContain("produtosSelecionados()");
    expect(panelSource).toContain("syncSelectedProductNames()");
  });
});

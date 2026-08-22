import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Descrição do produto lida da vitrine.
 *
 * O card do TikTok traz, junto do texto do produto, os rótulos dos controles
 * ("Fixar", "Cliques 0", "Adicionado ao carrinho 0") e o cronômetro da oferta
 * ("Termina em 16:08:43", "1 dia"). Isso chegava ao painel do usuário como
 * descrição — ": 0 Fixar Cliques 0 · Adicionado ao carrinho 0" embaixo de
 * cada produto. O filtro vive no arquivo distribuído, então o teste extrai a
 * função de lá: ela é autocontida de propósito.
 */
const contentSource = readFileSync(
  fileURLToPath(new URL("../content.js", import.meta.url)),
  "utf8",
);

// O content.js é CRLF no checkout — o fim do bloco precisa aceitar os dois.
function extrairFuncao(nome: string): (...args: unknown[]) => unknown {
  const match = contentSource.match(
    new RegExp(`\\n  function ${nome}\\([^)]*\\) \\{[\\s\\S]*?\\r?\\n  \\}\\r?\\n`),
  );
  if (!match) throw new Error(`função ${nome} não encontrada no content.js`);
  const context: Record<string, unknown> = {};
  vm.runInNewContext(`${match[0]}\nthis.${nome} = ${nome};`, context);
  return context[nome] as (...args: unknown[]) => unknown;
}

const isUiNoiseLine = extrairFuncao("isUiNoiseLine") as (linha: string) => boolean;

describe("isUiNoiseLine (content.js)", () => {
  it("reconhece as linhas que são só interface do card", () => {
    expect(isUiNoiseLine(": 0 Fixar Cliques 0")).toBe(true);
    expect(isUiNoiseLine("Adicionado ao carrinho 0")).toBe(true);
    expect(isUiNoiseLine(": 0 Desafixar Cliques 0")).toBe(true);
    expect(isUiNoiseLine("16:08:43")).toBe(true);
    expect(isUiNoiseLine("1 dia")).toBe(true);
    expect(isUiNoiseLine("Em estoque: 18,8 mil")).toBe(true);
    expect(isUiNoiseLine("")).toBe(true);
  });

  it("deixa descrição de verdade passar, mesmo citando um controle", () => {
    expect(isUiNoiseLine("Suporte para fixar na parede")).toBe(false);
    expect(isUiNoiseLine("Kit 3 peças")).toBe(false);
    expect(isUiNoiseLine("Carrinho de bebê dobrável")).toBe(false);
    expect(isUiNoiseLine("Monitoramento avançado de saúde, sono e coração")).toBe(false);
  });
});

describe("descrição da vitrine no arquivo distribuído", () => {
  it("descriptionLines descarta rótulo de UI e linha de ruído", () => {
    const bloco = contentSource.match(
      /function descriptionLines\(text\) \{[\s\S]*?\r?\n {2}\}\r?\n/,
    )?.[0];
    expect(bloco).toBeTruthy();
    expect(bloco).toContain("!PRODUCT_UI_RX.test(l)");
    expect(bloco).toContain("!JUNK_NAME_RX.test(l)");
    expect(bloco).toContain("!isUiNoiseLine(l)");
  });

  it("cleanupProducts conserta descrição já gravada com ruído", () => {
    const bloco = contentSource.match(
      /function cleanupProducts\(cfg\) \{[\s\S]*?\r?\n {2}\}\r?\n/,
    )?.[0];
    expect(bloco).toBeTruthy();
    expect(bloco).toContain("hasUiNoise(desc)");
  });
});

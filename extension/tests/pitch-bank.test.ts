import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const content = readFileSync(fileURLToPath(new URL("../content.js", import.meta.url)), "utf8");
const panel = readFileSync(fileURLToPath(new URL("../panel.html", import.meta.url)), "utf8");
const api = readFileSync(
  fileURLToPath(new URL("../../src/routes/api/public/pitch/bank.ts", import.meta.url)),
  "utf8",
);

describe("banco econômico de pitches", () => {
  it("gera um lote horário limitado e contabiliza os tokens uma única vez", () => {
    expect(api).toContain('createFileRoute("/api/public/pitch/bank")');
    expect(api).toMatch(/Math\.max\(10, Math\.min\(15,/);
    expect(api).toContain("recordAiUsageTokens(guard, tokensInput, tokensOutput)");
    expect(api).toContain("Date.now() + 60 * 60 * 1000");
  });

  // Nota: o banco de pitches no cliente foi removido na v0.18.0 — a extensão
  // agora lê o roteiro salvo por produto (roteirosPorProduto) quando o chat
  // está ocioso, sem consumir tokens de geração. O endpoint backend /api/
  // public/pitch/bank continua publicado para clientes antigos (v0.16.x).
});

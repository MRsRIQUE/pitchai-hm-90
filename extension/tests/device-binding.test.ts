import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const content = readFileSync(fileURLToPath(new URL("../content.js", import.meta.url)), "utf8");
const panel = readFileSync(fileURLToPath(new URL("../panel.js", import.meta.url)), "utf8");
const panelHtml = readFileSync(fileURLToPath(new URL("../panel.html", import.meta.url)), "utf8");

describe("vínculo de navegador (1 extensão por conta)", () => {
  it("só o content.js cria o id da instalação", () => {
    // Se o painel também criasse, numa instalação nova os dois correriam,
    // nasceriam dois UUIDs e a última gravação venceria — o vínculo apontaria
    // para um id que ninguém mais manda.
    expect(content).toContain("crypto.randomUUID()");
    const criacaoNoPainel = panel
      .split("\n")
      .filter((l) => l.includes("randomUUID") && l.includes("INSTALL"));
    expect(criacaoNoPainel).toHaveLength(0);
    expect(panel).toContain("async function readInstallId");
    expect(panel).not.toContain("async function ensureInstallId");
  });

  it("manda o cabeçalho da instalação dos dois lados, fora da assinatura", () => {
    for (const src of [content, panel]) {
      expect(src).toContain('"X-PitchAI-Install"');
      // Fora da assinatura: o HMAC do servidor é sobre ts:nonce:endpoint.
      expect(src).toContain("`${ts}:${nonce}:${endpoint}`");
    }
  });

  it("a falta do identificador nunca bloqueia", () => {
    // A extensão é distribuída em .zip e a versão antiga convive para sempre:
    // sem id o servidor libera, então o cliente não pode travar por conta.
    expect(content).toContain('return id ? { "X-PitchAI-Install": id } : {}');
    expect(panel).toContain('return id ? { "X-PitchAI-Install": id } : {}');
  });

  it("trata device_mismatch antes do teste de valid/locked", () => {
    // O servidor devolve 200 com valid:true e locked:true. Se o ramo genérico
    // vier primeiro, o vendedor lê "código inválido" com o código certo.
    const posMismatch = content.indexOf("data.reason === DEVICE_MISMATCH");
    const posGenerico = content.indexOf("if (res.ok && data.valid && !data.locked)");
    expect(posMismatch).toBeGreaterThan(-1);
    expect(posGenerico).toBeGreaterThan(-1);
    expect(posMismatch).toBeLessThan(posGenerico);
  });

  it("recusa por navegador não manda o vendedor para a tela de assinatura", () => {
    expect(content).toContain("Desvincular navegador ↗");
    expect(content).toContain("DEVICE_RELEASE_PATH");
  });

  it("o painel mostra o vínculo e não desvincula sozinho", () => {
    expect(panelHtml).toContain('id="pnl-device-state"');
    expect(panelHtml).toContain('id="pnl-device-action"');
    expect(panel).toContain("Vinculado a este navegador");
    // Desvincular exige login na tela de Conta: se o painel pudesse fazer
    // sozinho, bastaria abrir a extensão para roubar o vínculo de quem tem o código.
    expect(panel).not.toMatch(/fetch\([^)]*device-binding/);
  });
});

describe("o painel não inventa resposta que o servidor não deu", () => {
  it("licença não confirmada vira 'não sei', não 'nenhum vínculo'", () => {
    expect(content).toContain('"desconhecido"');
    expect(panel).toContain("Vínculo não confirmado");
  });

  it("o botão do card pode mesmo ser escondido", () => {
    // `hidden` sozinho não esconde .pnl-btn: a regra de autor declara display e
    // ganha do [hidden] da folha do navegador.
    const css = readFileSync(fileURLToPath(new URL("../panel.css", import.meta.url)), "utf8");
    expect(css).toMatch(/\.pnl-btn\[hidden\]\s*\{\s*display:\s*none/);
  });
});

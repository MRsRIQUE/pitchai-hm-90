import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const content = readFileSync(fileURLToPath(new URL("../content.js", import.meta.url)), "utf8");
const panel = readFileSync(fileURLToPath(new URL("../panel.js", import.meta.url)), "utf8");
const panelHtml = readFileSync(fileURLToPath(new URL("../panel.html", import.meta.url)), "utf8");
const background = readFileSync(
  fileURLToPath(new URL("../background.js", import.meta.url)),
  "utf8",
);
const accountBridge = readFileSync(
  fileURLToPath(new URL("../account-bridge.js", import.meta.url)),
  "utf8",
);

describe("vínculo de navegador (1 extensão por conta)", () => {
  it("o service worker cria o id e as três superfícies pedem o mesmo valor", () => {
    expect(background).toContain("async function garantirInstallId");
    expect(background).toContain("crypto.randomUUID()");
    for (const src of [content, panel, accountBridge]) {
      expect(src).toContain('type: "PITCHAI_GET_INSTALL_ID"');
    }
    for (const src of [panel, accountBridge]) {
      const criacaoDeInstallId = src
        .split("\n")
        .filter((linha) => linha.includes("randomUUID") && linha.includes("INSTALL"));
      expect(criacaoDeInstallId).toHaveLength(0);
    }
    expect(panel).toContain("async function readInstallId");
    expect(panel).not.toContain("async function ensureInstallId");
  });

  it("manda o cabeçalho da instalação dos dois lados, fora da assinatura", () => {
    for (const src of [content, panel]) {
      expect(src).toContain('"X-PitchAI-Install"');
      // Fora da assinatura: o HMAC do servidor é sobre ts:nonce:endpoint.
      expect(src).toContain("`${ts}:${nonce}:${endpoint}`");
    }
    expect(accountBridge).toContain('"X-PitchAI-Install"');
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

  it("recusa por navegador é comunicada no painel, sem faixa sobre a página", () => {
    expect(content).not.toContain('banner.id = "pitchai-lock-banner"');
    expect(panel).toContain("Desvincular navegador ↗");
    expect(panel).toContain('new URL("/app?desvincular=1", API_BASE)');
  });

  it("o painel mostra o vínculo e não desvincula sozinho", () => {
    expect(panelHtml).toContain('id="pnl-device-state"');
    expect(panelHtml).toContain('id="pnl-device-action"');
    expect(panel).toContain("Vinculado a este navegador");
    // Desvincular exige login na tela de Conta: se o painel pudesse fazer
    // sozinho, bastaria abrir a extensão para roubar o vínculo de quem tem o código.
    expect(panel).not.toMatch(/fetch\([^)]*device-binding/);
  });

  it("os controles da LIVE revalidam a licença antes de procurar o botão", () => {
    const inicio = content.indexOf('"live:start": async () =>');
    const fim = content.indexOf('"live:end": async () =>');
    const blocoStart = content.slice(inicio, fim);
    expect(blocoStart).toContain("checkExtensionLock(current.syncToken)");
    expect(blocoStart.indexOf("checkExtensionLock")).toBeLessThan(
      blocoStart.indexOf("detectLiveState"),
    );
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

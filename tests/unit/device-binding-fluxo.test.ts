import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const raiz = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const content = readFileSync(raiz("extension/content.js"), "utf8");
const panel = readFileSync(raiz("extension/panel.js"), "utf8");
const dashboard = readFileSync(raiz("src/components/live/LiveDashboard/index.tsx"), "utf8");
const auth = readFileSync(raiz("src/lib/live/api-auth.server.ts"), "utf8");

describe("fluxo do vínculo ponta a ponta", () => {
  it("?desvincular=1 abre a seção Conta, onde o painel de vínculo mora", () => {
    // O efeito que lê o parâmetro vive dentro do DeviceBindingPanel, que só
    // monta sob ContaSection. Sem abrir a seção, o botão da extensão levava o
    // vendedor para o Início e nada acontecia.
    expect(dashboard).toContain('get("desvincular") === "1"');
    expect(dashboard).toContain('setActive("conta")');
  });

  it("toda chamada da extensão ao servidor manda o identificador", () => {
    // enforceDeviceBinding libera quando o id vem vazio: rota sem cabeçalho é
    // rota que escapa da trava, mesmo com o CORS certo.
    for (const [nome, src] of [
      ["content.js", content],
      ["panel.js", panel],
    ] as const) {
      const semCabecalho = [
        ...src.matchAll(/headers: \{ "Content-Type": "application\/json" \},/g),
      ];
      expect(semCabecalho, `${nome} tem chamada sem X-PitchAI-Install`).toHaveLength(0);
    }
  });

  it("o servidor informa o vínculo no sucesso, não só na recusa", () => {
    expect(auth).toContain("async function describeBinding");
    expect(auth).toContain("deviceIsThis");
    expect(auth).toContain("deviceKnown");
  });

  it("a extensão mostra o vínculo do servidor em vez de inferir de 'passei'", () => {
    // Passar no verify tem várias causas que não são "sou o vinculado": sem
    // identificador, mode off/observar, Firestore fora.
    expect(content).toContain("extSecurity.deviceIsThis");
    expect(content).toContain("!extSecurity.deviceKnown");
    expect(panel).toContain("ninguém é barrado ainda");
  });
});

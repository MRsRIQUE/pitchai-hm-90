import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const raiz = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const cors = readFileSync(raiz("src/lib/live/cors.server.ts"), "utf8");
const fontes = ["extension/content.js", "extension/panel.js"].map((f) =>
  readFileSync(raiz(f), "utf8"),
);

/**
 * A extensão chama o servidor de outra origem (shop.tiktok.com → nosso domínio).
 * Cabeçalho custom que não esteja no Access-Control-Allow-Headers faz o
 * navegador BLOQUEAR a requisição no preflight — o fetch lança, o verify cai no
 * catch e a extensão inteira se tranca com "não foi possível confirmar sua
 * licença". Foi assim que X-PitchAI-Install derrubou tudo.
 */
describe("CORS cobre todo cabeçalho que a extensão manda", () => {
  const permitidos = (cors.match(/"Access-Control-Allow-Headers":\s*\n?\s*"([^"]+)"/)?.[1] ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase());

  it("a lista de permitidos foi encontrada", () => {
    expect(permitidos.length).toBeGreaterThan(3);
  });

  it("todo X-PitchAI-* enviado pela extensão está liberado", () => {
    const enviados = new Set<string>();
    for (const src of fontes) {
      for (const m of src.matchAll(/"(X-PitchAI-[A-Za-z-]+)"\s*:/g))
        enviados.add(m[1].toLowerCase());
    }
    expect(enviados.size).toBeGreaterThan(0);
    const faltando = [...enviados].filter((h) => !permitidos.includes(h));
    expect(faltando).toEqual([]);
  });
});

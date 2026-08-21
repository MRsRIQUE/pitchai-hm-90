import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const content = readFileSync(fileURLToPath(new URL("../content.js", import.meta.url)), "utf8");
const domMap = readFileSync(fileURLToPath(new URL("../dom-map.js", import.meta.url)), "utf8");

describe("controles reais da LIVE", () => {
  it("reconhece o CTA mesmo quando o TikTok usa div clicável", () => {
    expect(domMap).toContain("div.cursor-pointer");
    expect(domMap).toContain("[class*='arco-btn']");
    expect(content).toContain("const control = labelNode.closest?.(controlSelector)");
  });

  it("não confunde licença bloqueada com botão ausente", () => {
    const inicio = content.indexOf('"live:start": async () =>');
    const fim = content.indexOf('"live:end": async () =>');
    const bloco = content.slice(inicio, fim);
    expect(bloco).toContain("checkExtensionLock(current.syncToken)");
    expect(bloco.indexOf("checkExtensionLock")).toBeLessThan(bloco.indexOf("detectLiveState"));
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(`../../${relative}`, import.meta.url)), "utf8");

const content = read("extension/content.js");
const endpoint = read("src/routes/api/public/live/session.ts");

describe("telemetria real da LIVE", () => {
  it("agrega eventos de alto volume antes de persistir", () => {
    expect(content).toContain("function queueSessionCounter(key, amount = 1)");
    expect(content).toContain("flushSessionCounters().catch");
    expect(content).toContain("}, 15000)");
    expect(content).toContain('queueSessionCounter("messages_received")');
    expect(content).toContain('queueSessionCounter("audience_joins")');
    expect(content).toContain('queueSessionCounter("audience_follows")');
    expect(content).toContain('queueSessionCounter("pitches_spoken")');
  });

  it("persiste os contadores sem guardar conteúdo ou identidade do espectador", () => {
    expect(endpoint).toContain('"counters"');
    expect(endpoint).toContain("messages_received: 0");
    expect(endpoint).toContain("audience_joins: 0");
    expect(endpoint).toContain("audience_follows: 0");
    expect(endpoint).toContain("pitches_spoken: 0");
    expect(endpoint).toContain('body.kind === "counters"');
  });
});

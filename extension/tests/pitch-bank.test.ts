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

  it("serializa o agendador e cancela geração/reprodução ao parar", () => {
    expect(content).toContain("pitchBusy: false");
    expect(content).toContain("if (runId !== chatState.pitchRunId || chatState.pitchBusy) return");
    expect(content).toContain("chatState.pitchAbort?.abort()");
    expect(content).toContain("isCancelled: () => runId !== chatState.pitchRunId");
    expect(content).not.toMatch(/pitchTimer\s*=\s*setInterval/);
  });

  it("reutiliza áudio e limita cache de perguntas ao mesmo produto e FAQ", () => {
    expect(content).toContain('const TTS_CACHE_NAME = "pitchai-tts-hourly-v1"');
    expect(content).toContain("readTtsCache(cacheKey, ttlMs)");
    expect(content).toContain("writeTtsCache(cacheKey, blob)");
    expect(content).toContain("STANDALONE_FAQ_RX");
    expect(content).toContain("REPLY_CACHE_TTL_MS = 60 * 60 * 1000");
    expect(content).toContain("product?.id || product?.name");
  });

  it("expõe controles de economia e ritmo no painel distribuído", () => {
    expect(panel).toContain('data-key="pitchBank.enabled"');
    expect(panel).toContain('data-key="pitchBank.variants"');
    expect(panel).toContain('data-key="pitchBank.minIntervalSec"');
    expect(panel).toContain('data-key="pitchBank.maxIntervalSec"');
    expect(panel).toContain('data-key="pitchBank.cacheReplies"');
  });
});

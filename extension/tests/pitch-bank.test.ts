import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const content = readFileSync(fileURLToPath(new URL("../content.js", import.meta.url)), "utf8");
const panel = readFileSync(fileURLToPath(new URL("../panel.html", import.meta.url)), "utf8");
const api = readFileSync(
  fileURLToPath(new URL("../../src/routes/api/public/pitch/bank.ts", import.meta.url)),
  "utf8",
);
const ttsRoute = readFileSync(
  fileURLToPath(new URL("../../src/routes/api/public/tts/speak.ts", import.meta.url)),
  "utf8",
);
const ttsServer = readFileSync(
  fileURLToPath(new URL("../../src/lib/live/tts.server.ts", import.meta.url)),
  "utf8",
);

describe("banco econômico de pitches", () => {
  it("gera um lote horário limitado e contabiliza os tokens uma única vez", () => {
    expect(api).toContain('createFileRoute("/api/public/pitch/bank")');
    expect(api).toContain("z.number().int().min(10).max(15).optional()");
    expect(api).toContain("Math.round(body.count ?? 12)");
    expect(api).toContain("recordAiUsageTokens(guard, tokensInput, tokensOutput)");
    expect(api).toContain("Date.now() + 60 * 60 * 1000");
  });

  it("estrutura o banco como um mini funil com ângulos e CTAs controlados", () => {
    expect(api).toContain("const PitchStageSchema = z.enum");
    expect(api).toContain("const PitchAngleSchema = z.enum");
    expect(api).toContain("function parsePitchItems");
    expect(api).toContain('"discovery"');
    expect(api).toContain('"consideration"');
    expect(api).toContain('"trust"');
    expect(api).toContain('"engagement"');
    expect(api).toContain('"conversion"');
    expect(api).toContain("no máximo 30% dos itens devem ter CTA");
    expect(api).toContain("items,");
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

  it("escolhe a fase conforme a atividade e evita repetir falas recentes", () => {
    expect(content).toContain("function desiredPitchStage()");
    expect(content).toContain("sinceChat < 45000 || sinceAudience < 45000");
    expect(content).toContain("function pickAdaptivePitch(bank, cfg)");
    expect(content).toContain("item.stage === stage");
    expect(content).toContain("!item.cta");
    expect(content).toContain("slice(-8)");
    expect(content).toContain("function nextPitchDelay(settings)");
    expect(content).toContain("recentActivity ? 0.75 : 1");
  });

  it("interpreta a voz conforme saudação, oferta, conversa ou despedida", () => {
    expect(content).toContain("context: ctx");
    expect(ttsRoute).toContain('z.enum(["default", "greeting", "offer", "farewell"])');
    expect(ttsServer).toContain('greeting: "com acolhimento espontâneo');
    expect(ttsServer).toContain('default: "como uma pessoa conversando ao vivo');
    expect(ttsServer).toContain("pronuncie preços e números por extenso");
  });

  it("expõe controles de economia e ritmo no painel distribuído", () => {
    expect(panel).toContain('data-key="pitchBank.enabled"');
    expect(panel).toContain('data-key="pitchBank.variants"');
    expect(panel).toContain('data-key="pitchBank.minIntervalSec"');
    expect(panel).toContain('data-key="pitchBank.maxIntervalSec"');
    expect(panel).toContain('data-key="pitchBank.cacheReplies"');
  });
});

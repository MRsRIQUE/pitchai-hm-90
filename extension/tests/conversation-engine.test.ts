import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contentSource = readFileSync(
  fileURLToPath(new URL("../content.js", import.meta.url)),
  "utf8",
);
const replyRouteSource = readFileSync(
  fileURLToPath(new URL("../../src/routes/api/public/chat/reply.ts", import.meta.url)),
  "utf8",
);
const aiConfigSource = readFileSync(
  fileURLToPath(
    new URL("../../src/components/live/LiveDashboard/AiConfigSection.tsx", import.meta.url),
  ),
  "utf8",
);

describe("motor de conversa da live", () => {
  it("isola contexto e cache por espectador", () => {
    expect(contentSource).toContain("historyByAuthor: new Map()");
    expect(contentSource).toContain("conversationHistory(item).slice(-6)");
    expect(contentSource).toContain("replyCacheKey(cfg, item.text, item.author)");
    expect(contentSource).toContain("CONVERSATION_MEMORY_TTL_MS = 2 * 60 * 60 * 1000");
    expect(contentSource).toContain("saveConversationMemory()");
    expect(contentSource).not.toContain("chatState.history.push");
  });

  it("bloqueia eco local e novamente no servidor", () => {
    expect(contentSource).toContain("normalized.includes(sent)");
    expect(contentSource).toContain("isRecentlySentReply(item.text)");
    expect(replyRouteSource).toContain("repeatsAssistant(message, history)");
    expect(replyRouteSource).toContain('reason: "self_echo"');
  });

  it("observa entradas na região de atividades sem confundir o feed de pedidos", () => {
    expect(contentSource).toContain('regionNode("activity")');
    expect(contentSource).toContain("findAudienceActivityFeed");
    expect(contentSource).toContain("node !== orders");
    expect(contentSource).toContain("scanAudienceActivity(node, { silent: true })");
    expect(contentSource).toContain("startAudienceActivityWatcher();");
    expect(contentSource).toContain("stopAudienceActivityWatcher();");
  });

  it("prioriza intenção de compra e pausa pitch enquanto há público interagindo", () => {
    expect(contentSource).toContain("chatMessagePriority");
    expect(contentSource).toContain("MAX_CHAT_QUEUE = 8");
    expect(contentSource).toContain("CHAT_MESSAGE_MAX_AGE_MS = 45 * 1000");
    expect(contentSource).toContain("chatState.lastAudienceAt");
    expect(contentSource).toContain("pickFreshPitchLine");
  });

  it("estrutura o cérebro e escolhe uma estratégia pela intenção da mensagem", () => {
    for (const field of ["differentials", "policies", "frequentQuestions", "salesPlaybook"]) {
      expect(contentSource).toContain(`ctx.${field}`);
      expect(aiConfigSource).toContain(`config.aiContext.${field}`);
    }
    expect(replyRouteSource).toContain("detectConversationIntent(message)");
    expect(replyRouteSource).toContain("intentInstruction(intent");
    expect(replyRouteSource).toContain('return "purchase"');
    expect(replyRouteSource).toContain('return "objection"');
    expect(replyRouteSource).toContain('return "comparison"');
  });
});

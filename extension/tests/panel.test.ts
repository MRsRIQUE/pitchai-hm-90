import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelPath = fileURLToPath(new URL("../panel.js", import.meta.url));
const panelSource = readFileSync(panelPath, "utf8");
const panelHtml = readFileSync(fileURLToPath(new URL("../panel.html", import.meta.url)), "utf8");
const contentSource = readFileSync(
  fileURLToPath(new URL("../content.js", import.meta.url)),
  "utf8",
);

describe("painel distribuído", () => {
  it("não chama os nomes antigos das funções de seleção de produtos", () => {
    expect(panelSource).not.toMatch(/\brodizio\s*\(/);
    expect(panelSource).not.toContain("syncRodizioNames");
    expect(panelSource).toContain("produtosSelecionados()");
    expect(panelSource).toContain("syncSelectedProductNames()");
  });

  it("expõe o envio em texto como opção separada e opt-in", () => {
    expect(panelHtml.match(/data-key="responderNoChat"/g)).toHaveLength(1);
    expect(panelHtml).toContain("Responder no chat automaticamente");
    expect(panelSource).toMatch(/responderNoChat:\s*false/);
  });

  it("mantém voz e chat como canais independentes", () => {
    expect(contentSource).toMatch(/return !!\(cfg\?\.respostasIA \|\| cfg\?\.responderNoChat\)/);
    expect(contentSource).toContain("if (cfg.responderNoChat) {");
    expect(contentSource).toContain("if (cfg.respostasIA) {");
    expect(contentSource).toContain("await deliverReply(item, reply, cfg)");
  });

  it("protege o chat contra spam, auto-loop e sobrescrita de rascunho", () => {
    expect(contentSource).toContain("CHAT_SEND_INTERVAL_MS = 6000");
    expect(contentSource).toContain("SENT_REPLY_TTL_MS = 120000");
    expect(contentSource).toContain("rememberSentReply(reply);");
    expect(contentSource).toContain("ownEchoes");
    expect(contentSource).toContain("chatState.ownEchoes.clear()");
    expect(contentSource).toContain("isRecentlySentReply(msg.text)");
    expect(contentSource).toContain("if (chatEditorValue(editor).trim()) return false;");
    expect(contentSource).toContain("let chatSendChain = Promise.resolve()");
    expect(contentSource).toContain("if (!current.responderNoChat || extSecurity.isLocked)");
    expect(contentSource).not.toContain("chatState.sentReplies.delete(normalizedReplyText(value))");
  });

  it("evita corrida e seleção aproximada no autofixar", () => {
    expect(contentSource).toContain("pinBusy: false");
    expect(contentSource).toContain("if (auto.pinBusy) return");
    expect(contentSource).toContain('alvo.pid || ""');
    expect(contentSource).toContain("requiredHits");
  });

  it("restringe IA/autofixar a produtos marcados e encerra live em aviso", () => {
    expect(contentSource).toContain("const allProducts = cfg.produtos || []");
    expect(contentSource).toContain("const produtos = ids.length");
    expect(contentSource).toContain("o operador precisa marcar");
    expect(contentSource).toContain('finishLive("aviso de violação detectado")');
  });
});

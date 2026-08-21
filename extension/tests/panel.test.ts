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

  it("mantém voz e chat como canais independentes atrás do mestre 👁️", () => {
    expect(contentSource).toMatch(
      /cfg\?\.iaLigada !== false && !!\(cfg\?\.respostasIA \|\| cfg\?\.responderNoChat\)/,
    );
    expect(contentSource).toContain("if (cfg.responderNoChat) {");
    expect(contentSource).toContain("if (cfg.respostasIA) {");
    expect(contentSource).toContain("await deliverReply(item, reply, cfg)");
    // o olho liga/desliga só o mestre; nunca força a voz
    expect(contentSource).toContain("fresh.iaLigada = on;");
    expect(contentSource).toContain("fresh.responderNoChat = true;");
    expect(contentSource).not.toContain("fresh.respostasIA = true;");
  });

  it("protege o chat contra spam, auto-loop e sobrescrita de rascunho", () => {
    expect(contentSource).toContain("CHAT_SEND_INTERVAL_MS = 6000");
    expect(contentSource).toContain("SENT_REPLY_TTL_MS = 120000");
    expect(contentSource).toContain("rememberSentReply(value);");
    expect(contentSource).toContain("chatState.sentReplies");
    expect(contentSource).toContain("chatState.sentReplies.delete");
    expect(contentSource).toContain("isRecentlySentReply(msg.text)");
    expect(contentSource).toContain("if (chatEditorValue(editor).trim()) return false;");
    expect(contentSource).toContain("let chatSendChain = Promise.resolve()");
    expect(contentSource).toContain("if (!current.responderNoChat || extSecurity.isLocked)");
    expect(contentSource).not.toContain('banner.id = "pitchai-lock-banner"');
    expect(contentSource).not.toContain("chatState.sentReplies.delete(normalizedReplyText(value))");
    // intervalo anti-spam configurável no painel
    expect(contentSource).toContain("replyIntervalMs(cfg)");
    expect(contentSource).toContain("respostasIntervaloSec");
    expect(panelHtml).toContain('data-key="respostasIntervaloSec"');
    // truncamento nunca corta palavra no meio
    expect(contentSource).toContain('cut.lastIndexOf(" ")');
    // nunca responde à própria conta
    expect(contentSource).toContain("accountNames.has(normKey(msg.author))");
    // pitch foca o produto fixado
    expect(contentSource).toContain("getPinnedProduct(cfg)");
    expect(contentSource).toContain("Produto FIXADO em destaque");
  });

  it("evita corrida e seleção aproximada no autofixar", () => {
    expect(contentSource).toContain("pinBusy: false");
    expect(contentSource).toContain("if (auto.pinBusy) return");
    expect(contentSource).toContain('alvo.pid || ""');
    expect(contentSource).toContain("expectedPid");
  });

  it("controla o som do vídeo pelo painel sem cair no abaixamento manual", () => {
    expect(panelHtml).toContain('id="pnl-media-mute"');
    expect(panelHtml).toContain('id="pnl-media-duck"');
    expect(panelHtml).toContain('id="pnl-media-duck-level"');
    expect(panelSource).toMatch(/sendMedia\("audio", payload\)/);
    expect(panelSource).toMatch(/sendMedia\("duckAuto"/);
    // "duck" (sem Auto) deixa o vídeo baixo o tempo todo, e não só enquanto a
    // IA fala: a chave do painel nunca pode mandar esse comando.
    expect(panelSource).not.toMatch(/sendMedia\("duck"/);
    // O motor trabalha em fração; a tela mostra porcentagem.
    expect(panelSource).toMatch(/DUCK_LEVEL_PADRAO = 0\.12/);
    expect(panelSource).toContain("duckAutoLevel: duckPct() / 100");
    expect(panelSource).toMatch(/midia:\s*\{ videoMuted: false, duckIA: \{ enabled: true/);
  });

  it("restringe IA/autofixar a produtos marcados e encerra live em aviso", () => {
    expect(contentSource).toContain("produtos = produtos.filter");
    expect(contentSource).toContain("if (!produtos.length)");
    expect(contentSource).toContain("nenhum produto selecionado para fixar");
    expect(contentSource).toContain('finishLive("aviso de violação detectado")');
  });
});

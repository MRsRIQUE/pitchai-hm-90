import { describe, expect, it } from "vitest";
import { finalizeLiveReply, sanitizeReplyForPublish } from "@/lib/live/validation.server";

describe("sanitizeReplyForPublish", () => {
  it("returns empty string for non-string input", () => {
    expect(sanitizeReplyForPublish(null)).toBe("");
    expect(sanitizeReplyForPublish(undefined)).toBe("");
    expect(sanitizeReplyForPublish(42)).toBe("");
  });

  it("removes emojis", () => {
    expect(sanitizeReplyForPublish("Oi! 😀 tudo bem?")).toBe("Oi!  tudo bem?");
    expect(sanitizeReplyForPublish("Ótimo 👍🏽")).toBe("Ótimo");
  });

  it("removes emoji ZWJ sequences and skin tone modifiers", () => {
    expect(sanitizeReplyForPublish("família 👨‍👩‍👧 feliz")).toBe("família  feliz");
  });

  it("removes asterisks", () => {
    expect(sanitizeReplyForPublish("**Ótimo** *preço*")).toBe("Ótimo preço");
    expect(sanitizeReplyForPublish("sim*")).toBe("sim");
  });

  it("collapses duplicate line breaks", () => {
    expect(sanitizeReplyForPublish("linha 1\n\n\nlinha 2")).toBe("linha 1\nlinha 2");
    expect(sanitizeReplyForPublish("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeReplyForPublish("  texto  ")).toBe("texto");
  });

  it("handles combined cases", () => {
    expect(sanitizeReplyForPublish("Vale a pena? 😄\n\n\n*Sim!*\n\nÓtima escolha 🎉")).toBe(
      "Vale a pena? \nSim!\nÓtima escolha",
    );
  });

  it("returns empty when only emojis and markdown remain", () => {
    expect(sanitizeReplyForPublish("😀🎉**")).toBe("");
  });
});

describe("finalizeLiveReply", () => {
  it("remove reticências finais e fecha a frase", () => {
    expect(finalizeLiveReply("Esse produto é leve e muito prático...")).toBe(
      "Esse produto é leve e muito prático.",
    );
    expect(finalizeLiveReply("Confere o tamanho no carrinho…")).toBe(
      "Confere o tamanho no carrinho.",
    );
  });

  it("preserva a primeira frase completa quando a resposta passa do limite", () => {
    const result = finalizeLiveReply(
      "Ele é compacto e fácil de levar. A segunda explicação seria longa demais para o chat da live.",
      48,
    );
    expect(result).toBe("Ele é compacto e fácil de levar.");
    expect(result.length).toBeLessThanOrEqual(48);
  });

  it("corta somente no limite de palavra e nunca termina em reticências", () => {
    const result = finalizeLiveReply(
      "Este produto combina praticidade conforto durabilidade e uso simples durante toda a rotina",
      56,
    );
    expect(result.length).toBeLessThanOrEqual(56);
    expect(result).toMatch(/[.!?]$/);
    expect(result).not.toMatch(/(?:\.{2,}|…)$/u);
  });
});

import { describe, expect, it } from "vitest";
import { sanitizeReplyForPublish } from "@/lib/live/validation.server";

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

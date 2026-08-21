import { describe, expect, it } from "vitest";
import {
  codeFromUserId,
  isReferralSource,
  normalizeReferralCode,
} from "../../src/lib/referrals.shared";

describe("código de vendedor", () => {
  it("normaliza o código para uma chave segura e estável", () => {
    expect(normalizeReferralCode(" ab-cd 12_34 ")).toBe("ABCD1234");
  });

  it("limita o código a 16 caracteres", () => {
    expect(normalizeReferralCode("abcdefghijklmnopqrstuv")).toBe("ABCDEFGHIJKLMNOP");
  });

  it("aceita apenas origens conhecidas", () => {
    expect(isReferralSource("link")).toBe(true);
    expect(isReferralSource("seller_code")).toBe(true);
    expect(isReferralSource("checkout")).toBe(true);
    expect(isReferralSource("admin-forjado")).toBe(false);
  });

  it("gera um código estável, curto e válido usando o UID completo", () => {
    const code = codeFromUserId("firebase-user_AZ-123");
    expect(codeFromUserId("firebase-user_AZ-123")).toBe(code);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(code).not.toBe(codeFromUserId("firebase-user_AZ-124"));
    expect(code).not.toContain("NAN");
  });
});

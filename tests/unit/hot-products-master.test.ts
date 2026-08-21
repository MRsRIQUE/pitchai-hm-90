import { describe, expect, it } from "vitest";
import { isHotProductsMaster } from "../../src/lib/live/hot-products-master";

describe("conta mestre de Produtos Quentes", () => {
  it("autoriza a nova conta mestre por e-mail verificado", () => {
    expect(
      isHotProductsMaster({
        uid: "uid-jpa",
        email: "JPA.COSTA590@GMAIL.COM",
        emailVerified: true,
      }),
    ).toBe(true);
  });

  it("não autoriza e-mail mestre ainda não verificado", () => {
    expect(
      isHotProductsMaster({
        uid: "uid-jpa",
        email: "jpa.costa590@gmail.com",
        emailVerified: false,
      }),
    ).toBe(false);
  });

  it("mantém suporte a UIDs e e-mails configurados no ambiente", () => {
    expect(
      isHotProductsMaster({ uid: "uid-legado", email: null }, { masterUids: "uid-a, uid-legado" }),
    ).toBe(true);
    expect(
      isHotProductsMaster(
        { uid: "uid-extra", email: "master@pitch.ai", emailVerified: true },
        { masterEmails: "outro@pitch.ai, MASTER@PITCH.AI" },
      ),
    ).toBe(true);
  });

  it("não concede acesso a outras contas", () => {
    expect(
      isHotProductsMaster({
        uid: "uid-comum",
        email: "cliente@example.com",
        emailVerified: true,
      }),
    ).toBe(false);
  });
});

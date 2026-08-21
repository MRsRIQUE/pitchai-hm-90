import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => {
  const documents = new Map<string, Record<string, unknown>>();
  return {
    documents,
    fsGet: vi.fn(async (path: string) => {
      const data = documents.get(path);
      return data ? { id: path.split("/").at(-1) || "", path, data: { ...data } } : null;
    }),
    fsSet: vi.fn(async (path: string, data: Record<string, unknown>) => {
      documents.set(path, { ...(documents.get(path) ?? {}), ...data });
    }),
    fsCreateIfAbsent: vi.fn(async (path: string, data: Record<string, unknown>) => {
      if (documents.has(path)) return false;
      documents.set(path, { ...data });
      return true;
    }),
    fsCreate: vi.fn(),
  };
});

vi.mock("@/lib/firebase.server", () => ({
  fsGet: firestore.fsGet,
  fsSet: firestore.fsSet,
  fsCreateIfAbsent: firestore.fsCreateIfAbsent,
  fsCreate: firestore.fsCreate,
}));

import { ensureReferralCode } from "../../src/lib/referrals.server";
import { codeFromUserId } from "../../src/lib/referrals.shared";

describe("reserva do código de afiliado", () => {
  beforeEach(() => {
    firestore.documents.clear();
    vi.clearAllMocks();
  });

  it("reserva o documento global de forma atômica", async () => {
    const code = await ensureReferralCode("uid-alpha");

    expect(code).toBe(codeFromUserId("uid-alpha"));
    expect(firestore.fsCreateIfAbsent).toHaveBeenCalledWith(
      `referral_codes/${code}`,
      expect.objectContaining({ uid: "uid-alpha", active: false }),
      { mode: "server" },
    );
  });

  it("tenta outro candidato quando o primeiro já pertence a outra conta", async () => {
    const first = codeFromUserId("uid-beta");
    firestore.documents.set(`referral_codes/${first}`, {
      uid: "outra-conta",
      active: true,
    });

    const code = await ensureReferralCode("uid-beta");

    expect(code).toBe(codeFromUserId("uid-beta:1"));
    expect(firestore.documents.get(`referral_codes/${code}`)?.uid).toBe("uid-beta");
  });

  it("preserva a ativação ao reconstruir o documento local", async () => {
    const code = codeFromUserId("uid-gamma");
    firestore.documents.set(`referral_codes/${code}`, {
      uid: "uid-gamma",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      activatedAt: "2026-01-02T00:00:00.000Z",
    });

    await ensureReferralCode("uid-gamma");

    expect(firestore.documents.get("users/uid-gamma/referral/main")).toMatchObject({
      code,
      active: true,
      activatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("duas chamadas simultâneas reutilizam a mesma reserva", async () => {
    const [first, second] = await Promise.all([
      ensureReferralCode("uid-concurrent"),
      ensureReferralCode("uid-concurrent"),
    ]);

    expect(first).toBe(second);
    const owned = [...firestore.documents.entries()].filter(
      ([path, data]) => path.startsWith("referral_codes/") && data.uid === "uid-concurrent",
    );
    expect(owned).toHaveLength(1);
  });
});

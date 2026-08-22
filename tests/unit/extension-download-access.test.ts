import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  resolveAccess: vi.fn(),
  getPackage: vi.fn(),
}));

vi.mock("@/lib/firebase.server", () => ({
  verifyFirebaseIdToken: mocks.verifyToken,
}));

vi.mock("@/lib/live/access.server", () => ({
  resolveUserAccess: mocks.resolveAccess,
}));

vi.mock("@/lib/live/extension-package.server", () => ({
  getExtensionPackage: mocks.getPackage,
}));

vi.mock("@/lib/live/rate-limit.server", () => ({
  throttle: () => ({ ok: true, retryAfter: 0 }),
}));

import { handleExtensionDownload } from "@/routes/api/account/extension-download";

describe("download protegido da extensão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyToken.mockResolvedValue({ uid: "user-1", email: "cliente@example.com" });
    mocks.resolveAccess.mockResolvedValue({
      active: true,
      source: "paid",
      plan: "pitchai_mensal",
      tier: "pro",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    mocks.getPackage.mockResolvedValue(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("nega quem não está autenticado", async () => {
    const response = await handleExtensionDownload(
      new Request("https://pitchai.example/api/account/extension-download"),
    );

    expect(response.status).toBe(401);
    expect(mocks.verifyToken).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("nega usuário autenticado sem licença ativa", async () => {
    mocks.resolveAccess.mockResolvedValue({
      active: false,
      source: "none",
      plan: "free",
      tier: "free",
      expiresAt: null,
    });

    const response = await handleExtensionDownload(
      new Request("https://pitchai.example/api/account/extension-download", {
        headers: { Authorization: "Bearer firebase-id-token" },
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.getPackage).not.toHaveBeenCalled();
  });

  it("entrega o ZIP somente para licença ativa e sem cache público", async () => {
    const response = await handleExtensionDownload(
      new Request("https://pitchai.example/api/account/extension-download", {
        headers: { Authorization: "Bearer firebase-id-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("pitchai-extension.zip");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      0x50, 0x4b, 0x03, 0x04,
    ]);
  });

  it("não mantém uma cópia pública que contorne o endpoint", () => {
    expect(existsSync(resolve("public/pitchai-extension.zip"))).toBe(false);
    expect(existsSync(resolve("private-assets/pitchai-extension.zip"))).toBe(true);
    expect(readFileSync(resolve("scripts/pack-extension.mjs"), "utf8")).toContain(
      'path.join(privateAssetsDir, "pitchai-extension.zip")',
    );
  });
});

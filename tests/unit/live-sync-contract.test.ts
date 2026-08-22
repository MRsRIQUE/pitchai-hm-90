import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { patchLiveConfigByToken } from "@/lib/firebase.server";
import {
  inferSyncSections,
  invalidSyncKeys,
  selectSyncFields,
  SYNC_SCHEMA_VERSION,
} from "@/lib/live/sync-contract";

const extensionContent = readFileSync(
  fileURLToPath(new URL("../../extension/content.js", import.meta.url)),
  "utf8",
);
const firebaseServer = readFileSync(
  fileURLToPath(new URL("../../src/lib/firebase.server.ts", import.meta.url)),
  "utf8",
);

describe("contrato de sincronização painel-extensão", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("separa contexto textual e catálogo sem misturar os payloads", () => {
    const config = {
      aiContext: { brandName: "Loja" },
      productAiSalesContexts: { p1: { hook: "Olha isso" } },
      produtos: [{ id: "p1", name: "Produto" }],
      protecaoGeral: true,
    };

    expect(selectSyncFields(config, ["texts"])).toEqual({
      aiContext: config.aiContext,
      productAiSalesContexts: config.productAiSalesContexts,
    });
    expect(selectSyncFields(config, ["products"])).toEqual({ produtos: config.produtos });
  });

  it("infere as seções e rejeita campos fora do escopo declarado", () => {
    expect(inferSyncSections({ aiContext: {}, produtos: [] })).toEqual(["texts", "products"]);
    expect(invalidSyncKeys({ produtos: [], aiContext: {} }, ["products"])).toEqual(["aiContext"]);
    expect(SYNC_SCHEMA_VERSION).toBe(2);
  });

  it("a extensão usa patch confirmado, fila trailing e pull automático", () => {
    expect(extensionContent).toContain('action: "patch"');
    expect(extensionContent).toContain('sections: ["products"]');
    expect(extensionContent).toContain("if (!response.ok || !data?.ok)");
    expect(extensionContent).toContain("_queuedProductPush = _queuedProductPush || queued");
    expect(extensionContent).toContain('sections: ["texts", "products"]');
    expect(extensionContent).toContain("void pullPanelContent({ force: true })");
  });

  it("faz patch de campos e incremento de revisão no mesmo commit", async () => {
    expect(firebaseServer).toContain("export async function patchLiveConfigByToken");
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      Response.json({ writeResults: [{ transformResults: [{ integerValue: "7" }] }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await patchLiveConfigByToken(
      "11111111-1111-4111-8111-111111111111",
      {
        uid: "user-1",
        fields: { produtos: [{ id: "p1", name: "Produto" }] },
        sections: ["products"],
      },
      { mode: "public" },
    );

    expect(result.revision).toBe(7);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(body.writes[0].updateMask.fieldPaths).toContain("config.produtos");
    expect(body.writes[0].updateTransforms).toEqual([
      { fieldPath: "revision", increment: { integerValue: "1" } },
    ]);
  });
});

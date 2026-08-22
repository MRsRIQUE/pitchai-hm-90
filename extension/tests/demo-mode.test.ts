import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const backgroundSource = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const contentSource = readFileSync(new URL("../content.js", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../panel.js", import.meta.url), "utf8");
const panelHtml = readFileSync(new URL("../panel.html", import.meta.url), "utf8");
const popupHtml = readFileSync(new URL("../popup.html", import.meta.url), "utf8");

function backgroundHarness(existingTabs: Array<{ id: number }> = []) {
  let storageListener:
    ((changes: Record<string, { newValue?: unknown }>, areaName: string) => void) | undefined;
  const create = vi.fn(async () => ({ id: 42 }));
  const set = vi.fn(async () => undefined);
  const chrome = {
    runtime: {
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      getContexts: vi.fn(async () => []),
      sendMessage: vi.fn(async () => ({ ok: true })),
    },
    offscreen: { createDocument: vi.fn(async () => undefined) },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set,
      },
      onChanged: {
        addListener: vi.fn((listener) => {
          storageListener = listener;
        }),
      },
    },
    tabs: {
      query: vi.fn(async () => existingTabs),
      create,
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      get: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
    },
    scripting: { executeScript: vi.fn() },
  };

  vm.runInNewContext(backgroundSource, {
    chrome,
    crypto,
    URL,
    setTimeout,
    clearTimeout,
    console,
  });
  return { chrome, create, set, emit: storageListener! };
}

describe("transporte do modo demo", () => {
  it("abre a página da LIVE quando o comando chega sem uma aba compatível", async () => {
    const { create, set, emit } = backgroundHarness();
    emit({ "pitchai.demo.cmd": { newValue: { action: "tour", ts: Date.now() } } }, "local");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(create).toHaveBeenCalledWith({
      url: "https://shop.tiktok.com/streamer/live/product/dashboard",
      active: true,
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        "pitchai.demo.ack": expect.objectContaining({
          action: "tour",
          message: expect.stringContaining("Abrindo a página da LIVE"),
        }),
      }),
    );
  });

  it("não abre outra aba quando a LIVE já está disponível", async () => {
    const { create, emit } = backgroundHarness([{ id: 7 }]);
    emit({ "pitchai.demo.cmd": { newValue: { action: "mensagem", ts: Date.now() } } }, "local");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(create).not.toHaveBeenCalled();
  });

  it("não abre a página só para desligar o modo demo", async () => {
    const { chrome, create, emit } = backgroundHarness();
    emit({ "pitchai.demo.cmd": { newValue: { action: "demo:stop", ts: Date.now() } } }, "local");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});

describe("som confiável de venda", () => {
  it("toca fora da página para não depender do autoplay do TikTok", () => {
    expect(backgroundSource).toContain('reasons: ["AUDIO_PLAYBACK"]');
    expect(backgroundSource).toContain("PITCHAI_PLAY_SALE_SOUND");
    expect(contentSource).toContain('type: "PITCHAI_PLAY_SALE_SOUND"');
    expect(contentSource).toContain("playSaleSoundFallback(volume)");
  });
});

describe("ciclo de vida do modo demo distribuído", () => {
  it("consome comando enviado antes de a página existir e confirma ações reais", () => {
    expect(contentSource).toContain("function consumeDemoCommand(command)");
    expect(contentSource).toContain("await chrome.storage.local.get([DEMO_CMD_KEY])");
    expect(contentSource).toContain("handleSale({ textContent: txt }, { simulated: true })");
    expect(contentSource).toContain("if (!spoken) throw new Error");
    expect(contentSource).toContain('"voz",');
  });

  it("remove timers e produtos simulados ao desligar", () => {
    expect(contentSource).toContain("clearTimeout(demo.violationClearTimer)");
    expect(contentSource).toContain(
      "cfg.produtos = (cfg.produtos || []).filter((produto) => !produto.demo)",
    );
    expect(panelSource).toContain(
      "cfg.produtos = (cfg.produtos || []).filter((produto) => !produto.demo)",
    );
  });
});

describe("tutorial completo da extensão", () => {
  it("tem oito etapas, exemplos, checklist e demonstração executável", () => {
    expect(panelHtml.match(/data-onb-step=/g)).toHaveLength(8);
    expect(panelHtml).toContain('class="pnl-onb-example');
    expect(panelHtml).toContain('id="pnl-onb-run-demo"');
    expect(panelHtml).toContain('class="pnl-onb-checklist"');
    expect(panelSource).toContain('const ONBOARD_KEY = "pitchai.onboarded.v3"');
    expect(panelSource).toContain('sendDemoCommand("tour")');
    expect(popupHtml).toContain('href="panel.html"');
  });

  it("pode ser reaberto e fechado por botão ou teclado", () => {
    expect(panelHtml).toContain('id="pnl-open-tutorial"');
    expect(panelHtml).toContain('id="pnl-onb-close"');
    expect(panelSource).toContain('onbClose?.addEventListener("click", finishOnboarding)');
    expect(panelSource).toContain('event.key === "Escape"');
    expect(panelSource).toContain('event.key === "ArrowRight"');
  });
});

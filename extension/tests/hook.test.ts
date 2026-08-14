import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type NetEvent = { kind: "products" | "messages"; payload: Array<Record<string, unknown>> };

function createHookHarness() {
  const events: NetEvent[] = [];
  const responses: unknown[] = [];

  class MockXhr {
    addEventListener() {}
    open() {}
    send() {}
  }

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    addEventListener() {}
  }

  const window = {
    location: { origin: "https://shop.tiktok.com" },
    postMessage: (event: NetEvent) => events.push(event),
    fetch: async (..._args: unknown[]) => {
      const body = JSON.stringify(responses.shift());
      return {
        headers: { get: () => "application/json" },
        clone: () => ({ text: async () => body }),
      };
    },
    WebSocket: MockWebSocket,
  };

  const code = readFileSync(new URL("../hook.js", import.meta.url), "utf8");
  vm.runInNewContext(code, {
    window,
    XMLHttpRequest: MockXhr,
    WebSocket: MockWebSocket,
    Blob,
    ArrayBuffer,
    TextDecoder,
    URL,
    console,
    setTimeout,
    clearTimeout,
  });

  const fetchPayload = async (payload: unknown, url = "https://shop.tiktok.com/api/products") => {
    responses.push(payload);
    await window.fetch(url);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return events.splice(0);
  };

  return { fetchPayload };
}

describe("hook de scraping de rede", () => {
  it("captura uma página grande sem truncar aos 400 itens", async () => {
    const { fetchPayload } = createHookHarness();
    const products = Array.from({ length: 620 }, (_, index) => ({
      product_id: String(100000 + index),
      title: `Produto ${index}`,
      format_price: `R$ ${index + 1},90`,
      cover: `https://img/${index}`,
    }));

    const events = await fetchPayload({ products });
    const captured = events.filter((event) => event.kind === "products").flatMap((event) => event.payload);
    expect(captured).toHaveLength(620);
  });

  it("reemite enriquecimentos e aceita produto sem id quando há evidência forte", async () => {
    const { fetchPayload } = createHookHarness();
    await fetchPayload({
      product_id: "100000",
      title: "Produto principal",
      format_price: "R$ 10,00",
      cover: "https://img/0",
    });
    const updateEvents = await fetchPayload({
      product_id: "100000",
      title: "Produto principal",
      format_price: "R$ 99,90",
      cover: "https://img/0",
    });
    const update = updateEvents.find((event) => event.kind === "products")?.payload[0];
    expect(update?.price).toBe("R$ 99,90");

    const idlessEvents = await fetchPayload({
      title: "Produto sem ID",
      format_price: "R$ 45,00",
      cover: "https://img/idless",
    });
    expect(idlessEvents.find((event) => event.kind === "products")?.payload).toHaveLength(1);
  });

  it("deduplica a mesma mensagem recebida por canais redundantes", async () => {
    const { fetchPayload } = createHookHarness();
    const message = { content: "Tem frete grátis?", user: { nickname: "Maria" } };
    const first = await fetchPayload(message, "https://shop.tiktok.com/api/chat");
    const duplicate = await fetchPayload(message, "https://shop.tiktok.com/api/chat");

    expect(first.find((event) => event.kind === "messages")?.payload).toHaveLength(1);
    expect(duplicate.find((event) => event.kind === "messages")).toBeUndefined();
  });
});

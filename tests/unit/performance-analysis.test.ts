import { describe, expect, it } from "vitest";
import {
  analyzeLivePerformance,
  parseLiveDuration,
  parseLiveNumber,
} from "@/lib/live/performance-analysis";
import type { LiveSessionRow } from "@/lib/live/sync";

const session = (overrides: Partial<LiveSessionRow> = {}): LiveSessionRow => ({
  id: "session-1",
  started_at: "2026-08-21T20:00:00.000Z",
  ended_at: "2026-08-21T21:00:00.000Z",
  messages_answered: 3,
  messages_ignored: 7,
  messages_blocked: 0,
  messages_received: 10,
  audience_joins: 20,
  audience_follows: 0,
  pitches_spoken: 8,
  products_pitched: [{ id: "p1", name: "Produto 1" }],
  tokens_in: 0,
  tokens_out: 0,
  tts_seconds: 0,
  estimated_cost_cents: 0,
  sales_snapshot: [{ text: "Pedido 1" }],
  live_metrics: {
    gmv: "R$ 120,00",
    viewers: "100",
    avg_watch: "00:32",
    product_clicks: "20",
    visitor_percent: "18%",
    captured_at: "2026-08-21T20:59:00.000Z",
  },
  violation_count: 0,
  notes: null,
  ...overrides,
});

describe("análise real da LIVE", () => {
  it("normaliza números e duração exibidos pelo Gerenciador", () => {
    expect(parseLiveNumber("R$ 1.234,56")).toBe(1234.56);
    expect(parseLiveNumber("1,2 mil")).toBe(1200);
    expect(parseLiveNumber("1.234")).toBe(1234);
    expect(parseLiveDuration("01:12")).toBe(72);
    expect(parseLiveDuration("1h 5min 3s")).toBe(3903);
  });

  it("calcula taxas apenas a partir dos eventos e métricas capturados", () => {
    const analysis = analyzeLivePerformance([session()]);
    expect(analysis.orders).toBe(1);
    expect(analysis.responseRate).toBe(30);
    expect(analysis.conversionRate).toBe(5);
    expect(analysis.clickRate).toBe(20);
    expect(analysis.averageTicket).toBe(120);
    expect(analysis.salesPerHour).toBe(1);
    expect(analysis.messagesReceived).toBe(10);
    expect(analysis.recommendations.map((item) => item.id)).toContain("responses");
    expect(analysis.recommendations.map((item) => item.id)).toContain("retention");
    expect(analysis.recommendations.map((item) => item.id)).toContain("follows");
  });

  it("não inventa recomendação numérica quando não existe telemetria", () => {
    const analysis = analyzeLivePerformance([
      session({
        live_metrics: null,
        sales_snapshot: [],
        messages_answered: 0,
        messages_ignored: 0,
      }),
    ]);
    expect(analysis.gmv).toBeNull();
    expect(analysis.conversionRate).toBeNull();
    expect(analysis.recommendations[0]).toMatchObject({ id: "capture", priority: "alta" });
  });
});

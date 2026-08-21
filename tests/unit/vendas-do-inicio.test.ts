import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/live/config";
import type { LiveSessionRow } from "@/lib/live/sync";
import {
  serieDeVendas,
  topProdutos,
  totalDeVendas,
} from "@/components/live/LiveDashboard/sections/vendas";

/**
 * Leitura das sessões para o painel de Início.
 *
 * O que estes testes protegem é a interpretação, não o desenho: a extensão só
 * registra "apareceu um pedido" e "a IA apresentou tal produto", cada um com
 * seu horário. Todo o resto — o gráfico da semana e o ranking — é dedução
 * feita aqui, e uma dedução errada vira um número errado na cara do vendedor.
 */

const HOJE = new Date("2026-08-20T15:00:00.000Z");

const produto = (id: string, name: string): Product => ({
  id,
  name,
  description: "",
  price: "",
  active: false,
});

const sessao = (extra: Partial<LiveSessionRow>): LiveSessionRow =>
  ({
    id: "s1",
    started_at: HOJE.toISOString(),
    ended_at: null,
    messages_answered: 0,
    messages_ignored: 0,
    messages_blocked: 0,
    products_pitched: null,
    tokens_in: 0,
    tokens_out: 0,
    tts_seconds: 0,
    estimated_cost_cents: 0,
    sales_snapshot: null,
    live_metrics: null,
    ...extra,
  }) as LiveSessionRow;

describe("serieDeVendas", () => {
  it("devolve os sete dias, inclusive os sem live", () => {
    const serie = serieDeVendas([], 7, HOJE);
    expect(serie).toHaveLength(7);
    expect(serie.every((d) => d.vendas === 0 && d.respostas === 0)).toBe(true);
    // do mais antigo para o mais novo, senão o gráfico desenharia a semana ao contrário
    expect(serie[6].data.getDate()).toBe(HOJE.getDate());
  });

  it("conta cada pedido no dia do próprio pedido, não no dia da sessão", () => {
    // Live que virou a madrugada: começou dia 19 e vendeu já no dia 20. Sem o
    // "Z" de propósito — o vendedor pensa no fuso dele, e é por dia local que
    // a série agrupa; um pedido às 21h não pode aparecer no dia seguinte.
    const serie = serieDeVendas(
      [
        sessao({
          started_at: "2026-08-19T23:30:00",
          sales_snapshot: [{ at: "2026-08-19T23:40:00" }, { at: "2026-08-20T00:20:00" }],
        }),
      ],
      7,
      HOJE,
    );
    const dia19 = serie.find((d) => d.data.getDate() === 19);
    const dia20 = serie.find((d) => d.data.getDate() === 20);
    expect(dia19?.vendas).toBe(1);
    expect(dia20?.vendas).toBe(1);
  });

  it("usa o dia da sessão quando o pedido antigo não tem horário", () => {
    const serie = serieDeVendas(
      [sessao({ started_at: "2026-08-18T10:00:00.000Z", sales_snapshot: [{ text: "pedido" }] })],
      7,
      HOJE,
    );
    expect(serie.find((d) => d.data.getDate() === 18)?.vendas).toBe(1);
    expect(totalDeVendas(serie)).toBe(1);
  });

  it("ignora o que caiu fora da janela e não quebra com data inválida", () => {
    const serie = serieDeVendas(
      [
        sessao({ started_at: "2026-01-01T10:00:00.000Z", sales_snapshot: [{ at: "2026-01-01" }] }),
        sessao({ started_at: "não é data", sales_snapshot: [{ at: "também não" }] }),
      ],
      7,
      HOJE,
    );
    expect(totalDeVendas(serie)).toBe(0);
  });

  it("soma as respostas da IA no dia em que a sessão começou", () => {
    const serie = serieDeVendas(
      [
        sessao({ started_at: "2026-08-20T09:00:00.000Z", messages_answered: 12 }),
        sessao({ id: "s2", started_at: "2026-08-20T14:00:00.000Z", messages_answered: 8 }),
      ],
      7,
      HOJE,
    );
    expect(serie.find((d) => d.data.getDate() === 20)?.respostas).toBe(20);
  });
});

describe("topProdutos", () => {
  const catalogo = [produto("a", "Camiseta Dry Fit"), produto("b", "Tênis de Corrida")];

  it("credita o pedido ao último produto apresentado antes dele", () => {
    const ranking = topProdutos(
      [
        sessao({
          products_pitched: [
            { name: "Camiseta Dry Fit", id: "a", at: "2026-08-20T10:00:00.000Z" },
            { name: "Tênis de Corrida", id: "b", at: "2026-08-20T11:00:00.000Z" },
          ],
          sales_snapshot: [
            { at: "2026-08-20T10:30:00.000Z" },
            { at: "2026-08-20T11:30:00.000Z" },
            { at: "2026-08-20T11:45:00.000Z" },
          ],
        }),
      ],
      catalogo,
    );

    expect(ranking[0]).toMatchObject({ nome: "Tênis de Corrida", vendas: 2 });
    expect(ranking[1]).toMatchObject({ nome: "Camiseta Dry Fit", vendas: 1 });
  });

  it("credita ao primeiro produto quando a venda é anterior a qualquer pitch", () => {
    const ranking = topProdutos(
      [
        sessao({
          products_pitched: [{ name: "Camiseta Dry Fit", id: "a", at: "2026-08-20T10:00:00.000Z" }],
          sales_snapshot: [{ at: "2026-08-20T09:50:00.000Z" }],
        }),
      ],
      catalogo,
    );
    expect(ranking[0]).toMatchObject({ nome: "Camiseta Dry Fit", vendas: 1 });
  });

  it("mantém no ranking o produto apresentado que não vendeu", () => {
    const ranking = topProdutos(
      [
        sessao({
          products_pitched: [
            { name: "Camiseta Dry Fit", id: "a", at: "2026-08-20T10:00:00.000Z" },
            { name: "Tênis de Corrida", id: "b", at: "2026-08-20T11:00:00.000Z" },
          ],
          sales_snapshot: [{ at: "2026-08-20T10:30:00.000Z" }],
        }),
      ],
      catalogo,
    );
    expect(ranking).toHaveLength(2);
    expect(ranking[1]).toMatchObject({ nome: "Tênis de Corrida", vendas: 0 });
  });

  it("soma o mesmo produto entre sessões diferentes", () => {
    const umaVenda = (id: string, at: string) =>
      sessao({
        id,
        products_pitched: [{ name: "Camiseta Dry Fit", id: "a", at }],
        sales_snapshot: [{ at }],
      });
    const ranking = topProdutos(
      [umaVenda("s1", "2026-08-19T10:00:00.000Z"), umaVenda("s2", "2026-08-20T10:00:00.000Z")],
      catalogo,
    );
    expect(ranking[0].vendas).toBe(2);
  });

  it("casa com o catálogo por nome quando a sessão antiga não gravou id", () => {
    const ranking = topProdutos(
      [
        sessao({
          products_pitched: [{ name: "camiseta  DRY fit", at: "2026-08-20T10:00:00.000Z" }],
          sales_snapshot: [{ at: "2026-08-20T10:30:00.000Z" }],
        }),
      ],
      catalogo,
    );
    expect(ranking[0].produto?.id).toBe("a");
  });

  it("devolve produto fora do catálogo sem referência, em vez de sumir com ele", () => {
    const ranking = topProdutos(
      [
        sessao({
          products_pitched: [{ name: "Produto Apagado", id: "z", at: "2026-08-20T10:00:00.000Z" }],
          sales_snapshot: [{ at: "2026-08-20T10:30:00.000Z" }],
        }),
      ],
      catalogo,
    );
    expect(ranking[0]).toMatchObject({ nome: "Produto Apagado", vendas: 1, produto: null });
  });

  it("não inventa ranking quando a sessão não apresentou nenhum produto", () => {
    expect(topProdutos([sessao({ sales_snapshot: [{ at: HOJE.toISOString() }] })], catalogo)).toEqual(
      [],
    );
  });
});

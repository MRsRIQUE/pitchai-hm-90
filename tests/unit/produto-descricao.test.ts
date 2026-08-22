import { describe, expect, it } from "vitest";
import {
  descricaoDoProduto,
  limparDescricao,
  trechoEhRuidoDaVitrine,
} from "@/components/live/LiveDashboard/sections/produto";

/**
 * A aba Produtos mostrava, embaixo de cada produto, o texto dos controles do
 * card da vitrine do TikTok (": 0 Fixar Cliques 0 · Adicionado ao carrinho 0",
 * "16:08:43 · : 0 Desafixar Cliques 0"). O catálogo já gravado carrega isso,
 * então a leitura precisa limpar — sem comer descrição de verdade.
 */

describe("trechoEhRuidoDaVitrine", () => {
  it("reconhece os restos dos controles do card", () => {
    expect(trechoEhRuidoDaVitrine(": 0 Fixar Cliques 0")).toBe(true);
    expect(trechoEhRuidoDaVitrine("Adicionado ao carrinho 0")).toBe(true);
    expect(trechoEhRuidoDaVitrine(": 0 Desafixar Cliques 0")).toBe(true);
    expect(trechoEhRuidoDaVitrine("Cliques: 12")).toBe(true);
  });

  it("reconhece cronômetro, contador de estoque e prazo da oferta", () => {
    expect(trechoEhRuidoDaVitrine("16:08:43")).toBe(true);
    expect(trechoEhRuidoDaVitrine("1 dia")).toBe(true);
    expect(trechoEhRuidoDaVitrine("Em estoque: 18,8 mil")).toBe(true);
    expect(trechoEhRuidoDaVitrine("")).toBe(true);
  });

  it("deixa passar descrição real, mesmo com palavra de controle no meio", () => {
    expect(trechoEhRuidoDaVitrine("Suporte para fixar na parede")).toBe(false);
    expect(trechoEhRuidoDaVitrine("Kit 3 peças")).toBe(false);
    expect(trechoEhRuidoDaVitrine("Carrinho de bebê dobrável")).toBe(false);
    expect(trechoEhRuidoDaVitrine("Frete grátis para todo o Brasil")).toBe(false);
    expect(trechoEhRuidoDaVitrine("Bateria de 30000mAh")).toBe(false);
  });
});

describe("limparDescricao", () => {
  it("apaga a descrição que era só interface da vitrine", () => {
    expect(limparDescricao(": 0 Fixar Cliques 0 · Adicionado ao carrinho 0")).toBe("");
    expect(limparDescricao("1 dia · : 0 Fixar Cliques 0 · Adicionado ao carrinho 0")).toBe("");
    expect(limparDescricao("16:08:43 · : 0 Desafixar Cliques 0 · Adicionado ao carrinho 0")).toBe(
      "",
    );
  });

  it("mantém os trechos úteis e joga fora só o ruído", () => {
    expect(
      limparDescricao('Tela AMOLED 1.43" · : 0 Fixar Cliques 0 · Monitor cardíaco · 1 dia'),
    ).toBe('Tela AMOLED 1.43" · Monitor cardíaco');
  });

  it("não mexe em descrição escrita pelo vendedor", () => {
    const texto = "Powerbank 100W com cabo Type-C. Carrega 3 aparelhos ao mesmo tempo.";
    expect(limparDescricao(texto)).toBe(texto);
    expect(limparDescricao("")).toBe("");
    expect(limparDescricao(null)).toBe("");
  });

  it("lê do produto pelo mesmo caminho da tela", () => {
    expect(
      descricaoDoProduto({
        id: "p1",
        name: "Smartwatch",
        description: ": 0 Fixar Cliques 0 · Adicionado ao carrinho 0",
        price: "",
        active: false,
      }),
    ).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/live/config";
import {
  formatarPreco,
  iniciaisDoProduto,
  urlDaImagem,
} from "@/components/live/LiveDashboard/sections/produto";

/**
 * Contrato de foto e preço combinado com a vitrine.
 *
 * O painel e a extração vivem em arquivos diferentes e evoluem separados; estes
 * testes existem para que uma mudança de um lado quebre aqui, e não na tela do
 * vendedor no meio de uma live.
 */

const base: Product = {
  id: "p1",
  name: "Kit Skincare",
  description: "",
  price: "",
  active: false,
};

const produto = (extra: Partial<Product>): Product => ({ ...base, ...extra });

// O Intl separa símbolo e número com espaço não separável (U+00A0) ou estreito
// (U+202F). Comparar com espaço comum falharia por um caractere invisível — e
// escrevê-los literalmente aqui deixaria o teste ilegível no diff.
const norm = (s: string | null) => s?.replace(/[\u00A0\u202F]/g, " ") ?? null;

describe("formatarPreco", () => {
  it("formata centavos como moeda pt-BR", () => {
    expect(norm(formatarPreco(produto({ priceCents: 8990 })))).toBe("R$ 89,90");
  });

  it("põe separador de milhar — é o que o toFixed perderia", () => {
    expect(norm(formatarPreco(produto({ priceCents: 123456789 })))).toBe("R$ 1.234.567,89");
  });

  it("mostra a faixa quando existe teto maior", () => {
    expect(norm(formatarPreco(produto({ priceCents: 2990, priceMaxCents: 4990 })))).toBe(
      "R$ 29,90 – R$ 49,90",
    );
  });

  it("ignora o teto quando é igual ou menor que o mínimo", () => {
    expect(norm(formatarPreco(produto({ priceCents: 2990, priceMaxCents: 2990 })))).toBe(
      "R$ 29,90",
    );
    expect(norm(formatarPreco(produto({ priceCents: 2990, priceMaxCents: 1000 })))).toBe(
      "R$ 29,90",
    );
  });

  it("trata 'De X por Y' como preço único — só o menor chega, sem teto", () => {
    expect(
      norm(formatarPreco(produto({ priceCents: 4990, price: "De R$ 99,90 por R$ 49,90" }))),
    ).toBe("R$ 49,90");
  });

  it("distingue preço ausente de produto grátis", () => {
    expect(formatarPreco(produto({}))).toBeNull();
    expect(norm(formatarPreco(produto({ priceCents: 0 })))).toBe("R$ 0,00");
  });

  it("cai no texto legado quando não há priceCents", () => {
    expect(formatarPreco(produto({ price: "R$ 89,90" }))).toBe("R$ 89,90");
    expect(formatarPreco(produto({ price: "   " }))).toBeNull();
  });

  it("prefere priceCents ao texto legado", () => {
    expect(norm(formatarPreco(produto({ priceCents: 1000, price: "R$ 99,90" })))).toBe("R$ 10,00");
  });

  it("respeita outras moedas", () => {
    expect(norm(formatarPreco(produto({ priceCents: 8990, currency: "USD" })))).toBe("US$ 89,90");
    expect(norm(formatarPreco(produto({ priceCents: 8990, currency: "EUR" })))).toBe("€ 89,90");
  });

  it("não estoura com moeda malformada — o Intl lançaria RangeError", () => {
    for (const currency of ["R$", "", "  ", "ABCD", "1"]) {
      expect(() => formatarPreco(produto({ priceCents: 8990, currency }))).not.toThrow();
    }
    expect(norm(formatarPreco(produto({ priceCents: 8990, currency: "R$" })))).toBe("R$ 89,90");
  });
});

describe("urlDaImagem", () => {
  it("aceita http e https", () => {
    expect(urlDaImagem(produto({ imageUrl: "https://cdn.tiktok.com/p.jpg" }))).toBe(
      "https://cdn.tiktok.com/p.jpg",
    );
  });

  it("recusa esquema que não seja http(s)", () => {
    for (const imageUrl of [
      "data:image/png;base64,AAAA",
      "blob:https://x/y",
      "javascript:alert(1)",
    ]) {
      expect(urlDaImagem(produto({ imageUrl }))).toBeNull();
    }
  });

  it("recusa URL acima de 2048 caracteres", () => {
    expect(urlDaImagem(produto({ imageUrl: "https://cdn/" + "a".repeat(2048) }))).toBeNull();
  });

  it("devolve null quando o campo está ausente ou vazio", () => {
    expect(urlDaImagem(produto({}))).toBeNull();
    expect(urlDaImagem(produto({ imageUrl: "   " }))).toBeNull();
  });
});

describe("iniciaisDoProduto", () => {
  it("usa as duas primeiras palavras", () => {
    expect(iniciaisDoProduto("Kit Skincare Vitamina C")).toBe("KS");
  });

  it("usa as duas primeiras letras quando há só uma palavra", () => {
    expect(iniciaisDoProduto("Fone")).toBe("FO");
  });

  it("não quebra com nome vazio ou só de símbolos", () => {
    expect(iniciaisDoProduto("")).toBe("?");
    expect(iniciaisDoProduto("--- ///")).toBe("?");
  });
});

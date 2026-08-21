import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrato do scraper injetado na página do produto.
 *
 * Executa o arquivo contra um DOM mínimo com as três fontes utilizadas pelo
 * TikTok: JSON-LD, meta tags e conteúdo renderizado.
 */
const fonte = readFileSync(
  fileURLToPath(new URL("../../extension/product-scrape.js", import.meta.url)),
  "utf8",
);

type Imagem = { src: string; naturalWidth: number; naturalHeight: number };

type Pagina = {
  url?: string;
  titulo?: string;
  metas?: Record<string, string>;
  ld?: unknown;
  h1?: string;
  texto?: string;
  imagens?: Imagem[];
  captcha?: boolean;
};

type Leitura = {
  verificacao: boolean;
  pronto: boolean;
  codigo: string;
  link: string;
  nome: string;
  preco: string;
  imagem_url: string;
};

function ler(pagina: Pagina): Leitura {
  const metas = pagina.metas ?? {};
  const documento = {
    title: pagina.titulo ?? "",
    images: pagina.imagens ?? [],
    body: { innerText: pagina.texto ?? "" },
    querySelector(seletor: string) {
      if (seletor.startsWith("meta[")) {
        const chave = seletor.match(/"([^"]+)"/)?.[1] ?? "";
        return metas[chave] ? { content: metas[chave] } : null;
      }
      if (seletor.includes("captcha")) return pagina.captcha ? {} : null;
      if (seletor === "h1") return pagina.h1 ? { textContent: pagina.h1 } : null;
      return null;
    },
    querySelectorAll(seletor: string) {
      if (seletor.includes("ld+json"))
        return pagina.ld === undefined ? [] : [{ textContent: JSON.stringify(pagina.ld) }];
      return [];
    },
  };

  const executar = new Function(
    "document",
    "location",
    `${fonte}\nreturn globalThis.__pitchaiLerProduto();`,
  ) as (doc: unknown, loc: unknown) => Leitura;

  return executar(documento, { href: pagina.url ?? "https://shop.tiktok.com/view/product/123456" });
}

describe("leitura da página do produto", () => {
  it("prefere o JSON-LD, que vem do backend do TikTok", () => {
    const lido = ler({
      url: "https://shop.tiktok.com/view/product/1729387654321098765",
      metas: { "og:title": "Título da meta", "og:image": "https://p16.tiktokcdn.com/meta.jpg" },
      ld: {
        "@type": "Product",
        name: "Kit Skincare Vitamina C",
        image: ["https://p16.tiktokcdn.com/ld.jpg"],
        offers: { price: "79.90" },
      },
    });

    expect(lido.nome).toBe("Kit Skincare Vitamina C");
    expect(lido.imagem_url).toBe("https://p16.tiktokcdn.com/ld.jpg");
    expect(lido.preco).toBe("79.90");
    expect(lido.codigo).toBe("1729387654321098765");
    expect(lido.pronto).toBe(true);
  });

  it("cai para as meta tags quando não há JSON-LD", () => {
    const lido = ler({
      url: "https://www.tiktok.com/shop/pdp/987654321098765",
      metas: {
        "og:title": "Fone Bluetooth XZ",
        "og:image": "https://p16.tiktokcdn.com/fone.jpg",
        "product:price:amount": "R$ 149,90",
      },
    });

    expect(lido.nome).toBe("Fone Bluetooth XZ");
    expect(lido.preco).toBe("R$ 149,90");
    expect(lido.codigo).toBe("987654321098765");
  });

  it("no DOM cru, pega o h1, a maior foto de CDN e o primeiro preço", () => {
    const lido = ler({
      h1: "Cafeteira Express",
      texto: "R$ 1.299,00 de R$ 1.899,00 — 12x sem juros",
      imagens: [
        { src: "https://p16.tiktokcdn.com/avatar.jpg", naturalWidth: 96, naturalHeight: 96 },
        { src: "https://outra-cdn.com/enorme.jpg", naturalWidth: 1200, naturalHeight: 1200 },
        { src: "https://p16.tiktokcdn.com/produto.jpg", naturalWidth: 600, naturalHeight: 600 },
      ],
    });

    expect(lido.nome).toBe("Cafeteira Express");
    expect(lido.imagem_url).toBe("https://p16.tiktokcdn.com/produto.jpg");
    expect(lido.preco).toBe("R$ 1.299,00");
  });

  it("marca a tela de verificação em vez de devolver página vazia", () => {
    const lido = ler({ titulo: "Security Check" });
    expect(lido.verificacao).toBe(true);
    expect(lido.pronto).toBe(false);
  });

  it("não se diz pronto quando falta a foto", () => {
    const lido = ler({ metas: { "og:title": "Só o nome" } });
    expect(lido.nome).toBe("Só o nome");
    expect(lido.pronto).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { mergeVitrineProducts } from "../../src/lib/live/config";
import {
  currencyFromPrice,
  isBadProductName,
  isUsableImageUrl,
  parsePriceCents,
  pickBestSrcsetUrl,
  stripProductMeta,
} from "../src/utils/string";

/**
 * O produto lixo que chegou ao painel do usuário: `textContent` de um container
 * inteiro da interface do TikTok virou "nome de produto". A assinatura é a
 * palavra colada na fronteira entre elementos irmãos (relâmpagoRecompensa,
 * CartazCupom, ProdutoAdicionar) — nenhum pedaço isolado é um termo de UI que os
 * filtros antigos conheciam, por isso passou.
 */
const NOME_LIXO_CONCATENADO =
  "Oferta relâmpagoRecompensaCartazCupomProdutoAdicionarAinda não há produtosOs " +
  "produtos adicionados aparecerão aquiAdicionar produtosLIVE com produtos estarão " +
  "disponíveis apenas para espectadores com 18 anos ou mais.";

/**
 * Nomes reais do catálogo — a régua de calibração. Qualquer defesa nova tem que
 * deixar todos estes passarem, inclusive os longos e os com marca em camelCase.
 */
const NOMES_LEGITIMOS = [
  "Basike Teclado Mecanico Gamer Sem Fio 99 Teclas RGB Hot Swap Bluetooth 5.0 " +
    "Recarregavel Compativel com PC Notebook Celular Tablet Ideal para Jogos e Trabalho",
  "Kit 3 Camisetas Masculinas Dry Fit Academia Treino Corrida Tecido Respirável com " +
    "Proteção UV50+ Disponível nos Tamanhos P M G GG e XG Envio Imediato",
  "Capinha iPhone 15 Pro Max Transparente MagSafe Anti Impacto",
  "Combo Fone TWS PowerBank 10000mAh e SmartWatch D20 Preto",
  "Kit Panelas Antiaderente 5 Peças",
];

describe("filtro de nome de produto da vitrine", () => {
  it("rejeita o textContent concatenado da interface do TikTok", () => {
    expect(isBadProductName(NOME_LIXO_CONCATENADO)).toBe(true);
  });

  it("aceita os nomes reais do catálogo, inclusive os longos", () => {
    for (const nome of NOMES_LEGITIMOS) {
      expect(isBadProductName(nome), nome).toBe(false);
    }
  });

  it("não confunde marca em camelCase com texto de interface colado", () => {
    // Casos que a contagem de maiúsculas coladas poderia matar por engano.
    expect(isBadProductName("Carregador Turbo QuickCharge 20000mAh iPhone MagSafe")).toBe(false);
    expect(isBadProductName("Smartwatch GamerPro TechLife HomeOffice")).toBe(false);
  });

  it("rejeita nome longo demais para ser título de produto", () => {
    // Sem concatenação nenhuma: só o comprimento denuncia que é texto de tela.
    const paragrafo = "palavra ".repeat(40).trim();
    expect(paragrafo.length).toBeGreaterThan(200);
    expect(isBadProductName(paragrafo)).toBe(true);
  });

  it("rejeita as frases de estado vazio da vitrine", () => {
    expect(isBadProductName("Ainda não há produtos")).toBe(true);
    expect(isBadProductName("Os produtos adicionados aparecerão aqui")).toBe(true);
    expect(
      isBadProductName(
        "LIVE com produtos estarão disponíveis apenas para espectadores com 18 anos ou mais",
      ),
    ).toBe(true);
  });

  it("continua barrando os termos de interface que já barrava", () => {
    for (const nome of [
      "Gerenciador de Live",
      "Adicionar",
      "Frete grátis",
      "Sair",
      "12 vendidos",
    ]) {
      expect(isBadProductName(nome), nome).toBe(true);
    }
  });

  it("rejeita cupons, promoções e controles de catálogo", () => {
    for (const nome of [
      "Cupom do vendedor RICK5 5% de desconto",
      "Promoção da loja",
      "Oferta relâmpago",
      "Catálogo Todos",
      "Todos os produtos",
      "Recompensas",
      "Cartaz de cupom",
      "Desconto de R$ 20",
      "15% OFF",
    ]) {
      expect(isBadProductName(nome), nome).toBe(true);
    }
  });
});

/**
 * `content.js` é o arquivo que o Chrome do usuário roda de verdade: o zip é
 * montado copiando os arquivos da raiz de extension/, não o bundle de src/ (ver
 * scripts/pack-extension.mjs). Ele carrega a própria cópia do filtro, então
 * precisa da própria rede de segurança — corrigir só src/ não chega ao usuário.
 */
function carregarDoContentJs(
  inicioMarcador: string,
  ultimaFuncao: string,
  expressaoFinal: string,
  extras: Record<string, unknown> = {},
) {
  const source = readFileSync(fileURLToPath(new URL("../content.js", import.meta.url)), "utf8");

  const inicio = source.indexOf(inicioMarcador);
  const cabecalho = source.indexOf(ultimaFuncao, inicio);
  expect(inicio, `"${inicioMarcador}" não encontrado em content.js`).toBeGreaterThan(-1);
  expect(cabecalho, `"${ultimaFuncao}" não encontrada em content.js`).toBeGreaterThan(-1);

  // Fim da função pelo fechamento das chaves — nenhum literal do bloco tem "{".
  let i = source.indexOf("{", cabecalho);
  let nivel = 0;
  do {
    if (source[i] === "{") nivel++;
    else if (source[i] === "}") nivel--;
    i++;
  } while (nivel > 0 && i < source.length);

  const contexto = vm.createContext({ document: undefined, ...extras });
  return vm.runInContext(`${source.slice(inicio, i)}\n;${expressaoFinal}`, contexto);
}

describe("filtro de nome no content.js distribuído", () => {
  // `document` só é tocado por refreshAccountNames, que este teste não chama.
  const isBadProductNameDistribuido = carregarDoContentJs(
    "const BADGE_RX =",
    "function isBadProductName(name) {",
    "isBadProductName",
  ) as (name: unknown) => boolean;

  it("rejeita o textContent concatenado da interface do TikTok", () => {
    expect(isBadProductNameDistribuido(NOME_LIXO_CONCATENADO)).toBe(true);
  });

  it("aceita os nomes reais do catálogo", () => {
    for (const nome of NOMES_LEGITIMOS) {
      expect(isBadProductNameDistribuido(nome), nome).toBe(false);
    }
  });

  it("rejeita as frases de estado vazio da vitrine", () => {
    expect(isBadProductNameDistribuido("Ainda não há produtos")).toBe(true);
    expect(isBadProductNameDistribuido("Os produtos adicionados aparecerão aqui")).toBe(true);
  });

  it("rejeita entidades comerciais que ficam ao lado dos produtos", () => {
    for (const nome of [
      "Cupom do vendedor RICK5",
      "Promoções",
      "Oferta relâmpago",
      "Catálogo Todos",
      "Todos os produtos",
      "Cartaz de cupom",
      "10% OFF",
    ]) {
      expect(isBadProductNameDistribuido(nome), nome).toBe(true);
    }
  });
});

/**
 * O card de oferta relâmpago cola o cronômetro no título via textContent
 * ("CozinhaTermina em 04:08:53Termina em 04:08:53De"): o split de metadados
 * com \b não enxerga fronteira nenhuma no texto emendado, e o nome ia para o
 * painel com o cronômetro inteiro — o bug visto no print do usuário.
 */
const NOME_COM_CRONOMETRO =
  "Cortador Ralador Fatiador Manual 16 Peças Legumes Verduras Frutas Vegetais " +
  "CozinhaTermina em 04:08:53Termina em 04:08:53De";
const NOME_LIMPO_DO_CRONOMETRO =
  "Cortador Ralador Fatiador Manual 16 Peças Legumes Verduras Frutas Vegetais Cozinha";

describe("cronômetro de oferta colado no nome (content.js distribuído)", () => {
  const distribuido = carregarDoContentJs(
    "const BADGE_RX =",
    "function cleanupProducts(cfg) {",
    "({ stripProductMeta, inferNameFromProductText, descriptionLines, cleanupProducts })",
    { PRICE_RX: /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i },
  ) as {
    stripProductMeta: (raw: unknown) => string;
    inferNameFromProductText: (text: string, price?: string) => string;
    descriptionLines: (text: string) => string[];
    cleanupProducts: (cfg: { produtos: Record<string, unknown>[] }) => boolean;
  };

  it("corta o cronômetro colado no fim do nome", () => {
    expect(distribuido.stripProductMeta(NOME_COM_CRONOMETRO)).toBe(NOME_LIMPO_DO_CRONOMETRO);
  });

  it("não corta palavra que só contém o rótulo", () => {
    expect(distribuido.stripProductMeta("Kit Determina em Pó 500g")).toBe(
      "Kit Determina em Pó 500g",
    );
  });

  it("mantém os nomes reais do catálogo intactos", () => {
    for (const nome of NOMES_LEGITIMOS) {
      expect(distribuido.stripProductMeta(nome), nome).toBe(nome);
    }
  });

  it("infere o nome limpo do texto emendado do card", () => {
    const texto = `${NOME_COM_CRONOMETRO} R$ 33,99 R$ 31,99Em estoque: 18,8 milDemonstração solicitada: 0`;
    expect(distribuido.inferNameFromProductText(texto, "R$ 31,99")).toBe(NOME_LIMPO_DO_CRONOMETRO);
  });

  it("joga fora a descrição que é resto de card raspado", () => {
    expect(
      distribuido.descriptionLines("R$ 33,99Em estoque: 18,8 milDemonstração solicitada: 0"),
    ).toEqual([]);
    expect(
      distribuido.descriptionLines(
        "Leve e portátil · Garantia de 12 meses · R$ 33,99 Em estoque: 5",
      ),
    ).toEqual(["Leve e portátil", "Garantia de 12 meses"]);
  });

  it("repara o produto já gravado com cronômetro, sem derrubar o ativo", () => {
    const cfg = {
      produtos: [
        {
          id: "p1",
          name: NOME_COM_CRONOMETRO,
          price: "R$ 31,99",
          description: "R$ 33,99Em estoque: 18,8 milDemonstração solicitada: 0",
          active: true,
          fromVitrine: true,
        },
      ],
    };
    expect(distribuido.cleanupProducts(cfg)).toBe(true);
    expect(cfg.produtos[0].name).toBe(NOME_LIMPO_DO_CRONOMETRO);
    expect(cfg.produtos[0].description).toBe("");
    expect(cfg.produtos[0].active).toBe(true);
  });

  it("remove do catálogo salvo as entidades comerciais antigas", () => {
    const cfg = {
      produtos: [
        { id: "coupon", name: "Cupom do vendedor RICK5", fromVitrine: true, active: true },
        { id: "catalog", name: "Catálogo Todos", fromVitrine: true, active: false },
        {
          id: "product",
          name: "Kit Panelas Antiaderente 5 Peças",
          price: "R$ 99,90",
          fromVitrine: true,
          active: false,
        },
      ],
    };

    expect(distribuido.cleanupProducts(cfg)).toBe(true);
    expect(cfg.produtos).toHaveLength(1);
    expect(cfg.produtos[0].name).toBe("Kit Panelas Antiaderente 5 Peças");
    expect(cfg.produtos[0].active).toBe(true);
  });

  it("dá o mesmo resultado que a versão de src/ — as duas não podem divergir", () => {
    for (const texto of [NOME_COM_CRONOMETRO, "Kit Determina em Pó 500g", ...NOMES_LEGITIMOS]) {
      expect(distribuido.stripProductMeta(texto), texto).toBe(stripProductMeta(texto));
    }
  });
});

describe("identidade segura do produto para fixação", () => {
  const pinNamesMatch = carregarDoContentJs(
    "const BADGE_RX =",
    "function pinNamesMatch(a, b) {",
    "pinNamesMatch",
  ) as (a: unknown, b: unknown) => boolean;

  it("aceita o mesmo título com diferenças de acento e caixa", () => {
    expect(
      pinNamesMatch("Kit Panelas Antiaderente 5 Peças", "KIT PANELAS antiaderente 5 pecas"),
    ).toBe(true);
  });

  it("aceita somente truncamento longo que esteja explícito no DOM", () => {
    expect(
      pinNamesMatch(
        "Basike Teclado Mecânico Gamer Sem Fio…",
        "Basike Teclado Mecânico Gamer Sem Fio 99 Teclas RGB Hot Swap",
      ),
    ).toBe(true);
  });

  it("não confunde produtos parecidos nem texto extra da vitrine com título", () => {
    expect(
      pinNamesMatch("Kit Maquiagem Profissional Rosa", "Kit Maquiagem Profissional Azul"),
    ).toBe(false);
    expect(
      pinNamesMatch(
        "Kit Panelas Antiaderente 5 Peças Fixar Em estoque 12",
        "Kit Panelas Antiaderente 5 Peças",
      ),
    ).toBe(false);
  });
});

describe("classificação estrutural da vitrine", () => {
  const isNonProductContainer = carregarDoContentJs(
    "const BADGE_RX =",
    "function isNonProductContainer(card) {",
    "isNonProductContainer",
  ) as (card: Record<string, unknown>) => boolean;

  const node = (className: string, textContent: string) => ({
    className,
    id: "",
    textContent,
    getAttribute: () => "",
    querySelectorAll: () => [],
    contains: () => false,
  });

  it("barra cards estruturais de cupom e cabeçalhos de catálogo", () => {
    expect(isNonProductContainer(node("couponCard", "RICK5 5% OFF"))).toBe(true);
    expect(isNonProductContainer(node("catalog-all", "Catálogo Todos"))).toBe(true);
    expect(isNonProductContainer(node("toolbar", "Todos os produtos"))).toBe(true);
  });

  it("não barra um card comum pelo simples fato de ter preço", () => {
    expect(
      isNonProductContainer(node("product-card", "Kit Panelas Antiaderente 5 Peças R$ 99,90")),
    ).toBe(false);
  });
});

describe("preço e foto no content.js distribuído", () => {
  const distribuido = carregarDoContentJs(
    "const CURRENCY_BY_SYMBOL =",
    "function pickBestSrcsetUrl(srcset) {",
    "({ parsePriceCents, currencyFromPrice, isUsableImageUrl, pickBestSrcsetUrl })",
    { PRICE_RX: /(R\$|US\$|\$|€|£)\s?\d[\d.,]*/i },
  ) as {
    parsePriceCents: (raw: unknown) => { cents: number; maxCents?: number } | null;
    currencyFromPrice: (raw: unknown) => string | undefined;
    isUsableImageUrl: (url: unknown) => boolean;
    pickBestSrcsetUrl: (srcset: unknown) => string;
  };

  it("dá o mesmo resultado que a versão de src/ — as duas não podem divergir", () => {
    for (const texto of [
      "R$ 89,90",
      "R$ 1.299,00",
      "R$ 29,90 - R$ 49,90",
      "De R$ 99,90 por R$ 49,90",
      "12 vendidos",
    ]) {
      expect(distribuido.parsePriceCents(texto), texto).toEqual(parsePriceCents(texto));
      expect(distribuido.currencyFromPrice(texto), texto).toBe(currencyFromPrice(texto));
    }
  });

  it("recusa foto que não sobrevive à viagem e acha a maior do srcset", () => {
    expect(distribuido.isUsableImageUrl("https://cdn.tiktok.com/p.jpg")).toBe(true);
    expect(distribuido.isUsableImageUrl("blob:https://tiktok.com/9a8b")).toBe(false);
    expect(
      distribuido.pickBestSrcsetUrl("https://cdn/p_100.jpg 100w, https://cdn/p_800.jpg 800w"),
    ).toBe("https://cdn/p_800.jpg");
  });
});

describe("preço em centavos", () => {
  it("lê os formatos que a vitrine escreve", () => {
    expect(parsePriceCents("R$ 89,90")).toEqual({ cents: 8990 });
    expect(parsePriceCents("R$ 1.299,00")).toEqual({ cents: 129900 });
    expect(parsePriceCents("R$1.299")).toEqual({ cents: 129900 });
    expect(parsePriceCents("R$ 89")).toEqual({ cents: 8900 });
    expect(parsePriceCents("R$ 89,9")).toEqual({ cents: 8990 });
    expect(parsePriceCents("US$ 1,299.00")).toEqual({ cents: 129900 });
  });

  it("devolve null quando não há preço, nunca zero", () => {
    // Zero é preço válido; usar 0 para "não sei" faria o painel anunciar grátis.
    expect(parsePriceCents("")).toBeNull();
    expect(parsePriceCents("12 vendidos")).toBeNull();
    expect(parsePriceCents(undefined)).toBeNull();
    expect(parsePriceCents("R$ 0,00")).toEqual({ cents: 0 });
  });

  it("abre a faixa em mínimo e máximo", () => {
    expect(parsePriceCents("R$ 29,90 - R$ 49,90")).toEqual({ cents: 2990, maxCents: 4990 });
    expect(parsePriceCents("R$ 29,90~R$ 49,90")).toEqual({ cents: 2990, maxCents: 4990 });
  });

  it("trata preço riscado como preço único, não como faixa", () => {
    // "De X por Y" é promoção: vale o Y. Anunciar "de X a Y" seria mentira.
    expect(parsePriceCents("De R$ 99,90 por R$ 49,90")).toEqual({ cents: 4990 });
  });

  it("ignora número comprido demais para ser preço", () => {
    // Id de produto que escapou do PRICE_RX não pode virar R$ 17 milhões.
    expect(parsePriceCents("R$ 1729384756012")).toBeNull();
  });

  it("lê a moeda do símbolo, sem chutar quando não há preço", () => {
    expect(currencyFromPrice("R$ 89,90")).toBe("BRL");
    expect(currencyFromPrice("US$ 19.90")).toBe("USD");
    expect(currencyFromPrice("€ 19,90")).toBe("EUR");
    expect(currencyFromPrice("12 vendidos")).toBeUndefined();
  });
});

describe("URL de foto do produto", () => {
  it("aceita http(s) e recusa o que não sobrevive à viagem", () => {
    expect(isUsableImageUrl("https://p16-oec.tiktokcdn.com/img/abc~tplv-300.jpeg")).toBe(true);
    // blob: morre fora da aba do TikTok; data: estoura o doc de 1 MiB no Firestore.
    expect(isUsableImageUrl("blob:https://tiktok.com/9a8b")).toBe(false);
    expect(isUsableImageUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isUsableImageUrl("//cdn.tiktok.com/foto.jpg")).toBe(false);
    expect(isUsableImageUrl("")).toBe(false);
    expect(isUsableImageUrl(`https://cdn.tiktok.com/${"a".repeat(2100)}.jpg`)).toBe(false);
  });

  it("escolhe a maior resolução do srcset", () => {
    expect(pickBestSrcsetUrl("https://cdn/p_100.jpg 100w, https://cdn/p_800.jpg 800w")).toBe(
      "https://cdn/p_800.jpg",
    );
    expect(pickBestSrcsetUrl("https://cdn/p.jpg 1x, https://cdn/p@2x.jpg 2x")).toBe(
      "https://cdn/p@2x.jpg",
    );
  });

  it("não quebra em URL com vírgula", () => {
    // A CDN do TikTok usa vírgula em parâmetro de recorte.
    expect(pickBestSrcsetUrl("https://cdn/p~c5_100,200.jpg 100w")).toBe(
      "https://cdn/p~c5_100,200.jpg",
    );
    expect(pickBestSrcsetUrl("")).toBe("");
  });
});

describe("produtos sincronizados da vitrine", () => {
  it("entram na lista principal sem duplicar e ativam o primeiro produto", () => {
    const result = mergeVitrineProducts(
      [],
      [
        { name: "  Kit Verão  ", price: " R$ 49,90 " },
        { name: "kit verão", price: "R$ 59,90" },
        { name: "Bolsa", description: "Leve" },
      ],
    );

    expect(result.addedCount).toBe(2);
    expect(result.produtos).toHaveLength(2);
    expect(result.produtos[0]).toMatchObject({
      name: "Kit Verão",
      price: "R$ 49,90",
      active: true,
    });
    expect(result.produtos[1]).toMatchObject({ name: "Bolsa", active: false });
  });

  it("não duplica uma vitrine já importada", () => {
    const current = [
      {
        id: "produto-1",
        name: "Kit Verão",
        price: "R$ 49,90",
        description: "",
        active: true,
      },
    ];

    const result = mergeVitrineProducts(current, [{ name: " kit verão " }]);

    expect(result.addedCount).toBe(0);
    expect(result.produtos).toBe(current);
  });

  it("completa produto já importado com a foto e o preço que a vitrine passou a mandar", () => {
    // Sem isso, quem importou antes dos campos existirem ficaria sem foto para
    // sempre: o produto já está na lista e a importação o trata como duplicata.
    const current = [
      { id: "produto-1", name: "Kit Verão", price: "R$ 49,90", description: "", active: true },
    ];

    const result = mergeVitrineProducts(current, [
      {
        name: "kit verão",
        price: "R$ 49,90",
        priceCents: 4990,
        currency: "BRL",
        imageUrl: "https://cdn.tiktok.com/kit.jpg",
      },
    ]);

    expect(result.addedCount).toBe(0);
    expect(result.produtos).toHaveLength(1);
    expect(result.produtos[0]).toMatchObject({
      id: "produto-1",
      priceCents: 4990,
      currency: "BRL",
      imageUrl: "https://cdn.tiktok.com/kit.jpg",
    });
  });

  it("acha pelo id o produto que o usuário renomeou", () => {
    // Quem editou o nome à mão não bate mais por nome — e é justamente quem mais
    // mexeu no catálogo que ficaria sem foto para sempre.
    const current = [
      { id: "prod-1", name: "Meu kit da promo", price: "R$ 49,90", description: "", active: true },
    ];

    const result = mergeVitrineProducts(current, [
      { id: "prod-1", name: "Kit Verão", priceCents: 4990, imageUrl: "https://cdn/kit.jpg" },
    ]);

    // Nem cria uma segunda cópia do mesmo produto, nem desfaz o nome escolhido.
    expect(result.addedCount).toBe(0);
    expect(result.produtos).toHaveLength(1);
    expect(result.produtos[0]).toMatchObject({
      name: "Meu kit da promo",
      priceCents: 4990,
      imageUrl: "https://cdn/kit.jpg",
    });
  });

  it("herda o id da vitrine, que é o que faz o vínculo sobreviver a um rename", () => {
    const importado = mergeVitrineProducts([], [{ id: "prod-1", name: "Kit Verão" }]).produtos;
    expect(importado[0].id).toBe("prod-1");

    // Renomeado à mão, o produto continua sendo reencontrado na sincronização.
    const renomeado = [{ ...importado[0], name: "Meu kit" }];
    const depois = mergeVitrineProducts(renomeado, [
      { id: "prod-1", name: "Kit Verão", imageUrl: "https://cdn/kit.jpg" },
    ]);

    expect(depois.addedCount).toBe(0);
    expect(depois.produtos[0]).toMatchObject({
      name: "Meu kit",
      imageUrl: "https://cdn/kit.jpg",
    });
  });

  it("sorteia id próprio quando a vitrine não manda um", () => {
    const [produto] = mergeVitrineProducts([], [{ name: "Bolsa" }]).produtos;
    expect(produto.id).toBeTruthy();
  });

  it("não funde produtos diferentes que estão os dois sem id", () => {
    const current = [
      { id: "", name: "Bolsa", price: "", description: "", active: true },
      { id: "", name: "Boné", price: "", description: "", active: false },
    ];

    const result = mergeVitrineProducts(current, [
      { id: "", name: "Bolsa", imageUrl: "https://cdn/bolsa.jpg" },
      { id: "", name: "Boné", imageUrl: "https://cdn/bone.jpg" },
    ]);

    expect(result.produtos[0].imageUrl).toBe("https://cdn/bolsa.jpg");
    expect(result.produtos[1].imageUrl).toBe("https://cdn/bone.jpg");
  });

  it("não sobrescreve foto nem preço que o produto já tinha", () => {
    const current = [
      {
        id: "produto-1",
        name: "Kit Verão",
        price: "R$ 39,90",
        description: "Editado pelo usuário",
        active: true,
        priceCents: 3990,
        imageUrl: "https://cdn.exemplo.com/minha-foto.jpg",
      },
    ];

    const result = mergeVitrineProducts(current, [
      { name: "Kit Verão", price: "R$ 49,90", priceCents: 4990, imageUrl: "https://cdn/outra.jpg" },
    ]);

    expect(result.produtos[0]).toMatchObject({
      price: "R$ 39,90",
      priceCents: 3990,
      description: "Editado pelo usuário",
      imageUrl: "https://cdn.exemplo.com/minha-foto.jpg",
    });
  });

  it("carrega foto e preço para os produtos novos", () => {
    const result = mergeVitrineProducts(
      [],
      [
        {
          name: "Fone TWS",
          price: "R$ 29,90 - R$ 49,90",
          priceCents: 2990,
          priceMaxCents: 4990,
          currency: "BRL",
          imageUrl: "https://cdn.tiktok.com/fone.jpg",
        },
      ],
    );

    expect(result.produtos[0]).toMatchObject({
      name: "Fone TWS",
      price: "R$ 29,90 - R$ 49,90",
      priceCents: 2990,
      priceMaxCents: 4990,
      currency: "BRL",
      imageUrl: "https://cdn.tiktok.com/fone.jpg",
      active: true,
    });
  });

  it("não inventa chave para campo que a vitrine não mandou", () => {
    // `undefined` explícito é rejeitado pelo setDoc do Firestore no push.
    const [produto] = mergeVitrineProducts([], [{ name: "Bolsa" }]).produtos;

    expect(Object.keys(produto)).not.toContain("imageUrl");
    expect(Object.keys(produto)).not.toContain("priceCents");
  });

  it("recupera uma configuração antiga que ficou sem produto ativo", () => {
    const result = mergeVitrineProducts(
      [
        {
          id: "produto-1",
          name: "Bolsa",
          price: "",
          description: "",
          active: false,
        },
      ],
      [],
    );

    expect(result.produtos[0].active).toBe(true);
  });
});

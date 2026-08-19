/**
 * Lê nome, preço e foto na própria página do produto do TikTok Shop.
 *
 * É o único lugar onde esses dados existem para nós: o TikTok responde à
 * raspagem de servidor com a tela "Security Check" — medido em 2026-08-18 em
 * `shop.tiktok.com`, `www.tiktok.com/shop/pdp` e `shop-id.tokopedia.com`, e
 * fingir cabeçalho de navegador não muda nada, porque a liberação depende de
 * um token assinado por JS. Dentro do navegador do admin, já logado, a mesma
 * página é só DOM. Este arquivo é injetado pelo background na aba do produto.
 *
 * A última expressão do arquivo é o que `chrome.scripting.executeScript`
 * devolve — por isso a função fica em `globalThis` (dá para reinjetar a cada
 * tentativa) e a chamada vem depois dela.
 */
globalThis.__pitchaiLerProduto = function () {
  const limpar = (valor) =>
    String(valor ?? "")
      .replace(/\s+/g, " ")
      .trim();

  /** Hosts de imagem do TikTok — o resto da página é ícone, banner e avatar. */
  const CDN_RE = /tiktokcdn|byteimg|ibyteimg|ttwstatic/i;

  const meta = (chave) => {
    const el = document.querySelector(`meta[property="${chave}"], meta[name="${chave}"]`);
    return limpar(el && el.content);
  };

  /**
   * A barreira antirraspagem também aparece dentro do navegador quando a conta
   * está deslogada ou o IP está queimado. Sem essa checagem o painel receberia
   * "não achei nada" e o admin ficaria procurando erro no lugar errado.
   */
  const verificacao =
    /security check|verify to continue|slide to verify/i.test(document.title || "") ||
    Boolean(
      document.querySelector(
        "#captcha_container, .captcha_verify_container, [id*='captcha' i][class*='verify' i]",
      ),
    );

  // Dados estruturados: quando existem, são o caminho mais confiável — vêm do
  // próprio backend do TikTok e não dependem de classe de CSS que muda toda semana.
  let ld = null;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const bruto = JSON.parse(script.textContent || "null");
      const lista = Array.isArray(bruto) ? bruto : [bruto, ...(bruto?.["@graph"] ?? [])];
      const achado = lista.find((item) => /product/i.test(String(item?.["@type"] ?? "")));
      if (achado) {
        ld = achado;
        break;
      }
    } catch {
      /* JSON-LD quebrado não invalida o resto da leitura */
    }
  }

  const ofertaLd = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;

  const codigo =
    (location.href.match(/\/(?:view\/)?(?:product|pdp)\/(\d{6,25})/i) ||
      location.href.match(/[?&](?:product_id|productId|pid)=(\d{6,25})/i) ||
      [])[1] || "";

  const nome =
    limpar(ld?.name) ||
    meta("og:title") ||
    limpar(document.querySelector("h1")?.textContent) ||
    limpar(document.title).replace(/\s*[|-]\s*TikTok.*$/i, "");

  let imagem = "";
  const imagemLd = Array.isArray(ld?.image) ? ld.image[0] : ld?.image;
  if (typeof imagemLd === "string") imagem = imagemLd;
  if (!imagem) imagem = meta("og:image");
  if (!imagem) {
    // Plano C: a maior foto de CDN da página. A do produto é sempre a maior —
    // avatar do vendedor e miniatura de recomendação ficam abaixo de 200px.
    const fotos = Array.from(document.images)
      .filter((img) => img.naturalWidth >= 200 && CDN_RE.test(img.currentSrc || img.src || ""))
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight);
    imagem = fotos[0]?.currentSrc || fotos[0]?.src || "";
  }

  let preco =
    limpar(ofertaLd?.price) ||
    limpar(ofertaLd?.lowPrice) ||
    meta("product:price:amount") ||
    meta("og:price:amount");
  if (!preco) {
    // O primeiro preço do corpo é o de venda; os riscados e as faixas
    // ("R$ 10,00 - R$ 20,00") vêm depois dele no fluxo do documento.
    const achado = (document.body?.innerText || "").match(
      /(?:R\$|RS)\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/,
    );
    preco = achado ? limpar(achado[0]) : "";
  }

  return {
    verificacao,
    // Nome e foto juntos é o sinal de que a página terminou de montar. Sem
    // isso o background pararia na primeira leitura, com a casca do SPA vazia.
    pronto: Boolean(nome && imagem),
    codigo,
    link: location.href,
    nome: nome.slice(0, 200),
    preco,
    imagem_url: imagem,
  };
};

globalThis.__pitchaiLerProduto();

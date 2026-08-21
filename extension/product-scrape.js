/**
 * Lê nome, preço e foto na própria página do produto do TikTok Shop.
 *
 * O TikTok responde à raspagem de servidor com a tela "Security Check". Dentro
 * do navegador do administrador, já autenticado, a mesma página é um DOM
 * normal. Este arquivo é injetado pelo service worker em uma aba temporária.
 *
 * A última expressão é devolvida por `chrome.scripting.executeScript`. A função
 * fica em `globalThis` para permitir novas leituras enquanto o SPA monta.
 */
globalThis.__pitchaiLerProduto = function () {
  const limpar = (valor) =>
    String(valor ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const CDN_RE = /tiktokcdn|byteimg|ibyteimg|ttwstatic/i;

  const meta = (chave) => {
    const el = document.querySelector(`meta[property="${chave}"], meta[name="${chave}"]`);
    return limpar(el && el.content);
  };

  const verificacao =
    /security check|verify to continue|slide to verify/i.test(document.title || "") ||
    Boolean(
      document.querySelector(
        "#captcha_container, .captcha_verify_container, [id*='captcha' i][class*='verify' i]",
      ),
    );

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
      // JSON-LD inválido não impede as tentativas por meta tags e DOM.
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
    const achado = (document.body?.innerText || "").match(
      /(?:R\$|RS)\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/,
    );
    preco = achado ? limpar(achado[0]) : "";
  }

  return {
    verificacao,
    pronto: Boolean(nome && imagem),
    codigo,
    link: location.href,
    nome: nome.slice(0, 200),
    preco,
    imagem_url: imagem,
  };
};

globalThis.__pitchaiLerProduto();

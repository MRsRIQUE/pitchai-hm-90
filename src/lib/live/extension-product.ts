import type { TikTokProductLookup } from "@/lib/live/admin";
import { parseLocaleNumber } from "@/lib/live/number-parsing";

/**
 * Busca os dados do produto pela extensão, não pelo servidor.
 *
 * O TikTok responde à raspagem de servidor com a tela "Security Check" — não é
 * questão de cabeçalho, a liberação depende de um token que só o navegador
 * assina. Quem enxerga a página é o Chrome do admin, já logado: o painel pede
 * aqui, `product-bridge.js` repassa ao service worker da extensão, ele abre o
 * produto numa aba em segundo plano, lê o DOM e devolve.
 */

const PEDIDO = "PITCHAI_SCRAPE_PRODUCT";
const RESULTADO = "PITCHAI_SCRAPE_PRODUCT_RESULT";

/** Folga sobre o pior caso do service worker (25s de carga + 12 leituras). */
const ESPERA_MS = 60_000;

export type ScrapeProduto =
  { ok: true; produto: TikTokProductLookup } | { ok: false; motivo: string; mensagem: string };

/**
 * Versões anteriores à 0.19 não sabem raspar. O painel checa a capacidade — e
 * não só a presença da extensão — para poder pedir a atualização em vez de
 * esperar por uma resposta que nunca chega.
 */
export function extensaoRaspaProduto(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.documentElement.getAttribute("data-pitchai-scrape"));
}

function novoId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `pitchai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function raspaProdutoNaExtensao(
  entrada: string,
  timeoutMs = ESPERA_MS,
): Promise<ScrapeProduto> {
  if (typeof window === "undefined")
    return Promise.resolve({
      ok: false,
      motivo: "browser_unavailable",
      mensagem: "A busca pela extensão só roda no navegador.",
    });

  const texto = entrada.trim();
  const id = novoId();

  return new Promise((resolve) => {
    let encerrado = false;
    const encerrar = (resultado: ScrapeProduto) => {
      if (encerrado) return;
      encerrado = true;
      window.clearTimeout(prazo);
      window.removeEventListener("message", aoReceber);
      resolve(resultado);
    };

    const aoReceber = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.type !== RESULTADO || event.data?.requestId !== id) return;

      if (!event.data.ok) {
        encerrar({
          ok: false,
          motivo: String(event.data.motivo || "erro"),
          mensagem: String(event.data.mensagem || "A extensão não conseguiu ler o produto."),
        });
        return;
      }

      const bruto = (event.data.produto ?? {}) as Record<string, unknown>;
      const precoTexto = String(bruto.preco ?? "");
      const parcial = Boolean(bruto.parcial);
      const nome = String(bruto.nome ?? "") || null;
      const imagem = String(bruto.imagem_url ?? "") || null;

      encerrar({
        ok: true,
        produto: {
          tiktok_product_id: String(bruto.codigo ?? "") || null,
          // O link é o da entrada quando o admin colou um link: é ele que
          // carrega o rastreio da comissão. A URL final da aba só serve quando
          // a busca partiu de um código solto.
          link: /^https?:\/\//i.test(texto) ? texto : String(bruto.link ?? "") || null,
          nome,
          preco: precoTexto ? parseLocaleNumber(precoTexto) || null : null,
          imagem_url: imagem,
          aviso: parcial
            ? "A página abriu, mas veio incompleta: confira nome, preço e foto antes de salvar."
            : null,
        },
      });
    };

    const prazo = window.setTimeout(
      () =>
        encerrar({
          ok: false,
          motivo: "timeout",
          mensagem:
            "A extensão não respondeu a tempo. Veja se a aba do produto abriu e tente de novo.",
        }),
      timeoutMs,
    );

    window.addEventListener("message", aoReceber);
    window.postMessage({ type: PEDIDO, entrada: texto, requestId: id }, window.location.origin);
  });
}

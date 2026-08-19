/**
 * Service worker: é ele quem raspa a página do produto a pedido do painel.
 *
 * Por que aqui e não no servidor: o TikTok devolve "Security Check" para
 * qualquer requisição de servidor. Quem consegue ver a página é o navegador do
 * admin, já logado — então o painel pede, este arquivo abre a página numa aba
 * em segundo plano, injeta `product-scrape.js`, colhe o resultado e fecha a
 * aba. O admin vê a aba piscar; é o preço de não depender de captcha.
 */

const PEDIDO = "PITCHAI_SCRAPE_PRODUCT";

/** Só o painel oficial (e o dev local) pode mandar abrir aba e raspar. */
const ORIGENS_PERMITIDAS = [
  /^https:\/\/pitchai-hm\.vercel\.app$/i,
  /^https:\/\/pitchai-moon-e5ad\.vercel\.app$/i,
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
];

const CARREGAMENTO_MS = 25_000;
const TENTATIVAS = 12;
const INTERVALO_MS = 1_200;

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function origemDoRemetente(sender) {
  if (sender?.origin) return sender.origin;
  try {
    return new URL(sender?.url ?? "").origin;
  } catch {
    return "";
  }
}

function extrairCodigo(entrada) {
  const texto = String(entrada ?? "").trim();
  if (/^\d{6,25}$/.test(texto)) return texto;
  return (
    texto.match(/\/(?:view\/)?(?:product|pdp)\/(\d{6,25})/i)?.[1] ??
    texto.match(/[?&](?:product_id|productId|pid)=(\d{6,25})/i)?.[1] ??
    ""
  );
}

/**
 * Link de afiliado curto entra inteiro: é o redirecionamento dele que leva à
 * página certa. Código solto vira a URL canônica do produto.
 */
function urlAlvo(entrada) {
  const texto = String(entrada ?? "").trim();
  if (/^https?:\/\//i.test(texto)) {
    let url;
    try {
      url = new URL(texto);
    } catch {
      return "";
    }
    return /(?:^|\.)tiktok\.com$/i.test(url.hostname) ? url.toString() : "";
  }
  const codigo = extrairCodigo(texto);
  return codigo ? `https://shop.tiktok.com/view/product/${codigo}` : "";
}

function esperarCarregar(tabId) {
  return new Promise((resolve) => {
    let encerrado = false;
    const encerrar = () => {
      if (encerrado) return;
      encerrado = true;
      chrome.tabs.onUpdated.removeListener(aoAtualizar);
      clearTimeout(prazo);
      resolve();
    };
    const aoAtualizar = (id, info) => {
      if (id === tabId && info.status === "complete") encerrar();
    };
    // Estourar o prazo não é erro: página meio montada às vezes já tem os
    // dados, e a leitura seguinte tem tentativas próprias.
    const prazo = setTimeout(encerrar, CARREGAMENTO_MS);
    chrome.tabs.onUpdated.addListener(aoAtualizar);
    chrome.tabs.get(tabId).then((aba) => {
      if (aba?.status === "complete") encerrar();
    }, encerrar);
  });
}

async function lerAba(tabId) {
  const saida = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["product-scrape.js"],
  });
  return saida?.[0]?.result ?? null;
}

async function fecharAba(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* aba já fechada pelo usuário */
  }
}

async function raspar(entrada) {
  const alvo = urlAlvo(entrada);
  if (!alvo)
    return {
      ok: false,
      motivo: "entrada_invalida",
      mensagem:
        "Isso não parece um código do TikTok (só dígitos) nem um link do TikTok. Cole o link de afiliado inteiro.",
    };

  let aba;
  try {
    aba = await chrome.tabs.create({ url: alvo, active: false });
  } catch {
    return {
      ok: false,
      motivo: "aba",
      mensagem: "O navegador não deixou abrir a aba do produto. Tente de novo.",
    };
  }

  const tabId = aba.id;
  let ultima = null;
  let manterAba = false;
  try {
    await esperarCarregar(tabId);

    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
      let leitura = null;
      try {
        leitura = await lerAba(tabId);
      } catch {
        // A injeção falha enquanto a aba navega entre redirecionamentos; a
        // volta seguinte pega a página final.
        leitura = null;
      }

      if (leitura?.verificacao) {
        // A aba fica aberta e vem para a frente de propósito: o admin resolve a
        // verificação com as próprias mãos e manda buscar de novo. Fechar aqui
        // esconderia justamente a tela que precisa ser resolvida.
        manterAba = true;
        await chrome.tabs.update(tabId, { active: true }).catch(() => {});
        return {
          ok: false,
          motivo: "verificacao",
          mensagem:
            "O TikTok pediu verificação. Abri a aba do produto para você resolver — depois clique em Buscar dados de novo.",
        };
      }

      if (leitura) ultima = leitura;
      if (leitura?.pronto) break;
      await dormir(INTERVALO_MS);
    }
  } finally {
    if (!manterAba) await fecharAba(tabId);
  }

  if (!ultima?.nome && !ultima?.imagem_url)
    return {
      ok: false,
      motivo: "sem_dados",
      mensagem:
        "A página abriu, mas não trouxe nome nem foto. Confira se o link é de produto (e não de vídeo ou de loja).",
    };

  return {
    ok: true,
    produto: {
      codigo: ultima.codigo || extrairCodigo(entrada),
      link: ultima.link || alvo,
      nome: ultima.nome || "",
      preco: ultima.preco || "",
      imagem_url: ultima.imagem_url || "",
      // Página que responde sem foto ou sem preço existe; o painel avisa em vez
      // de fingir que veio tudo.
      parcial: !ultima.pronto,
    },
  };
}

// Uma aba por vez: duas buscas em paralelo abririam duas abas e disputariam o
// foco na tela do admin.
let fila = Promise.resolve();

chrome.runtime.onMessage.addListener((mensagem, sender, sendResponse) => {
  if (mensagem?.type !== PEDIDO) return undefined;

  const origem = origemDoRemetente(sender);
  if (!ORIGENS_PERMITIDAS.some((padrao) => padrao.test(origem))) {
    sendResponse({ ok: false, motivo: "origem", mensagem: "Origem não autorizada." });
    return undefined;
  }

  fila = fila
    .then(() => raspar(String(mensagem.entrada ?? "").slice(0, 2048)))
    .then((resultado) => {
      sendResponse(resultado);
      return null;
    })
    .catch(() => {
      sendResponse({
        ok: false,
        motivo: "erro",
        mensagem: "Não deu para ler a página do produto agora. Tente de novo.",
      });
      return null;
    });

  return true; // a resposta vem depois: mantém o canal aberto
});

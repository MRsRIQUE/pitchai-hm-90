/**
 * Service worker da captura individual de produtos do TikTok.
 *
 * A pedido do painel mestre, abre o produto em uma aba inativa, injeta o
 * scraper, aguarda o SPA montar e fecha a aba após obter o resultado.
 */

const PEDIDO = "PITCHAI_SCRAPE_PRODUCT";
const PEDIDO_INSTALL_ID = "PITCHAI_GET_INSTALL_ID";
const INSTALL_ID_KEY = "pitchai_install_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * O service worker é o único criador da identidade da instalação. Assim o
 * painel, o site e o TikTok recebem o mesmo UUID mesmo quando abrem ao mesmo
 * tempo numa instalação nova.
 */
let installIdEmCurso = null;
async function garantirInstallId() {
  if (installIdEmCurso) return installIdEmCurso;
  installIdEmCurso = (async () => {
    const salvo = (await chrome.storage.local.get(INSTALL_ID_KEY))?.[INSTALL_ID_KEY];
    if (typeof salvo === "string" && UUID_RE.test(salvo)) return salvo.toLowerCase();

    const novo = crypto.randomUUID().toLowerCase();
    await chrome.storage.local.set({ [INSTALL_ID_KEY]: novo });
    return novo;
  })();
  try {
    return await installIdEmCurso;
  } catch (error) {
    installIdEmCurso = null;
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  garantirInstallId().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  garantirInstallId().catch(() => {});
});

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

function urlAlvo(entrada) {
  const texto = String(entrada ?? "").trim();
  if (/^https:\/\//i.test(texto)) {
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
    // A aba pode ter sido fechada manualmente.
  }
}

async function raspar(entrada) {
  const alvo = urlAlvo(entrada);
  if (!alvo)
    return {
      ok: false,
      motivo: "entrada_invalida",
      mensagem:
        "Isso não parece um código do TikTok nem um link HTTPS do TikTok. Cole o link de afiliado inteiro.",
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
  if (typeof tabId !== "number") {
    return { ok: false, motivo: "aba", mensagem: "A aba do produto não pôde ser identificada." };
  }

  let ultima = null;
  let manterAba = false;
  try {
    await esperarCarregar(tabId);

    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
      let leitura = null;
      try {
        leitura = await lerAba(tabId);
      } catch {
        leitura = null;
      }

      if (leitura?.verificacao) {
        manterAba = true;
        await chrome.tabs.update(tabId, { active: true }).catch(() => {});
        return {
          ok: false,
          motivo: "verificacao",
          mensagem:
            "O TikTok pediu verificação. Resolva-a na aba aberta e clique em Buscar dados novamente.",
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
      mensagem: "A página abriu, mas não trouxe nome nem foto. Confira se o link é de produto.",
    };

  return {
    ok: true,
    produto: {
      codigo: ultima.codigo || extrairCodigo(entrada),
      link: ultima.link || alvo,
      nome: ultima.nome || "",
      preco: ultima.preco || "",
      imagem_url: ultima.imagem_url || "",
      parcial: !ultima.pronto,
    },
  };
}

let fila = Promise.resolve();

chrome.runtime.onMessage.addListener((mensagem, sender, sendResponse) => {
  if (mensagem?.type === PEDIDO_INSTALL_ID) {
    garantirInstallId()
      .then((installId) => sendResponse({ ok: true, installId }))
      .catch(() => sendResponse({ ok: false, installId: "" }));
    return true;
  }

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

  return true;
});

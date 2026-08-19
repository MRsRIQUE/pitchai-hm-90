import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Download, ImagePlus, Search, Trash2 } from "lucide-react";
import {
  extractTikTokProductId,
  importImagemDoTikTok,
  insertRankedProducts,
  lookupTikTokProductByCode,
  parseLocaleNumber,
  MAX_IMAGEM_CHARS,
  type RankedProduct,
  type TikTokProductLookup,
} from "@/lib/live/admin";
import { extensaoRaspaProduto, raspaProdutoNaExtensao } from "@/lib/live/extension-product";
import { copyToClipboard } from "@/lib/clipboard";
import { AdminCard } from "./admin-ui";
import { brl, readableAdminError } from "./format";

/**
 * A foto é guardada dentro do documento do produto, não como link para o CDN
 * do TikTok: parte das URLs de lá vem assinada com validade e some depois de
 * algumas horas, e a `/quentes` é pública — foto quebrada ali é vitrine
 * quebrada na frente do cliente. 400px cobre o card da vitrine em tela retina
 * e sai com dezenas de KB, não centenas.
 */
const LADO_MAX = 400;
const QUALIDADE_WEBP = 0.72;

/**
 * Snippet que o admin roda na própria aba do TikTok, já logada.
 *
 * É esse o caminho que "puxa a foto direto do TikTok": a página do produto é
 * blindada para o nosso servidor (responde com a tela de verificação), mas
 * dentro do navegador do admin ela é só DOM. O snippet lê nome, preço e o
 * endereço da foto e copia tudo como JSON — depois o nosso servidor baixa a
 * imagem por esse endereço, o que o CDN permite.
 */
const SNIPPET_COPIA_DADOS = `(function(){
  var meta=function(p){var e=document.querySelector('meta[property="'+p+'"],meta[name="'+p+'"]');return e&&e.content?e.content:''};
  var id=(location.href.match(/\\/(?:view\\/)?product\\/(\\d{6,25})/)||location.href.match(/[?&]product_id=(\\d{6,25})/)||[])[1]||'';
  var nome=meta('og:title')||(document.querySelector('h1')||{}).textContent||document.title;
  var img=meta('og:image');
  if(!img){
    var fotos=[].slice.call(document.images).filter(function(x){
      return x.naturalWidth>=200&&/tiktokcdn|ibyteimg|byteimg/.test(x.currentSrc||x.src||'');
    }).sort(function(a,b){return b.naturalWidth-a.naturalWidth});
    if(fotos[0])img=fotos[0].currentSrc||fotos[0].src;
  }
  var preco=meta('product:price:amount')||meta('og:price:amount')||'';
  if(!preco){var m=(document.body.innerText||'').match(/R\\$\\s*[\\d.]{1,12},\\d{2}/);if(m)preco=m[0];}
  var dados=JSON.stringify({codigo:id,link:location.href,nome:(nome||'').trim().slice(0,200),preco:preco,imagem_url:img||''});
  var aviso=function(texto,mostrarJson){
    var cx=document.createElement('div');
    cx.style.cssText='position:fixed;z-index:2147483647;left:16px;bottom:16px;max-width:420px;padding:14px 16px;border-radius:12px;background:#111;color:#fff;font:14px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.35)';
    cx.textContent=texto;
    if(mostrarJson){
      var ta=document.createElement('textarea');
      ta.value=dados;
      ta.style.cssText='width:100%;height:90px;margin-top:8px;font:12px monospace';
      cx.appendChild(ta);
      document.body.appendChild(cx);
      ta.select();
    } else {
      document.body.appendChild(cx);
      setTimeout(function(){cx.remove()},4000);
    }
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(dados).then(function(){
      aviso('Dados do produto copiados. Cole no painel do Pitch AI.',false);
    },function(){aviso('Copie o texto abaixo e cole no painel do Pitch AI:',true)});
  } else {
    aviso('Copie o texto abaixo e cole no painel do Pitch AI:',true);
  }
})()`;

type Formulario = {
  codigo: string;
  link: string;
  nome: string;
  categoria: string;
  preco: string;
  comissao_pct: string;
  vendas: string;
  destaque: boolean;
};

const VAZIO: Formulario = {
  codigo: "",
  link: "",
  nome: "",
  categoria: "",
  preco: "",
  comissao_pct: "",
  vendas: "",
  destaque: false,
};

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não deu para ler essa imagem."));
    img.src = src;
  });
}

/**
 * Reduz para no máximo `LADO_MAX` e devolve WebP embutido.
 *
 * Só aceita origem que o canvas possa ler: arquivo local ou data URL. Foto que
 * ainda está no CDN do TikTok precisa passar antes pelo servidor — o CDN não
 * manda cabeçalho de CORS e o canvas fica marcado, impedindo a leitura.
 */
async function normalizarImagem(fonte: Blob | string): Promise<string> {
  const url = typeof fonte === "string" ? fonte : URL.createObjectURL(fonte);
  try {
    const img = await carregarImagem(url);
    const maiorLado = Math.max(img.naturalWidth, img.naturalHeight) || LADO_MAX;
    const escala = Math.min(1, LADO_MAX / maiorLado);
    const largura = Math.max(1, Math.round(img.naturalWidth * escala));
    const altura = Math.max(1, Math.round(img.naturalHeight * escala));

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("O navegador não conseguiu preparar a foto.");
    ctx.drawImage(img, 0, 0, largura, altura);
    return canvas.toDataURL("image/webp", QUALIDADE_WEBP);
  } finally {
    if (typeof fonte !== "string") URL.revokeObjectURL(url);
  }
}

/** Só para o admin ver o peso do que vai gravar. */
function pesoLegivel(dataUrl: string): string {
  const kb = Math.round((dataUrl.length * 3) / 4 / 1024);
  return `${kb.toLocaleString("pt-BR")} KB`;
}

export function ProdutoTikTokCard({
  existentes,
  onDone,
}: {
  existentes: RankedProduct[];
  onDone: () => void;
}) {
  const [entrada, setEntrada] = useState("");
  const [colagemSnippet, setColagemSnippet] = useState("");
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [foto, setFoto] = useState("");
  const [urlFoto, setUrlFoto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [snippetCopiado, setSnippetCopiado] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const duplicado =
    Boolean(form.codigo) && existentes.some((p) => p.tiktok_product_id === form.codigo);

  // A extensão anuncia a capacidade de raspar numa marca no `<html>`, e ela
  // pode chegar depois — instalada com o painel já aberto, ou content script
  // que subiu atrasado. O vigia morre assim que a marca aparece.
  const [podeRaspar, setPodeRaspar] = useState(false);
  useEffect(() => {
    if (podeRaspar) return;
    const verificar = () => setPodeRaspar(extensaoRaspaProduto());
    verificar();
    const timer = window.setInterval(verificar, 1500);
    return () => window.clearInterval(timer);
  }, [podeRaspar]);

  const aplicarImagem = useCallback(async (fonte: Blob | string) => {
    setErro(null);
    try {
      const reduzida = await normalizarImagem(fonte);
      if (reduzida.length > MAX_IMAGEM_CHARS)
        throw new Error("A foto continuou grande demais depois de reduzida. Tente outra imagem.");
      setFoto(reduzida);
    } catch (e) {
      setErro(readableAdminError(e));
    }
  }, []);

  // Colar imagem (Ctrl+V) em qualquer lugar da página do painel. Fica no
  // documento, e não num campo, porque colar exige foco e a foto vem do
  // navegador inteiro — exigir clicar antes é a parte que as pessoas erram.
  useEffect(() => {
    const aoColar = (evento: ClipboardEvent) => {
      const arquivo = Array.from(evento.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (!arquivo) return;
      evento.preventDefault();
      void aplicarImagem(arquivo);
    };
    document.addEventListener("paste", aoColar);
    return () => document.removeEventListener("paste", aoColar);
  }, [aplicarImagem]);

  /**
   * Ordem de tentativa: extensão primeiro, servidor depois.
   *
   * Só a extensão vê a página do produto — para o servidor o TikTok devolve a
   * tela de verificação. O servidor continua no caminho porque, mesmo
   * bloqueado, ele resolve o redirecionamento do link curto e tira dele o
   * código do produto, que é o mínimo que o formulário precisa.
   */
  async function buscarDados(): Promise<TikTokProductLookup> {
    if (!extensaoRaspaProduto()) {
      const doServidor = await lookupTikTokProductByCode(entrada);
      return {
        ...doServidor,
        aviso: doServidor.aviso
          ? `${doServidor.aviso} Com a extensão do Pitch AI (0.19 ou mais nova) instalada, a busca puxa tudo sozinha.`
          : null,
      };
    }

    const resultado = await raspaProdutoNaExtensao(entrada);
    if (resultado.ok) return resultado.produto;

    // Verificação pendente é assunto do navegador do admin: a aba já está
    // aberta esperando por ele, e insistir no servidor só traria o bloqueio.
    if (resultado.motivo === "verificacao") throw new Error(resultado.mensagem);

    const doServidor = await lookupTikTokProductByCode(entrada);
    return { ...doServidor, aviso: resultado.mensagem };
  }

  const buscarM = useMutation({
    mutationFn: buscarDados,
    onMutate: () => {
      setErro(null);
      setAviso(null);
    },
    onSuccess: async (achado) => {
      setForm((atual) => ({
        ...atual,
        codigo: achado.tiktok_product_id ?? atual.codigo,
        // O link é gravado exatamente como veio: é ele que paga a comissão.
        link: achado.link ?? atual.link,
        nome: achado.nome ?? atual.nome,
        preco: achado.preco != null ? String(achado.preco) : atual.preco,
      }));
      setAviso(achado.aviso);
      if (achado.imagem_url) await baixarFotoPorUrl(achado.imagem_url);
    },
    onError: (e) => setErro(readableAdminError(e)),
  });

  const baixarFotoM = useMutation({
    mutationFn: (url: string) => importImagemDoTikTok(url),
    onSuccess: async (dataUrl) => {
      await aplicarImagem(dataUrl);
      setUrlFoto("");
    },
    onError: (e) => setErro(readableAdminError(e)),
  });

  async function baixarFotoPorUrl(url: string) {
    setErro(null);
    await baixarFotoM.mutateAsync(url).catch(() => undefined);
  }

  function aplicarSnippet(texto: string) {
    setErro(null);
    setAviso(null);
    const limpo = texto.trim();
    if (!limpo) return;
    let dados: Record<string, unknown>;
    try {
      dados = JSON.parse(limpo) as Record<string, unknown>;
    } catch {
      setErro("Isso não é o texto que o snippet copia. Rode o snippet e cole de novo.");
      return;
    }
    const codigo =
      String(dados.codigo ?? "") || extractTikTokProductId(String(dados.link ?? "")) || "";
    const precoTexto = String(dados.preco ?? "");
    setForm((atual) => ({
      ...atual,
      codigo: codigo || atual.codigo,
      link: String(dados.link ?? "") || atual.link,
      nome: String(dados.nome ?? "") || atual.nome,
      preco: precoTexto ? String(parseLocaleNumber(precoTexto)) : atual.preco,
    }));
    const imagem = String(dados.imagem_url ?? "");
    if (imagem) void baixarFotoPorUrl(imagem);
    setColagemSnippet("");
  }

  const salvarM = useMutation({
    mutationFn: async () => {
      const codigo = form.codigo.trim();
      const nome = form.nome.trim();
      const link = form.link.trim();
      if (!codigo) throw new Error("Falta o código do produto no TikTok.");
      if (!nome) throw new Error("Falta o nome do produto.");
      if (!link) throw new Error("Falta o link de afiliado — é ele que paga a comissão.");
      if (duplicado) throw new Error("Esse código já está no ranking.");

      const preco = parseLocaleNumber(form.preco);
      const vendas = parseLocaleNumber(form.vendas);
      await insertRankedProducts([
        {
          tiktok_product_id: codigo,
          nome,
          link,
          imagem_url: foto || null,
          categoria: form.categoria.trim() || null,
          preco,
          comissao_pct: parseLocaleNumber(form.comissao_pct),
          vendas,
          receita: preco * vendas,
          destaque: form.destaque,
        },
      ]);
    },
    onSuccess: () => {
      setForm(VAZIO);
      setFoto("");
      setEntrada("");
      setAviso(null);
      setErro(null);
      onDone();
    },
    onError: (e) => setErro(readableAdminError(e)),
  });

  const campo = (chave: keyof Formulario) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((atual) => ({ ...atual, [chave]: e.target.value }));

  const precoPrevisto = parseLocaleNumber(form.preco);

  return (
    <AdminCard
      title="Cadastrar produto pelo código do TikTok"
      hint="Um produto por vez. Com a extensão instalada, Buscar dados abre a página do produto numa aba em segundo plano e traz nome, preço e foto sozinho; o snippet continua como plano B."
    >
      {/* Passo 1 — código ou link */}
      <div className="app-field">
        <label>Código do produto no TikTok ou link de afiliado</label>
        <div className="flex flex-wrap gap-2">
          <input
            className="app-input flex-1"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder="1729387654321098765 ou https://vt.tiktok.com/ZS..."
          />
          <button
            type="button"
            className="app-btn"
            onClick={() => buscarM.mutate()}
            disabled={!entrada.trim() || buscarM.isPending}
          >
            <Search aria-hidden="true" />
            {buscarM.isPending ? (podeRaspar ? "Abrindo o produto…" : "Buscando…") : "Buscar dados"}
          </button>
        </div>
        <p className="app-field-hint">
          {podeRaspar
            ? "A extensão abre a página do produto numa aba em segundo plano, lê nome, preço e foto e fecha a aba. Se o TikTok pedir verificação, a aba fica aberta para você resolver."
            : "Sem a extensão (0.19 ou mais nova) só dá para tirar o código do link: nome, preço e foto o TikTok recusa entregar ao servidor. Use o snippet abaixo enquanto isso."}
        </p>
      </div>

      {/* Passo 2 — snippet, o caminho que traz a foto do TikTok */}
      <div className="app-field mt-4">
        <label>Snippet copia-dados (roda na aba do TikTok)</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn"
            onClick={async () => {
              const ok = await copyToClipboard(SNIPPET_COPIA_DADOS);
              setSnippetCopiado(ok);
              if (!ok)
                setErro("O navegador não deixou copiar. Selecione o texto do snippet à mão.");
            }}
          >
            <Copy aria-hidden="true" />
            {snippetCopiado ? "Snippet copiado!" : "Copiar snippet"}
          </button>
          <input
            className="app-input flex-1"
            value={colagemSnippet}
            onChange={(e) => setColagemSnippet(e.target.value)}
            onPaste={(e) => {
              const texto = e.clipboardData.getData("text");
              if (texto.trim().startsWith("{")) {
                e.preventDefault();
                aplicarSnippet(texto);
              }
            }}
            placeholder="Cole aqui o que o snippet copiou"
          />
          <button
            type="button"
            className="app-btn"
            onClick={() => aplicarSnippet(colagemSnippet)}
            disabled={!colagemSnippet.trim()}
          >
            Preencher
          </button>
        </div>
        <p className="app-field-hint">
          Abra o produto no TikTok, cole o snippet no console do navegador (F12 › Console) e dê
          Enter. Ele copia nome, preço e foto. Como favorito na barra também funciona, mas o TikTok
          às vezes bloqueia — pelo console nunca bloqueia.
        </p>
      </div>

      {aviso && (
        <p className="app-field-hint mt-3 text-[var(--app-warn)]" role="status">
          {aviso}
        </p>
      )}

      {/* Passo 3 — foto */}
      <div className="app-field mt-4">
        <label>Foto do produto</label>
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const arquivo = Array.from(e.dataTransfer.files).find((f) =>
              f.type.startsWith("image/"),
            );
            if (!arquivo) return;
            e.preventDefault();
            void aplicarImagem(arquivo);
          }}
        >
          {foto ? (
            <img
              src={foto}
              alt="Prévia da foto do produto"
              className="h-20 w-20 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg border text-[var(--app-ink-3)]">
              <ImagePlus aria-hidden="true" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="app-btn app-btn--sm"
                onClick={() => arquivoRef.current?.click()}
              >
                Escolher arquivo
              </button>
              {foto && (
                <button
                  type="button"
                  className="app-btn app-btn--ghost app-btn--sm"
                  onClick={() => setFoto("")}
                  title="Remover foto"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              )}
            </div>
            <span className="app-field-hint">
              {baixarFotoM.isPending
                ? "Baixando a foto do TikTok…"
                : foto
                  ? `Guardada reduzida em WebP · ${pesoLegivel(foto)}`
                  : "Arraste o arquivo aqui, cole com Ctrl+V ou deixe o snippet trazer."}
            </span>
          </div>
          <input
            ref={arquivoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void aplicarImagem(arquivo);
              e.target.value = "";
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="app-input flex-1"
            value={urlFoto}
            onChange={(e) => setUrlFoto(e.target.value)}
            placeholder="Ou cole o endereço da imagem (clique direito › copiar endereço da imagem)"
          />
          <button
            type="button"
            className="app-btn"
            onClick={() => void baixarFotoPorUrl(urlFoto.trim())}
            disabled={!urlFoto.trim() || baixarFotoM.isPending}
          >
            <Download aria-hidden="true" />
            Baixar
          </button>
        </div>
      </div>

      {/* Passo 4 — o resto */}
      <div className="app-grid app-grid--2 mt-4">
        <div className="app-field sm:col-span-2">
          <label>Nome do produto</label>
          <input className="app-input" value={form.nome} onChange={campo("nome")} />
        </div>
        <div className="app-field">
          <label>Código do produto</label>
          <input
            className="app-input"
            value={form.codigo}
            onChange={campo("codigo")}
            placeholder="1729387654321098765"
          />
          {duplicado && (
            <p className="app-field-hint text-[var(--app-danger)]">
              Esse código já está no ranking.
            </p>
          )}
        </div>
        <div className="app-field">
          <label>Categoria</label>
          <input
            className="app-input"
            value={form.categoria}
            onChange={campo("categoria")}
            placeholder="Beleza"
          />
        </div>
        <div className="app-field sm:col-span-2">
          <label>Link de afiliado</label>
          <input
            className="app-input"
            value={form.link}
            onChange={campo("link")}
            placeholder="https://vt.tiktok.com/ZS..."
          />
          <p className="app-field-hint">
            Gravado exatamente como veio, sem tirar nenhum parâmetro — é o que garante a comissão.
          </p>
        </div>
        <div className="app-field">
          <label>Preço (R$)</label>
          <input
            className="app-input"
            inputMode="decimal"
            value={form.preco}
            onChange={campo("preco")}
            placeholder="29,90"
          />
          {precoPrevisto > 0 && (
            <p className="app-field-hint">Vai aparecer como {brl(precoPrevisto)}</p>
          )}
        </div>
        <div className="app-field">
          <label>Comissão (%)</label>
          <input
            className="app-input"
            inputMode="decimal"
            value={form.comissao_pct}
            onChange={campo("comissao_pct")}
            placeholder="20"
          />
        </div>
        <div className="app-field">
          <label>Vendas</label>
          <input
            className="app-input"
            inputMode="numeric"
            value={form.vendas}
            onChange={campo("vendas")}
            placeholder="0"
          />
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.destaque}
          onChange={(e) => setForm({ ...form, destaque: e.target.checked })}
        />
        Marcar como destaque
      </label>

      {erro && <p className="app-field-hint mt-2 text-[var(--app-danger)]">{erro}</p>}

      <button
        type="button"
        className="app-btn app-btn--primary mt-4"
        onClick={() => salvarM.mutate()}
        disabled={salvarM.isPending || duplicado}
      >
        {salvarM.isPending ? "Salvando…" : "Adicionar ao ranking"}
      </button>
    </AdminCard>
  );
}

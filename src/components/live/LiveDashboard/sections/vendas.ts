import type { LiveSessionRow } from "@/lib/live/sync";
import type { Product } from "@/lib/live/config";

/**
 * Leitura das sessões de LIVE para o painel de Início.
 *
 * Tudo aqui sai de `users/{uid}/sessions`, que a extensão alimenta durante a
 * transmissão: cada pedido detectado entra em `sales_snapshot` com o horário, e
 * cada produto que a IA apresentou entra em `products_pitched`, também com
 * horário. São funções puras de propósito — a tela só desenha o que elas
 * devolvem, e dá para testá-las sem Firestore.
 */

export type DiaDeVendas = {
  /** Início do dia, para chave e ordenação. */
  data: Date;
  /** "seg", "ter", … — rótulo curto do eixo. */
  rotulo: string;
  /** Pedidos detectados no dia. */
  vendas: number;
  /** Mensagens que a IA respondeu no dia. */
  respostas: number;
};

export type ProdutoNoRanking = {
  id: string | null;
  nome: string;
  vendas: number;
  /** Produto do catálogo local, quando o nome/id casa com algum. */
  produto: Product | null;
};

const lista = (valor: unknown): any[] => (Array.isArray(valor) ? valor : []);

/** Data válida ou `null` — o campo vem de JSON e pode chegar torto. */
function quando(valor: unknown): Date | null {
  if (typeof valor !== "string" || !valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Normaliza nome de produto para comparação: sem acento, sem caixa, sem espaço duplo. */
function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Série dos últimos N dias, do mais antigo para o mais novo.
 *
 * Dias sem live entram zerados em vez de sumirem: um buraco no meio da semana
 * é informação, e omitir a segunda-feira faria a terça encostar no domingo
 * como se fossem consecutivos.
 */
export function serieDeVendas(
  sessoes: LiveSessionRow[],
  dias = 7,
  hoje = new Date(),
): DiaDeVendas[] {
  const base = inicioDoDia(hoje);
  const serie: DiaDeVendas[] = [];
  const indice = new Map<number, DiaDeVendas>();

  for (let i = dias - 1; i >= 0; i--) {
    const data = new Date(base);
    data.setDate(base.getDate() - i);
    const dia: DiaDeVendas = {
      data,
      rotulo: data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
      vendas: 0,
      respostas: 0,
    };
    serie.push(dia);
    indice.set(data.getTime(), dia);
  }

  for (const sessao of sessoes) {
    const inicio = quando(sessao.started_at);

    for (const venda of lista(sessao.sales_snapshot)) {
      // Pedido antigo não tem `at` — cai no dia da sessão, que é o melhor
      // palpite disponível e não inventa data nenhuma.
      const em = quando(venda?.at) ?? inicio;
      if (!em) continue;
      const dia = indice.get(inicioDoDia(em).getTime());
      if (dia) dia.vendas += 1;
    }

    if (!inicio) continue;
    const diaDaSessao = indice.get(inicioDoDia(inicio).getTime());
    if (diaDaSessao) diaDaSessao.respostas += Number(sessao.messages_answered) || 0;
  }

  return serie;
}

/**
 * Ranking de produtos por venda atribuída.
 *
 * A extensão não diz qual produto gerou cada pedido — ela só registra que um
 * pedido apareceu na tela. A atribuição aqui é temporal: a venda conta para o
 * último produto que a IA apresentou antes dela, dentro da mesma sessão. É
 * como o próprio live commerce credita venda, e é a única leitura possível sem
 * mudar o que a extensão grava.
 *
 * Limite conhecido: `products_pitched` guarda só a primeira aparição de cada
 * produto na sessão. Se o vendedor volta a um produto já apresentado, as
 * vendas seguintes continuam creditadas ao último produto *novo* da sessão.
 */
export function topProdutos(
  sessoes: LiveSessionRow[],
  catalogo: Product[],
  limite = 5,
): ProdutoNoRanking[] {
  const porChave = new Map<string, ProdutoNoRanking>();

  const doCatalogo = new Map<string, Product>();
  for (const p of catalogo) {
    doCatalogo.set(chaveDoNome(p.name), p);
    if (p.id) doCatalogo.set(`#${p.id}`, p);
  }

  const registrar = (nome: string, id: string | null, vendas: number) => {
    const chave = id ? `#${id}` : chaveDoNome(nome);
    const atual = porChave.get(chave);
    if (atual) {
      atual.vendas += vendas;
      return;
    }
    porChave.set(chave, {
      id,
      nome,
      vendas,
      produto: (id ? doCatalogo.get(`#${id}`) : null) ?? doCatalogo.get(chaveDoNome(nome)) ?? null,
    });
  };

  for (const sessao of sessoes) {
    const apresentados = lista(sessao.products_pitched)
      .map((p) => ({
        nome: String(p?.name ?? "").trim(),
        id: typeof p?.id === "string" && p.id ? p.id : null,
        em: quando(p?.at)?.getTime() ?? null,
      }))
      .filter((p) => p.nome)
      .sort((a, b) => (a.em ?? 0) - (b.em ?? 0));

    if (apresentados.length === 0) continue;

    for (const venda of lista(sessao.sales_snapshot)) {
      const em = quando(venda?.at)?.getTime() ?? null;
      // Sem horário na venda, credita ao primeiro produto da sessão — em live
      // curta de um produto só é exatamente o certo, e nas demais é o palpite
      // menos arbitrário que existe.
      const alvo =
        em === null
          ? apresentados[0]
          : ([...apresentados].reverse().find((p) => p.em !== null && p.em <= em) ??
            apresentados[0]);
      registrar(alvo.nome, alvo.id, 1);
    }

    // Produto apresentado e sem venda também entra no ranking, com zero: sumir
    // da lista esconderia justamente o que não está performando.
    for (const p of apresentados) registrar(p.nome, p.id, 0);
  }

  return [...porChave.values()].sort((a, b) => b.vendas - a.vendas).slice(0, limite);
}

/** Total de pedidos detectados na série — usado no cabeçalho do gráfico. */
export function totalDeVendas(serie: DiaDeVendas[]): number {
  return serie.reduce((soma, dia) => soma + dia.vendas, 0);
}

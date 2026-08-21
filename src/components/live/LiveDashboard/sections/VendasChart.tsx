import type { DiaDeVendas } from "./vendas";

/**
 * Vendas por dia (barras) contra respostas da IA (linha).
 *
 * SVG à mão, sem biblioteca de gráfico: são sete barras e uma polilinha, e o
 * `recharts` do package.json custaria uma centena de KB no bundle do painel
 * para desenhar isso. O `viewBox` faz o trabalho responsivo — o desenho encolhe
 * junto com o cartão sem nenhuma medição em JS.
 *
 * As duas séries têm escalas próprias de propósito: respostas da IA vivem na
 * casa das centenas e vendas na casa das unidades, então uma escala comum
 * deixaria as barras rentes ao chão.
 */

const W = 720;
const H = 240;
const TOPO = 30;
const BASE = H - 30;
const MARGEM = 6;
const ALTURA = BASE - TOPO;

export function VendasChart({ serie }: { serie: DiaDeVendas[] }) {
  const faixa = (W - MARGEM * 2) / Math.max(1, serie.length);
  const larguraBarra = Math.min(64, faixa * 0.62);

  const maxVendas = Math.max(1, ...serie.map((d) => d.vendas));
  const maxRespostas = Math.max(1, ...serie.map((d) => d.respostas));

  const centro = (i: number) => MARGEM + faixa * i + faixa / 2;
  const yVendas = (v: number) => BASE - (v / maxVendas) * ALTURA;
  // 0.88 reserva um respiro no topo: a linha encostada na borda parece cortada.
  const yRespostas = (r: number) => BASE - (r / maxRespostas) * ALTURA * 0.88;

  const totalVendas = serie.reduce((s, d) => s + d.vendas, 0);
  const melhor = totalVendas > 0 ? serie.reduce((a, b) => (b.vendas > a.vendas ? b : a)) : null;

  const linha = serie.map((d, i) => `${centro(i)},${yRespostas(d.respostas)}`).join(" ");

  return (
    <svg
      className="app-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Vendas por dia nos últimos ${serie.length} dias: ${serie
        .map((d) => `${d.rotulo} ${d.vendas}`)
        .join(", ")}.`}
    >
      {/* grade: quatro linhas bastam para dar referência sem virar papel milimetrado */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line
          key={p}
          className="app-chart-grid"
          x1={MARGEM}
          x2={W - MARGEM}
          y1={BASE - ALTURA * p}
          y2={BASE - ALTURA * p}
        />
      ))}

      {serie.map((dia, i) => {
        const y = yVendas(dia.vendas);
        const destaque = melhor !== null && dia === melhor;
        return (
          <g key={dia.data.toISOString()}>
            {dia.vendas > 0 ? (
              <rect
                className="app-chart-bar"
                data-best={destaque}
                x={centro(i) - larguraBarra / 2}
                y={y}
                width={larguraBarra}
                height={Math.max(2, BASE - y)}
                rx={6}
              >
                <title>
                  {dia.rotulo}: {dia.vendas} venda(s), {dia.respostas} resposta(s)
                </title>
              </rect>
            ) : null}
            <text className="app-chart-label" x={centro(i)} y={H - 8} textAnchor="middle">
              {dia.rotulo}
            </text>
            {destaque ? (
              <text className="app-chart-peak" x={centro(i)} y={y - 10} textAnchor="middle">
                {dia.vendas}
              </text>
            ) : null}
          </g>
        );
      })}

      <polyline className="app-chart-line" points={linha} />
      {serie.map((dia, i) => (
        <circle
          key={dia.data.toISOString()}
          className="app-chart-dot"
          cx={centro(i)}
          cy={yRespostas(dia.respostas)}
          r={4}
        />
      ))}
    </svg>
  );
}

/** Bolinha + rótulo, do jeito que a legenda do gráfico pede. */
export function LegendaVendas() {
  return (
    <div className="app-chart-legend">
      <span>
        <i className="app-chart-mark" data-serie="vendas" />
        Vendas
      </span>
      <span>
        <i className="app-chart-mark" data-serie="respostas" />
        Respostas da IA
      </span>
    </div>
  );
}

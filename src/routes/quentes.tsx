import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchPublicRanking } from "@/lib/live/admin";
import { SitePageFrame } from "@/components/live/SitePageFrame";

export const Route = createFileRoute("/quentes")({
  head: () => ({
    meta: [
      { title: "Produtos quentes · Pitch AI" },
      {
        name: "description",
        content: "Ranking dos produtos que mais vendem nas lives, curado pela equipe Pitch AI.",
      },
      { property: "og:title", content: "Produtos quentes · Pitch AI" },
      {
        property: "og:description",
        content: "Veja quais produtos estão vendendo mais nas lives agora.",
      },
    ],
  }),
  component: QuentesPage,
});

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function QuentesPage() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["ranking", "public"],
    queryFn: fetchPublicRanking,
  });

  return (
    <SitePageFrame>
      <div className="wrap">
        <header className="sec-head">
          <div className="eyebrow">Curadoria Pitch AI</div>
          <h1>
            Produtos <em className="h1-serif">quentes</em> 🔥
          </h1>
          <p>
            Seleção da equipe Pitch AI com os produtos que mais estão vendendo em live. Clique para
            abrir a página do produto.
          </p>
        </header>

        {isLoading ? (
          <p className="site-page-note">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="site-page-note">Nenhum produto no ranking ainda.</p>
        ) : (
          <div className="hot-grid">
            {items.map((p, i) => (
              <article key={p.id} className="card hot-card">
                <div className="hot-cover">
                  {p.imagem_url ? (
                    <img src={p.imagem_url} alt={p.nome} loading="lazy" />
                  ) : (
                    <div className="hot-cover-empty" aria-hidden="true">
                      🛍️
                    </div>
                  )}
                  <span className="hot-rank">#{i + 1}</span>
                  {p.destaque && <span className="hot-flag">Destaque</span>}
                </div>

                <div className="hot-body">
                  <h2 className="hot-name">{p.nome}</h2>
                  {p.categoria && <div className="card-tag">{p.categoria}</div>}

                  <div className="hot-foot">
                    <div>
                      <div className="hot-price">
                        {p.preco != null ? brl(Number(p.preco)) : "—"}
                      </div>
                      <div className="hot-meta">
                        {p.vendas.toLocaleString("pt-BR")} vendas
                        {p.comissao_pct != null ? ` · ${Number(p.comissao_pct)}% comissão` : ""}
                      </div>
                    </div>
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="btn btn-primary"
                      >
                        Abrir
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </SitePageFrame>
  );
}

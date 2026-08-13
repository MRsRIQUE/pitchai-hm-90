import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchRanking } from "@/lib/live/admin";
import { SiteNav } from "@/components/live/SiteNav";

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
    queryFn: fetchRanking,
  });

  return (
    <div className="marketing-page min-h-dvh">
      <SiteNav tone="light" />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="marketing-title text-4xl sm:text-5xl">Produtos quentes 🔥</h1>
        <p className="mt-2 text-sm text-white/60">
          Seleção da equipe Pitch AI com os produtos que mais estão vendendo em live. Clique para
          abrir a página do produto.
        </p>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-white/50">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/50">
            Nenhum produto no ranking ainda.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p, i) => (
              <article key={p.id} className="marketing-panel overflow-hidden rounded-2xl">
                <div className="relative aspect-[4/3] bg-black/40">
                  {p.imagem_url ? (
                    <img
                      src={p.imagem_url}
                      alt={p.nome}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-4xl">🛍️</div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-xs">
                    #{i + 1}
                  </span>
                  {p.destaque && (
                    <span className="absolute right-2 top-2 rounded-full bg-[#FF6B35] px-2 py-0.5 text-xs font-semibold">
                      Destaque
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <h2 className="line-clamp-2 text-sm font-semibold">{p.nome}</h2>
                  {p.categoria && (
                    <span className="inline-block rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/60">
                      {p.categoria}
                    </span>
                  )}
                  <div className="flex items-end justify-between pt-1">
                    <div>
                      <div className="font-mono text-lg font-bold text-[#00E676]">
                        {p.preco != null ? brl(Number(p.preco)) : "—"}
                      </div>
                      <div className="text-[11px] text-white/40">
                        {p.vendas.toLocaleString("pt-BR")} vendas
                        {p.comissao_pct != null ? ` · ${Number(p.comissao_pct)}% comissão` : ""}
                      </div>
                    </div>
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold hover:bg-[#6D28D9]"
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
      </main>
    </div>
  );
}

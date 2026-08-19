import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2 } from "lucide-react";
import {
  deleteAllRankedProducts,
  deleteRankedProduct,
  fetchRanking,
  insertRankedProducts,
  parseRankingCSV,
  updateRankedProduct,
  type RankedProduct,
} from "@/lib/live/admin";
import { AdminCard, AdminEmpty, AdminLoading, AdminStat, ErrorState } from "./admin-ui";
import { ProdutoTikTokCard } from "./ProdutoTikTokCard";
import { brl } from "./format";

export function RankingSection() {
  const qc = useQueryClient();
  const {
    data: items = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "ranking"],
    queryFn: fetchRanking,
  });
  const [raw, setRaw] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "ranking"] });

  const importM = useMutation({
    mutationFn: async (r: string) => {
      const parsed = parseRankingCSV(r);
      await insertRankedProducts(parsed);
    },
    onSuccess: () => {
      setRaw("");
      invalidate();
    },
  });
  const patchM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RankedProduct> }) =>
      updateRankedProduct(id, patch),
    onSuccess: invalidate,
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteRankedProduct(id),
    onSuccess: invalidate,
  });
  const resetM = useMutation({
    mutationFn: () => deleteAllRankedProducts(),
    onSuccess: invalidate,
  });

  const totalVendas = items.reduce((s, p) => s + p.vendas, 0);
  const totalReceita = items.reduce((s, p) => s + Number(p.receita), 0);
  const destaques = items.filter((p) => p.destaque);

  return (
    <>
      <section className="app-section">
        <div className="app-grid app-grid--4">
          <AdminStat label="Produtos" value={items.length.toString()} />
          <AdminStat label="Destaques" value={destaques.length.toString()} tone="accent" />
          <AdminStat label="Vendas totais" value={totalVendas.toLocaleString("pt-BR")} />
          <AdminStat label="Receita" value={brl(totalReceita)} tone="ok" />
        </div>
      </section>

      <section className="app-section">
        <ProdutoTikTokCard existentes={items} onDone={invalidate} />
      </section>

      <section className="app-section">
        <AdminCard
          title="Importar do TikTok Shop"
          hint="Cole no formato: nome,vendas,receita (uma linha por produto). Separador , ; ou tab."
        >
          <textarea
            className="app-textarea"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            placeholder={`Camiseta preta,320,9600\nCaneca personalizada,210,4200\n...`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="app-btn app-btn--primary"
              onClick={() => importM.mutate(raw)}
              disabled={!raw.trim() || importM.isPending}
            >
              {importM.isPending ? "Importando…" : "Importar"}
            </button>
            <button
              type="button"
              className="app-btn"
              onClick={() => {
                if (confirm("Apagar todo o ranking?")) resetM.mutate();
              }}
            >
              Limpar tudo
            </button>
          </div>
          {importM.error && (
            <p className="app-field-hint mt-2 text-[var(--app-danger)]">
              {(importM.error as Error).message}
            </p>
          )}
          {(patchM.error || delM.error || resetM.error) && (
            <div className="mt-3">
              <ErrorState error={patchM.error || delM.error || resetM.error} />
            </div>
          )}
        </AdminCard>
      </section>

      <section className="app-section">
        <AdminCard title="Ranking" hint="Marque a estrela para destacar os melhores produtos.">
          {error ? (
            <ErrorState error={error} />
          ) : isLoading ? (
            <AdminLoading />
          ) : items.length === 0 ? (
            <AdminEmpty
              title="Sem produtos ainda"
              hint="Importe pelo CSV ou cadastre pelo código do TikTok."
            />
          ) : (
            <div className="app-table-wrap">
              <table className="app-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Destaque</th>
                    <th>Foto</th>
                    <th>Produto</th>
                    <th className="num">Vendas</th>
                    <th className="num">Receita</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p, i) => (
                    <tr key={p.id}>
                      <td className="num text-[var(--app-ink-3)]">{i + 1}</td>
                      <td>
                        <button
                          type="button"
                          className="app-btn app-btn--ghost app-btn--sm"
                          onClick={() =>
                            patchM.mutate({ id: p.id, patch: { destaque: !p.destaque } })
                          }
                          title={p.destaque ? "Remover destaque" : "Destacar"}
                          aria-pressed={p.destaque}
                        >
                          <Star
                            aria-hidden="true"
                            fill={p.destaque ? "currentColor" : "none"}
                            className={p.destaque ? "text-[var(--app-warn)]" : undefined}
                          />
                        </button>
                      </td>
                      <td>
                        {p.imagem_url ? (
                          <img
                            src={p.imagem_url}
                            alt={p.nome}
                            className="h-10 w-10 rounded-md object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="app-field-hint">sem foto</span>
                        )}
                      </td>
                      <td>
                        {p.nome}
                        {p.tiktok_product_id && (
                          <div className="app-field-hint">#{p.tiktok_product_id}</div>
                        )}
                      </td>
                      <td className="num">{p.vendas.toLocaleString("pt-BR")}</td>
                      <td className="num">{brl(Number(p.receita))}</td>
                      <td>
                        <div className="app-table-actions">
                          <button
                            type="button"
                            className="app-btn app-btn--ghost app-btn--sm"
                            onClick={() => delM.mutate(p.id)}
                            title="Remover do ranking"
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </section>
    </>
  );
}

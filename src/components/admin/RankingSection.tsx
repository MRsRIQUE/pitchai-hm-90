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
        <ProdutoPorLinkCard onDone={invalidate} />
      </section>

      <section className="app-section">
        <AdminCard title="Ranking" hint="Marque a estrela para destacar os melhores produtos.">
          {error ? (
            <ErrorState error={error} />
          ) : isLoading ? (
            <AdminLoading />
          ) : items.length === 0 ? (
            <AdminEmpty title="Sem produtos ainda" hint="Importe pelo CSV ou adicione pelo link." />
          ) : (
            <div className="app-table-wrap">
              <table className="app-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Destaque</th>
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
                      <td>{p.nome}</td>
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

/** Cadastro manual — usado quando o produto não veio pelo CSV do TikTok Shop. */
function ProdutoPorLinkCard({ onDone }: { onDone: () => void }) {
  const empty = {
    nome: "",
    link: "",
    imagem_url: "",
    categoria: "",
    preco: 0,
    comissao_pct: 0,
    vendas: 0,
    destaque: false,
  };
  const [form, setForm] = useState(empty);

  const addM = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do produto.");
      await insertRankedProducts([
        {
          nome: form.nome.trim(),
          link: form.link.trim() || null,
          imagem_url: form.imagem_url.trim() || null,
          categoria: form.categoria.trim() || null,
          preco: Number(form.preco) || 0,
          comissao_pct: Number(form.comissao_pct) || 0,
          vendas: Number(form.vendas) || 0,
          receita: (Number(form.preco) || 0) * (Number(form.vendas) || 0),
          destaque: form.destaque,
        },
      ]);
    },
    onSuccess: () => {
      setForm(empty);
      onDone();
    },
  });

  return (
    <AdminCard
      title="Adicionar produto pelo link"
      hint="Cole o link do produto e preencha os dados manualmente. Aparece na página pública /quentes."
    >
      <div className="app-grid app-grid--2">
        <div className="app-field sm:col-span-2">
          <label>Nome do produto</label>
          <input
            className="app-input"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Kit skincare vitamina C"
          />
        </div>
        <div className="app-field sm:col-span-2">
          <label>Link do produto</label>
          <input
            className="app-input"
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
            placeholder="https://shop.tiktok.com/..."
          />
        </div>
        <div className="app-field sm:col-span-2">
          <label>URL da imagem</label>
          <input
            className="app-input"
            value={form.imagem_url}
            onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
            placeholder="https://..."
          />
        </div>
        <div className="app-field">
          <label>Categoria</label>
          <input
            className="app-input"
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            placeholder="Beleza"
          />
        </div>
        <div className="app-field">
          <label>Preço (R$)</label>
          <input
            className="app-input"
            type="number"
            min={0}
            step={0.01}
            value={form.preco}
            onChange={(e) => setForm({ ...form, preco: +e.target.value || 0 })}
          />
        </div>
        <div className="app-field">
          <label>Comissão (%)</label>
          <input
            className="app-input"
            type="number"
            min={0}
            step={1}
            value={form.comissao_pct}
            onChange={(e) => setForm({ ...form, comissao_pct: +e.target.value || 0 })}
          />
        </div>
        <div className="app-field">
          <label>Vendas</label>
          <input
            className="app-input"
            type="number"
            min={0}
            value={form.vendas}
            onChange={(e) => setForm({ ...form, vendas: +e.target.value || 0 })}
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

      {addM.error && (
        <p className="app-field-hint mt-2 text-[var(--app-danger)]">
          {(addM.error as Error).message}
        </p>
      )}
      <button
        type="button"
        className="app-btn app-btn--primary mt-4"
        onClick={() => addM.mutate()}
        disabled={addM.isPending}
      >
        {addM.isPending ? "Salvando…" : "Adicionar ao ranking"}
      </button>
    </AdminCard>
  );
}

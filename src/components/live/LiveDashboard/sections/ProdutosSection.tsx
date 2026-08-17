import { CheckCircle2, Pin } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { pushLiveConfigFields } from "@/lib/live/sync";
import type { LiveConfig } from "@/lib/live/config";
import { ProductsSection } from "../ProductsSection";
import { formatarPreco } from "./produto";

/**
 * Catálogo + rodízio automático.
 *
 * O auto-fixar mora aqui, e não em Automações, porque a tela dele é quase toda
 * seleção de produto — separar das duas listas obrigaria o usuário a ir e
 * voltar para saber o que está marcado.
 */
export function ProdutosSection() {
  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();

  // A extensão precisa saber do rodízio na hora; o resto do catálogo ela relê
  // no próximo ciclo da vitrine.
  const updateAutoFixar = (value: LiveConfig["autoFixar"]) => {
    updateConfig((c) => ({ ...c, autoFixar: value }));
    void pushLiveConfigFields({ autoFixar: value }).catch((error) => {
      console.error("[ProdutosSection] falha ao sincronizar Auto-Fixar:", error);
      toast.error("Não consegui atualizar o Auto-Fixar na extensão");
    });
  };

  const toggleProduto = (produtoId: string) => {
    const atuais = config.autoFixar.ids ?? [];
    const ids = atuais.includes(produtoId)
      ? atuais.filter((id) => id !== produtoId)
      : [...atuais, produtoId];
    const names = config.produtos.filter((p) => ids.includes(p.id)).map((p) => p.name);
    updateAutoFixar({ ...config.autoFixar, ids, names });
  };

  const filtro = config.autoFixar.query.trim().toLowerCase();
  const visiveis = config.produtos.filter((p) => p.name.toLowerCase().includes(filtro));
  const selecionados = (config.autoFixar.ids ?? []).length;

  return (
    <>
      <div className="app-section">
        <ProductsSection />
      </div>

      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Rodízio automático</h2>
        </div>

        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h3
                className="app-card-title"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span className="app-stat-label" style={{ margin: 0 }}>
                  <Pin aria-hidden="true" />
                </span>
                Auto-fixar produto
              </h3>
              <p className="app-card-desc">
                A extensão troca o produto fixado na live sozinha, dentro do intervalo escolhido.
              </p>
            </div>
            <Switch
              checked={config.autoFixar.enabled}
              onCheckedChange={(enabled) => updateAutoFixar({ ...config.autoFixar, enabled })}
            />
          </div>

          <div className="app-grid app-grid--3">
            <div className="app-field">
              <label htmlFor="autofixar-filtro">Filtrar a lista</label>
              <input
                id="autofixar-filtro"
                className="app-input"
                placeholder="Nome do produto"
                value={config.autoFixar.query}
                onChange={(e) => updateAutoFixar({ ...config.autoFixar, query: e.target.value })}
              />
            </div>
            <div className="app-field">
              <label htmlFor="autofixar-min">Re-fixa a cada, no mínimo (s)</label>
              <input
                id="autofixar-min"
                className="app-input"
                type="number"
                min={5}
                value={config.autoFixar.minSec}
                onChange={(e) =>
                  updateAutoFixar({
                    ...config.autoFixar,
                    minSec: Math.max(5, Number(e.target.value) || 20),
                  })
                }
              />
            </div>
            <div className="app-field">
              <label htmlFor="autofixar-max">E no máximo (s)</label>
              <input
                id="autofixar-max"
                className="app-input"
                type="number"
                min={5}
                value={config.autoFixar.maxSec}
                onChange={(e) =>
                  updateAutoFixar({
                    ...config.autoFixar,
                    maxSec: Math.max(5, Number(e.target.value) || 60),
                  })
                }
              />
            </div>
          </div>

          <div className="app-card app-card--flat" style={{ marginTop: 16 }}>
            <div className="app-card-head" style={{ marginBottom: 10 }}>
              <h4 className="app-section-title">Produtos no rodízio</h4>
              <span className="app-tag" data-tone={selecionados > 0 ? "accent" : undefined}>
                {selecionados} selecionado{selecionados === 1 ? "" : "s"}
              </span>
            </div>

            {config.produtos.length === 0 ? (
              <p className="app-field-hint">
                Sincronize a vitrine acima para escolher os produtos que serão fixados.
              </p>
            ) : visiveis.length === 0 ? (
              <p className="app-field-hint">Nenhum produto encontrado com esse filtro.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {visiveis.map((produto) => {
                  const marcado = (config.autoFixar.ids ?? []).includes(produto.id);
                  return (
                    <button
                      key={produto.id}
                      type="button"
                      className={`app-btn app-btn--sm${marcado ? " app-btn--primary" : ""}`}
                      onClick={() => toggleProduto(produto.id)}
                      title={produto.name}
                      // `.app-btn` é nowrap e sem teto de largura: um nome longo
                      // vira um botão gigante que estoura o cartão.
                      style={{ maxWidth: "min(280px, 100%)" }}
                    >
                      {marcado ? <CheckCircle2 aria-hidden="true" /> : null}
                      {/* text-overflow não pega em texto solto de flex container:
                          sem o span o nome longo aparece cortado dos dois lados. */}
                      <span
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {produto.name}
                        {formatarPreco(produto) ? ` · ${formatarPreco(produto)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

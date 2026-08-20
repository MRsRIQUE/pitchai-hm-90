import { Flame, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { mergeVitrineProducts, type Product } from "@/lib/live/config";
import { useHotProducts, removeHotProduct, type HotProduct } from "@/hooks/live/useHotProducts";
import { ProdutoThumb } from "./ProdutoThumb";
import { formatarPreco } from "./produto";

/**
 * Converte um HotProduct da API para VitrineItemEntrada, mantendo compatibilidade
 * com mergeVitrineProducts.
 */
function hotToVitrineItem(hp: HotProduct) {
  return {
    id: hp.id,
    name: hp.name,
    price: hp.price,
    priceCents: hp.priceCents ?? undefined,
    priceMaxCents: hp.priceMaxCents ?? undefined,
    currency: hp.currency ?? undefined,
    imageUrl: hp.imageUrl ?? undefined,
    description: hp.description,
  };
}

export function QuentesSection() {
  const { items, isMaster, loading, refresh } = useHotProducts();

  const config = useLiveStore(useShallow((state) => state.config));
  const updateConfig = useSyncedUpdateConfig();

  const existingIds = new Set(config.produtos.map((p) => p.id));

  const handleAdd = (hp: HotProduct) => {
    const { produtos, addedCount } = mergeVitrineProducts(config.produtos, [hotToVitrineItem(hp)]);
    if (addedCount === 0) {
      toast.info("Produto já está no seu catálogo");
      return;
    }
    updateConfig((c) => ({ ...c, produtos }));
    toast.success(`${hp.name} adicionado ao catálogo`);
  };

  const handleRemove = async (hp: HotProduct) => {
    const ok = await removeHotProduct(hp.id);
    if (ok) {
      toast.success(`${hp.name} removido da curadoria`);
      void refresh();
    } else {
      toast.error("Não foi possível remover o produto");
    }
  };

  if (loading) {
    return (
      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">
            <Flame aria-hidden="true" /> Produtos Quentes
          </h2>
        </div>
        <div
          className="app-card"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}
        >
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">
            <Flame aria-hidden="true" /> Produtos Quentes
          </h2>
          <p className="app-section-desc">Curadoria da conta mestre para o seu catálogo</p>
        </div>
        <div className="app-card">
          <p className="app-field-hint" style={{ textAlign: "center", padding: "16px 0" }}>
            Nenhum produto quente disponível no momento. A conta mestre ainda não publicou
            curadoria.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-section">
      <div className="app-section-head">
        <h2 className="app-section-title">
          <Flame aria-hidden="true" /> Produtos Quentes
        </h2>
        <p className="app-section-desc">Curadoria da conta mestre para o seu catálogo</p>
      </div>

      <div className="app-grid app-grid--3">
        {items.map((hp) => {
          const alreadyAdded = existingIds.has(hp.id);
          return (
            <div
              key={hp.id}
              className="app-card"
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <ProdutoThumb produto={hp as Product} tamanho={48} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    className="app-card-title"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {hp.name}
                  </h3>
                  {formatarPreco(hp as Product) && (
                    <span className="app-tag" data-tone="accent">
                      {formatarPreco(hp as Product)}
                    </span>
                  )}
                </div>
              </div>

              {hp.description && (
                <p
                  className="app-card-desc"
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {hp.description}
                </p>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                <button
                  type="button"
                  className={`app-btn app-btn--sm${alreadyAdded ? "" : " app-btn--primary"}`}
                  onClick={() => handleAdd(hp)}
                  disabled={alreadyAdded}
                  style={{ flex: 1 }}
                >
                  <Plus aria-hidden="true" />
                  {alreadyAdded ? "Já adicionado" : "Adicionar ao meu catálogo"}
                </button>

                {isMaster && (
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--danger"
                    onClick={() => void handleRemove(hp)}
                    title="Remover da curadoria"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

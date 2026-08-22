import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Eye,
  ImageIcon,
  Loader2,
  Pencil,
  Pin,
  Plus,
  ShoppingBag,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { useVitrineSync } from "@/hooks/live/useVitrineSync";
import { mergeVitrineProducts, newProduct, type Product } from "@/lib/live/config";
import { useHotProducts, sendHotProduct } from "@/hooks/live/useHotProducts";
import { ProdutoThumb } from "./ProdutoThumb";
import { descricaoDoProduto, formatarPreco } from "./produto";
import { aiHeaders } from "@/lib/live/ai-headers";

/**
 * Catálogo + produto principal + rodízio automático.
 *
 * O auto-fixar mora aqui, e não em Automações, porque a tela dele é quase toda
 * seleção de produto — separar das duas listas obrigaria o usuário a ir e
 * voltar para saber o que está marcado.
 */
export function ProdutosSection() {
  const config = useLiveStore(useShallow((state) => state.config));
  const vitrineStatus = useLiveStore((s) => s.vitrineStatus);
  const vitrineAt = useLiveStore((s) => s.vitrineAt);
  const updateConfig = useSyncedUpdateConfig();
  const { isMaster } = useHotProducts();

  const { syncVitrine } = useVitrineSync({ autoSync: false });

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [importing, setImporting] = useState(false);
  const [learningId, setLearningId] = useState<string | null>(null);

  const detailsProduct = config.produtos.find((p) => p.id === detailsId) ?? null;

  // Se o produto aberto for removido em outra origem, volta ao catálogo.
  useEffect(() => {
    if (detailsId && !detailsProduct) {
      setDetailsId(null);
      setEditingDetails(false);
    }
  }, [detailsId, detailsProduct]);

  const activeProduct = config.produtos.find((p) => p.active) ?? null;

  const openDetails = (productId: string, edit = false) => {
    setDetailsId(productId);
    setEditingDetails(edit);
  };

  const closeDetails = () => {
    setDetailsId(null);
    setEditingDetails(false);
  };

  // Sincroniza com a vitrine e traz os itens para a lista de produtos.
  const handleImportVitrine = async () => {
    setImporting(true);
    try {
      const outcome = await syncVitrine();

      if (!outcome.ok) {
        // Colidir com o ciclo automático de 20s não é falha — avisar em
        // vermelho aqui fazia parecer que a vitrine tinha quebrado.
        if (outcome.busy) toast.info("Já estava sincronizando — tente de novo em alguns segundos");
        else toast.error(`Falha ao sincronizar: ${outcome.error}`);
        return;
      }

      if (outcome.items.length === 0) {
        toast.info("Vitrine sincronizada, mas nenhum produto veio do TikTok");
        return;
      }

      if (outcome.importedCount === 0) {
        toast.info("Nenhum produto novo — todos já estavam na sua lista");
        return;
      }

      toast.success(`${outcome.importedCount} produto(s) importado(s) da vitrine`);
    } finally {
      setImporting(false);
    }
  };

  // Importa do clipboard (extensão)
  const importFromExtension = async () => {
    try {
      let raw = "";
      try {
        raw = await navigator.clipboard.readText();
      } catch {
        raw =
          window.prompt(
            "Cole aqui o JSON do catálogo (gerado pelo botão 'Buscar catálogo' da extensão no TikTok Shop):",
            "",
          ) ?? "";
      }

      if (!raw.trim()) return;

      const scraped = JSON.parse(raw) as { name: string; price?: string; description?: string }[];
      if (!Array.isArray(scraped) || scraped.length === 0) {
        toast.error("Catálogo vazio ou inválido");
        return;
      }

      const merged = mergeVitrineProducts(config.produtos, scraped);

      if (merged.addedCount === 0) {
        toast.info("Nenhum produto novo — todos já existiam");
        return;
      }

      updateConfig((c) => ({ ...c, produtos: merged.produtos }));
      toast.success(`${merged.addedCount} produto(s) importado(s) do catálogo`);
    } catch (e) {
      toast.error("Falha ao importar", {
        description: e instanceof Error ? e.message : "JSON inválido",
      });
    }
  };

  // Adiciona novo produto
  const addProduct = () => {
    const p = newProduct();
    updateConfig((c) => ({ ...c, produtos: [...c.produtos, p] }));
    openDetails(p.id, true);
  };

  // Atualiza campo de produto
  const updateProductField = <K extends keyof Product>(field: K, value: Product[K]) => {
    if (!detailsProduct) return;
    updateConfig((c) => ({
      ...c,
      produtos: c.produtos.map((p) => (p.id === detailsProduct.id ? { ...p, [field]: value } : p)),
    }));
  };

  // Atualiza o produto ativo (só um por vez)
  const setActiveProduct = (productId: string, active: boolean) => {
    updateConfig((c) => ({
      ...c,
      produtos: c.produtos.map((p) =>
        p.id === productId ? { ...p, active: active } : { ...p, active: false },
      ),
    }));
  };

  // Remove produto
  const removeProduct = (productId: string) => {
    updateConfig((c) => ({ ...c, produtos: c.produtos.filter((p) => p.id !== productId) }));
    if (detailsId === productId) {
      closeDetails();
    }
  };

  const learnProduct = async (product: Product) => {
    if (!product.name.trim()) {
      toast.error("Cadastre o nome do produto antes de ensinar a IA");
      return;
    }
    setLearningId(product.id);
    try {
      const response = await fetch("/api/product/learn", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({
          product: {
            id: product.id,
            name: product.name,
            price: product.price || "",
            description: product.description || "",
            aiKnowledge: product.aiKnowledge || "",
          },
          context: {
            niche: config.aiContext.niche,
            targetAudience: config.aiContext.targetAudience,
            tone: config.aiContext.tone,
            rules: config.aiContext.rules,
          },
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        knowledge?: string;
        learnedAt?: string;
      } | null;
      if (!response.ok || !result?.knowledge) {
        throw new Error(result?.error || `Falha ao aprender (${response.status}).`);
      }
      updateConfig((current) => ({
        ...current,
        produtos: current.produtos.map((item) =>
          item.id === product.id
            ? {
                ...item,
                aiKnowledge: result.knowledge,
                aiLearnedAt: result.learnedAt || new Date().toISOString(),
              }
            : item,
        ),
      }));
      toast.success("A IA aprendeu sobre este produto", {
        description: "A ficha já será usada nas respostas, pitches e roteiros.",
      });
    } catch (error) {
      toast.error("Não foi possível ensinar este produto", {
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    } finally {
      setLearningId(null);
    }
  };

  if (detailsProduct) {
    const preco = formatarPreco(detailsProduct);

    return (
      <div className="app-section app-product-detail-page">
        <div className="app-product-detail-topbar">
          <button type="button" className="app-product-detail-back" onClick={closeDetails}>
            <ArrowLeft aria-hidden="true" />
            Voltar para produtos
          </button>
          <div className="app-product-detail-actions">
            <button
              type="button"
              className="app-btn app-btn--primary"
              disabled={learningId === detailsProduct.id}
              onClick={() => void learnProduct(detailsProduct)}
            >
              {learningId === detailsProduct.id ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Brain aria-hidden="true" />
              )}
              {detailsProduct.aiKnowledge ? "Reaprender produto" : "IA aprender produto"}
            </button>
            {!detailsProduct.active ? (
              <button
                type="button"
                className="app-btn"
                onClick={() => setActiveProduct(detailsProduct.id, true)}
              >
                <Star aria-hidden="true" /> Tornar principal
              </button>
            ) : (
              <span className="app-tag" data-tone="accent">
                <Star aria-hidden="true" /> Produto principal
              </span>
            )}
            <button
              type="button"
              className={`app-btn${editingDetails ? " app-btn--primary" : ""}`}
              onClick={() => setEditingDetails((current) => !current)}
            >
              {editingDetails ? (
                <>
                  <CheckCircle2 aria-hidden="true" /> Concluir edição
                </>
              ) : (
                <>
                  <Pencil aria-hidden="true" /> Editar produto
                </>
              )}
            </button>
          </div>
        </div>

        <div className="app-card app-product-detail-card">
          <div className="app-product-detail-layout">
            <div className="app-product-detail-media">
              <ProdutoThumb produto={detailsProduct} preencher />
              {detailsProduct.active ? (
                <span className="app-product-card-badge">
                  <Star aria-hidden="true" /> Principal
                </span>
              ) : null}
            </div>

            <div className="app-product-detail-content">
              <div className="app-product-detail-eyebrow">
                <ShoppingBag aria-hidden="true" /> Detalhes do produto
              </div>
              <h2>{detailsProduct.name || "Produto sem nome"}</h2>
              <div className="app-product-detail-price">{preco ?? "Preço não informado"}</div>

              <div className="app-product-detail-description">
                <span>Descrição e benefícios</span>
                <p>
                  {descricaoDoProduto(detailsProduct) ||
                    "Este produto ainda não possui uma descrição cadastrada."}
                </p>
              </div>

              {detailsProduct.aiKnowledge ? (
                <div className="app-product-detail-description">
                  <span>Conhecimento aprendido pela IA</span>
                  <p className="whitespace-pre-line">{detailsProduct.aiKnowledge}</p>
                </div>
              ) : null}

              <div className="app-product-detail-metas" aria-label="Resumo do produto">
                <div>
                  <span>Status</span>
                  <strong>{detailsProduct.active ? "Principal" : "No catálogo"}</strong>
                </div>
                <div>
                  <span>Imagem</span>
                  <strong>{detailsProduct.imageUrl ? "Cadastrada" : "Sem foto"}</strong>
                </div>
                <div>
                  <span>Uso pela IA</span>
                  <strong>{detailsProduct.active ? "Ativo" : "Disponível"}</strong>
                </div>
              </div>

              <div className="app-product-detail-ai-note">
                <CheckCircle2 aria-hidden="true" />
                <p>
                  <strong>Informações usadas pela IA</strong>
                  Nome, preço e descrição ajudam a responder dúvidas e criar argumentos de venda.
                </p>
              </div>
            </div>
          </div>

          {editingDetails ? (
            <div className="app-product-editor app-product-detail-editor">
              <div className="app-product-editor-head">
                <div className="app-product-editor-summary">
                  <ProdutoThumb produto={detailsProduct} tamanho={64} />
                  <div>
                    <span>Edição automática</span>
                    <h4 title={detailsProduct.name}>{detailsProduct.name || "Produto sem nome"}</h4>
                    <p>As alterações são salvas enquanto você digita.</p>
                  </div>
                </div>
                <div className="app-product-editor-actions">
                  <label htmlFor={`produto-principal-${detailsProduct.id}`}>
                    Produto principal
                  </label>
                  <Switch
                    id={`produto-principal-${detailsProduct.id}`}
                    checked={detailsProduct.active}
                    onCheckedChange={(v) => setActiveProduct(detailsProduct.id, v)}
                  />
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--danger"
                    onClick={() => removeProduct(detailsProduct.id)}
                  >
                    <Trash2 aria-hidden="true" /> Remover
                  </button>
                </div>
              </div>

              <div className="app-product-editor-fields">
                <div className="app-field">
                  <label htmlFor="produto-nome">Nome</label>
                  <Input
                    id="produto-nome"
                    className="app-input"
                    value={detailsProduct.name}
                    onChange={(e) => updateProductField("name", e.target.value)}
                  />
                </div>
                <div className="app-field">
                  <label htmlFor="produto-preco">Preço</label>
                  <Input
                    id="produto-preco"
                    className="app-input"
                    value={detailsProduct.price}
                    onChange={(e) => updateProductField("price", e.target.value)}
                    placeholder="R$ 0,00"
                  />
                </div>
                <div className="app-field app-product-editor-wide">
                  <label htmlFor="produto-imagem">
                    <ImageIcon aria-hidden="true" /> URL da foto
                  </label>
                  <Input
                    id="produto-imagem"
                    className="app-input"
                    value={detailsProduct.imageUrl ?? ""}
                    onChange={(e) => updateProductField("imageUrl", e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="app-field app-product-editor-wide">
                  <label htmlFor="produto-desc">Descrição / benefícios</label>
                  <Textarea
                    id="produto-desc"
                    className="app-input"
                    value={detailsProduct.description}
                    onChange={(e) => updateProductField("description", e.target.value)}
                    rows={5}
                    placeholder="A IA usa este texto para responder perguntas."
                  />
                </div>
                <div className="app-field app-product-editor-wide">
                  <label htmlFor="produto-ai-knowledge">Ficha aprendida pela IA</label>
                  <Textarea
                    id="produto-ai-knowledge"
                    className="app-input"
                    value={detailsProduct.aiKnowledge ?? ""}
                    onChange={(e) => updateProductField("aiKnowledge", e.target.value)}
                    rows={7}
                    placeholder="Clique em IA aprender produto para gerar esta ficha automaticamente."
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Catálogo</h2>
          <p className="app-section-desc">
            A IA responde com base no produto marcado como principal
          </p>
        </div>

        <div className="app-card app-products-panel">
          <div className="app-products-head">
            <div>
              <div className="app-products-title-row">
                <h3 className="app-card-title">Seus produtos</h3>
                <span className="app-tag">{config.produtos.length}</span>
              </div>
              <p className="app-card-desc">
                {vitrineStatus === "ok" && vitrineAt
                  ? `Vitrine do TikTok sincronizada às ${new Date(vitrineAt).toLocaleTimeString("pt-BR")}.`
                  : "Importe a vitrine do TikTok pela extensão, ou cadastre manualmente."}
              </p>
            </div>
            <div className="app-products-actions">
              <button
                type="button"
                className="app-btn app-btn--primary"
                onClick={() => void handleImportVitrine()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <ShoppingBag aria-hidden="true" />
                )}
                Importar vitrine
              </button>
              <button type="button" className="app-btn" onClick={() => void importFromExtension()}>
                <Plus aria-hidden="true" />
                Colar catálogo
              </button>
              <button type="button" className="app-btn" onClick={addProduct}>
                <Plus aria-hidden="true" />
                Novo produto
              </button>
            </div>
          </div>

          {/* O principal fica destacado sem competir com os cards do catálogo. */}
          {activeProduct ? (
            <div className="app-product-featured">
              <div className="app-product-featured-image">
                <ProdutoThumb produto={activeProduct} preencher />
              </div>
              <div className="app-product-featured-body">
                <span className="app-product-kicker">
                  <Star aria-hidden="true" /> Produto principal
                </span>
                <h4 title={activeProduct.name}>{activeProduct.name}</h4>
                <p>{descricaoDoProduto(activeProduct) || "Sem descrição — a IA usa nome e preço."}</p>
              </div>
              <div className="app-product-featured-side">
                <strong>{formatarPreco(activeProduct) ?? "Sem preço"}</strong>
                <div className="app-product-featured-actions">
                  <button
                    type="button"
                    className="app-btn app-btn--sm"
                    onClick={() => openDetails(activeProduct.id)}
                  >
                    <Eye aria-hidden="true" /> Detalhes
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm"
                    onClick={() => openDetails(activeProduct.id, true)}
                  >
                    <Pencil aria-hidden="true" /> Editar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="app-product-no-featured">
              <Star aria-hidden="true" />
              <span>Escolha um produto principal para a IA começar a vender.</span>
            </div>
          )}

          {config.produtos.length === 0 ? (
            <div className="app-products-empty">
              <span>
                <ShoppingBag aria-hidden="true" />
              </span>
              <h4>Seu catálogo está vazio</h4>
              <p>Importe sua vitrine do TikTok ou cadastre o primeiro produto manualmente.</p>
              <button type="button" className="app-btn app-btn--primary" onClick={addProduct}>
                <Plus aria-hidden="true" /> Cadastrar produto
              </button>
            </div>
          ) : (
            <div className="app-products-grid" aria-label="Catálogo de produtos">
              {config.produtos.map((p) => {
                const preco = formatarPreco(p);
                return (
                  <article key={p.id} className="app-product-card" data-active={p.active}>
                    <button
                      type="button"
                      className="app-product-card-media"
                      onClick={() => openDetails(p.id)}
                      aria-label={`Ver detalhes de ${p.name}`}
                    >
                      <ProdutoThumb produto={p} preencher />
                      {p.active ? (
                        <span className="app-product-card-badge">
                          <Star aria-hidden="true" /> Principal
                        </span>
                      ) : null}
                    </button>
                    <div className="app-product-card-body">
                      <h4 title={p.name}>{p.name || "Produto sem nome"}</h4>
                      <strong>{preco ?? "Sem preço"}</strong>
                      <p>{descricaoDoProduto(p) || "Sem descrição cadastrada."}</p>
                    </div>
                    <div className="app-product-card-actions">
                      <button
                        type="button"
                        className="app-btn app-btn--sm app-btn--primary"
                        disabled={learningId === p.id}
                        title="Criar ficha de conhecimento para respostas, pitches e roteiros"
                        onClick={() => void learnProduct(p)}
                      >
                        {learningId === p.id ? (
                          <Loader2 aria-hidden="true" className="animate-spin" />
                        ) : (
                          <Brain aria-hidden="true" />
                        )}
                        {p.aiKnowledge ? "Reaprender" : "IA aprender"}
                      </button>
                      <button
                        type="button"
                        className="app-btn app-btn--sm"
                        onClick={() => openDetails(p.id)}
                      >
                        <Eye aria-hidden="true" /> Detalhes
                      </button>
                      {!p.active ? (
                        <button
                          type="button"
                          className="app-btn app-btn--sm app-product-main-action"
                          onClick={() => setActiveProduct(p.id, true)}
                        >
                          <Star aria-hidden="true" /> Principal
                        </button>
                      ) : null}
                      {isMaster ? (
                        <button
                          type="button"
                          className="app-btn app-btn--sm"
                          title="Enviar para Produtos Quentes"
                          aria-label={`Enviar ${p.name} para Produtos Quentes`}
                          onClick={async () => {
                            const ok = await sendHotProduct({
                              id: p.id,
                              name: p.name,
                              description: p.description ?? "",
                              price: p.price ?? "",
                              priceCents: p.priceCents ?? null,
                              currency: p.currency ?? null,
                              imageUrl: p.imageUrl ?? null,
                            });
                            if (ok) toast.success("Produto enviado para Quentes");
                            else toast.error("Falha ao enviar para Quentes");
                          }}
                        >
                          <Pin aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

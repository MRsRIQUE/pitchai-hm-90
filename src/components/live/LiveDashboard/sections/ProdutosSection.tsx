import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Pin, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { useSyncedUpdateConfig } from "@/hooks/live/useLiveControls";
import { useVitrineSync } from "@/hooks/live/useVitrineSync";
import { pushLiveConfigFields } from "@/lib/live/sync";
import { mergeVitrineProducts, newProduct, type LiveConfig, type Product } from "@/lib/live/config";
import { useHotProducts, sendHotProduct } from "@/hooks/live/useHotProducts";
import { ProdutoThumb } from "./ProdutoThumb";
import { formatarPreco } from "./produto";

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Seleciona o primeiro produto para editar se não houver nenhum selecionado
  useEffect(() => {
    if (!editingId && config.produtos[0]) {
      setEditingId(config.produtos[0].id);
    }
  }, [config.produtos, editingId]);

  const editing = config.produtos.find((p) => p.id === editingId) ?? null;
  const activeProduct = config.produtos.find((p) => p.active) ?? null;

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
    setEditingId(p.id);
  };

  // Atualiza campo de produto
  const updateProductField = <K extends keyof Product>(field: K, value: Product[K]) => {
    if (!editing) return;
    updateConfig((c) => ({
      ...c,
      produtos: c.produtos.map((p) => (p.id === editing.id ? { ...p, [field]: value } : p)),
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
    if (editingId === productId) {
      setEditingId(null);
    }
  };

  const filtro = config.autoFixar.query.trim().toLowerCase();
  const visiveis = config.produtos.filter((p) => p.name.toLowerCase().includes(filtro));
  const selecionados = (config.autoFixar.ids ?? []).length;

  return (
    <>
      <div className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Catálogo</h2>
          <p className="app-section-desc">
            A IA responde com base no produto marcado como principal
          </p>
        </div>

        <div className="app-card">
          <div className="app-card-head">
            <div>
              <h3 className="app-card-title">Seus produtos</h3>
              <p className="app-card-desc">
                {vitrineStatus === "ok" && vitrineAt
                  ? `Vitrine do TikTok sincronizada às ${new Date(vitrineAt).toLocaleTimeString("pt-BR")}.`
                  : "Importe a vitrine do TikTok pela extensão, ou cadastre manualmente."}
              </p>
            </div>
            <div className="app-toolbar" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="app-btn"
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
            </div>
          </div>

          {/* PRODUTO EM DESTAQUE: o escolhido da IA sempre visível —
              é ele que a live inteira vende. */}
          {activeProduct ? (
            <div
              className="app-card app-card--flat"
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderColor: "var(--app-accent, #7c3aed)",
              }}
            >
              <ProdutoThumb produto={activeProduct} tamanho={64} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span className="app-tag" data-tone="accent">
                    Produto principal
                  </span>
                  {formatarPreco(activeProduct) ? (
                    <span className="app-card-title" style={{ fontSize: 14 }}>
                      {formatarPreco(activeProduct)}
                    </span>
                  ) : null}
                </div>
                <p
                  className="app-card-title"
                  style={{ marginTop: 4, overflowWrap: "anywhere" }}
                  title={activeProduct.name}
                >
                  {activeProduct.name}
                </p>
                <p
                  className="app-card-desc"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {activeProduct.description || "Sem descrição — a IA usa só nome e preço."}
                </p>
              </div>
              <button
                type="button"
                className="app-btn app-btn--sm"
                onClick={() => setEditingId(activeProduct.id)}
              >
                Editar
              </button>
            </div>
          ) : (
            <p className="app-field-hint" style={{ marginTop: 16 }}>
              Nenhum produto ativo — escolha um na lista abaixo para a IA começar a vender.
            </p>
          )}

          {/* minmax(0,1fr) + min-w-0 nas colunas: o mínimo padrão do grid é o
              conteúdo, então um nome longo sem quebra (vindo da vitrine) empurra
              a coluna do editor para fora do cartão. */}
          <div className="app-grid app-grid--2" style={{ marginTop: 16 }}>
            {/* Lista de produtos */}
            <div className="min-w-0">
              <div className="app-card-head" style={{ marginBottom: 10 }}>
                <span className="app-stat-label" style={{ margin: 0 }}>
                  Lista
                </span>
                <button type="button" className="app-btn app-btn--sm" onClick={addProduct}>
                  <Plus aria-hidden="true" />
                  Novo
                </button>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                {config.produtos.length === 0 && (
                  <p className="app-field-hint">
                    Nenhum produto. Use "Importar vitrine" ou clique em "Novo".
                  </p>
                )}
                {config.produtos.map((p) => {
                  const preco = formatarPreco(p);
                  const emEdicao = editingId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`app-card app-card--flat${emEdicao ? " app-produto--editando" : ""}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        cursor: "pointer",
                        minWidth: 0,
                        maxWidth: "100%",
                        overflow: "hidden",
                        borderColor: emEdicao ? "var(--app-accent, #7c3aed)" : undefined,
                      }}
                      onClick={() => setEditingId(p.id)}
                    >
                      <ProdutoThumb produto={p} tamanho={32} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: 500,
                          }}
                          title={p.name}
                        >
                          {p.name}
                        </span>
                        <span
                          className="app-card-desc"
                          style={{
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {preco ?? "sem preço"}
                        </span>
                      </span>
                      {p.active ? (
                        <span className="app-tag" data-tone="accent" style={{ flexShrink: 0 }}>
                          Principal
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="app-btn app-btn--sm"
                          style={{ flexShrink: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveProduct(p.id, true);
                          }}
                        >
                          Tornar principal
                        </button>
                      )}
                      {isMaster && (
                        <button
                          type="button"
                          className="app-btn app-btn--sm"
                          style={{ flexShrink: 0 }}
                          title="Enviar para Produtos Quentes"
                          onClick={async (e) => {
                            e.stopPropagation();
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
                          Quente
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Editor de produto */}
            <div className="min-w-0">
              {editing ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    className="app-card app-card--flat"
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: 12 }}
                  >
                    <ProdutoThumb produto={editing} tamanho={56} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p
                        className="app-card-title"
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={editing.name}
                      >
                        {editing.name}
                      </p>
                      <p className="app-card-desc">{formatarPreco(editing) ?? "sem preço"}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="app-stat-label" style={{ margin: 0 }}>
                        Principal
                      </span>
                      <Switch
                        checked={editing.active}
                        onCheckedChange={(v) => setActiveProduct(editing.id, v)}
                      />
                      <button
                        type="button"
                        className="app-btn app-btn--sm app-btn--danger"
                        title="Remover produto"
                        onClick={() => {
                          removeProduct(editing.id);
                          setEditingId(null);
                        }}
                      >
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="app-field">
                    <label htmlFor="produto-nome">Nome</label>
                    <Input
                      id="produto-nome"
                      className="app-input"
                      value={editing.name}
                      onChange={(e) => updateProductField("name", e.target.value)}
                    />
                  </div>
                  <div className="app-field">
                    <label htmlFor="produto-preco">Preço</label>
                    <Input
                      id="produto-preco"
                      className="app-input"
                      value={editing.price}
                      onChange={(e) => updateProductField("price", e.target.value)}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <div className="app-field">
                    <label htmlFor="produto-desc">Descrição / benefícios</label>
                    <Textarea
                      id="produto-desc"
                      className="app-input"
                      value={editing.description}
                      onChange={(e) => updateProductField("description", e.target.value)}
                      rows={4}
                      placeholder="A IA usa este texto para responder perguntas."
                    />
                  </div>
                </div>
              ) : (
                <p className="app-field-hint">Selecione ou crie um produto para editar.</p>
              )}
            </div>
          </div>
        </div>
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

/**
 * ProductsSection - Componente para gerenciamento de produtos
 * Parte do LiveDashboard
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { mergeVitrineProducts, newProduct, type Product } from "@/lib/live/config";
import { useVitrineSync } from "@/hooks/live/useVitrineSync";
import { ProdutoThumb } from "./sections/ProdutoThumb";
import { formatarPreco } from "./sections/produto";

export interface ProductsSectionProps {
  compact?: boolean;
}

export function ProductsSection({ compact = false }: ProductsSectionProps) {
  const { config, vitrineItems, vitrineStatus, vitrineAt, loading, updateConfig } = useLiveStore(
    useShallow((state) => ({
      config: state.config,
      vitrineItems: state.vitrineItems,
      vitrineStatus: state.vitrineStatus,
      vitrineAt: state.vitrineAt,
      loading: state.loading,
      updateConfig: state.actions.updateConfig,
    })),
  );

  // O ciclo automático é do LiveDashboard, que já monta este componente.
  // Ligar autoSync aqui também dobrava as leituras do Firestore a cada 20s.
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
    updateConfig((c) => ({
      ...c,
      produtos: c.produtos.filter((p) => p.id !== productId),
    }));
    if (editingId === productId) {
      setEditingId(null);
    }
  };

  /**
   * Mensagem de status da vitrine.
   *
   * A lista renderizada abaixo vem de `config.produtos` (catálogo do usuário),
   * mas o status vinha só de `vitrineStatus`, que é calculado em cima dos itens
   * que a extensão raspou da vitrine (`produtos[].fromVitrine` no doc
   * compartilhado). Como produto importado ou criado à mão não carrega essa
   * marca, o painel listava os produtos e, do lado, avisava que não havia
   * nenhum. Agora o aviso de "sem produtos" só sai quando as duas fontes estão
   * vazias de verdade.
   */
  const totalProdutos = config.produtos.length;
  const totalVitrine = vitrineItems.length;

  const getVitrineStatusMessage = () => {
    if (totalProdutos === 0 && totalVitrine === 0) {
      return vitrineStatus === "vazia"
        ? "Nenhum produto ainda. Abra o Gerenciador de LIVE do TikTok com a extensão Pitch AI ativa, ou cadastre um produto aqui."
        : "Importe a vitrine do TikTok pela extensão, ou adicione manualmente.";
    }

    const catalogo = `${totalProdutos} produto${totalProdutos === 1 ? "" : "s"} no seu catálogo`;

    if (vitrineStatus === "ok" && vitrineAt) {
      return `${catalogo} · vitrine do TikTok sincronizada às ${new Date(vitrineAt).toLocaleTimeString("pt-BR")}.`;
    }
    if (vitrineStatus === "vazia") {
      return `${catalogo} · a vitrine do TikTok não trouxe itens novos.`;
    }
    return `${catalogo} · sincronize a vitrine do TikTok para trazer o resto.`;
  };

  if (compact) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Produtos</h4>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleImportVitrine} disabled={importing || loading.vitrine}>
              {importing || loading.vitrine ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShoppingBag className="h-3.5 w-3.5" />
              )}
              Importar
            </Button>
            <Button size="sm" variant="outline" onClick={addProduct}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{getVitrineStatusMessage()}</p>

        {config.produtos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum produto. Adicione um.</p>
        ) : (
          <div className="space-y-2">
            {config.produtos.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-2 rounded border text-xs ${
                  p.active ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${p.active ? "bg-primary" : "bg-muted"}`}
                  />
                  <ProdutoThumb produto={p} tamanho={28} />
                  <span className="min-w-0 flex-1 truncate" title={p.name}>
                    {p.name}
                  </span>
                  {formatarPreco(p) ? (
                    <span className="shrink-0 text-muted-foreground">{formatarPreco(p)}</span>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Switch
                    checked={p.active}
                    onCheckedChange={(v) => setActiveProduct(p.id, v)}
                    className="h-5 w-8"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setEditingId(p.id)}
                  >
                    ✏️
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <h4 className="mb-3 font-display text-sm font-semibold">
        Produtos
        <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
          a IA responde com base no produto marcado como ATIVO
        </span>
      </h4>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{getVitrineStatusMessage()}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleImportVitrine} disabled={importing || loading.vitrine}>
              {importing || loading.vitrine ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShoppingBag className="h-3.5 w-3.5" />
              )}
              Importar vitrine do TikTok
            </Button>
            <Button size="sm" variant="secondary" onClick={importFromExtension}>
              <Loader2 className={`h-3.5 w-3.5 ${loading.vitrine ? "animate-spin" : "hidden"}`} />
              <ShoppingBag className={`h-3.5 w-3.5 ${loading.vitrine ? "hidden" : ""}`} />
              Colar catálogo
            </Button>
          </div>
        </div>

        {/* minmax(0,1fr) + min-w-0 nas colunas: o mínimo padrão do grid é o
            conteúdo, então um nome longo sem quebra (vindo da vitrine) empurra
            a coluna do editor para fora do cartão. */}
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          {/* Lista de produtos */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Seus produtos
              </span>
              <Button size="sm" variant="outline" onClick={addProduct}>
                <Plus className="h-3.5 w-3.5" />
                Novo
              </Button>
            </div>

            <div className="space-y-1">
              {config.produtos.length === 0 && (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Nenhum produto. Clique em "+ Novo".
                </p>
              )}
              {config.produtos.map((p) => {
                const preco = formatarPreco(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => setEditingId(p.id)}
                    title={p.name}
                    className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                      editingId === p.id ? "bg-primary/15 text-foreground" : "hover:bg-accent"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        p.active ? "bg-primary" : "bg-muted-foreground/40"
                      }`}
                    />
                    <ProdutoThumb produto={p} tamanho={32} />
                    {/* min-w-0 é o que faz o truncate valer: sem ele o filho flex
                        usa min-width auto e se recusa a encolher abaixo do texto. */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {preco ?? "sem preço"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor de produto */}
          <div className="min-w-0">
            {editing ? (
              <div className="space-y-3">
                {/* Como o produto vai aparecer para o usuário: foto (ou fallback)
                    e preço já formatado. É a prévia do que a vitrine vai preencher. */}
                <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border/60 p-3">
                  <ProdutoThumb produto={editing} tamanho={56} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" title={editing.name}>
                      {editing.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatarPreco(editing) ?? "sem preço"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Editar produto
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs">
                      Ativo
                      <Switch
                        checked={editing.active}
                        onCheckedChange={(v) => setActiveProduct(editing.id, v)}
                      />
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        removeProduct(editing.id);
                        setEditingId(null);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    Nome
                  </label>
                  <Input
                    value={editing.name}
                    onChange={(e) => updateProductField("name", e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    Preço
                  </label>
                  <Input
                    value={editing.price}
                    onChange={(e) => updateProductField("price", e.target.value)}
                    placeholder="R$ 0,00"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                    Descrição / benefícios
                  </label>
                  <Textarea
                    value={editing.description}
                    onChange={(e) => updateProductField("description", e.target.value)}
                    rows={4}
                    placeholder="A IA usa este texto para responder perguntas."
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecione ou crie um produto para editar.
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

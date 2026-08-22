/**
 * AiConfigSection - Componente para configuração do contexto da IA
 * Parte do LiveDashboard
 */
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Brain, CheckCircle2, Loader2, Package, Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { PresetPicker } from "../PresetPicker";
import {
  EMPTY_PRODUCT_AI_SALES_CONTEXT,
  type AIContext,
  type ProductAISalesContext,
} from "@/lib/live/config";
import { pushLiveConfigFields } from "@/lib/live/sync";
import { formatarPreco } from "./sections/produto";

export interface AiConfigSectionProps {
  compact?: boolean;
}

export function AiConfigSection({ compact = false }: AiConfigSectionProps) {
  const [saving, setSaving] = useState(false);
  const { config, updateConfig } = useLiveStore(
    useShallow((state) => ({
      config: state.config,
      updateConfig: state.actions.updateConfig,
    })),
  );

  // Função para atualizar o contexto da IA
  const updateContext = <K extends keyof AIContext>(key: K, value: AIContext[K]) => {
    updateConfig((c) => ({
      ...c,
      aiContext: { ...c.aiContext, [key]: value },
    }));
  };

  const activateProduct = (productId: string) => {
    updateConfig((current) => ({
      ...current,
      produtos: current.produtos.map((produto) => ({
        ...produto,
        active: produto.id === productId,
      })),
    }));
  };

  const selectedProduct =
    config.produtos.find((produto) => produto.active) ?? config.produtos[0] ?? null;

  const updateProductContext = (key: keyof ProductAISalesContext, value: string) => {
    if (!selectedProduct) return;
    updateConfig((current) => {
      const previous = {
        ...EMPTY_PRODUCT_AI_SALES_CONTEXT,
        ...(current.productAiSalesContexts[selectedProduct.id] ?? {}),
        ...(current.produtos.find((produto) => produto.id === selectedProduct.id)?.aiSalesContext ??
          {}),
      };
      const nextContext = { ...previous, [key]: value };
      return {
        ...current,
        productAiSalesContexts: {
          ...current.productAiSalesContexts,
          [selectedProduct.id]: nextContext,
        },
        produtos: current.produtos.map((produto) =>
          produto.id === selectedProduct.id
            ? { ...produto, active: true, aiSalesContext: nextContext }
            : { ...produto, active: false },
        ),
      };
    });
  };

  const saveAiContext = async () => {
    setSaving(true);
    try {
      const latest = useLiveStore.getState().config;
      const saved = await pushLiveConfigFields({
        aiContext: latest.aiContext,
        productAiSalesContexts: latest.productAiSalesContexts,
      });
      if (!saved) throw new Error("Entre novamente para sincronizar com a extensão.");
      toast.success("Contexto da IA salvo", {
        description: "A marca e as fichas por produto foram salvas na nuvem para sincronização.",
      });
    } catch (error) {
      toast.error("Não foi possível salvar o contexto", {
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (compact) {
    return (
      <Card className="p-4">
        <h4 className="mb-3 font-semibold text-sm">Contexto da IA</h4>
        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Nome da marca
            </label>
            <Input
              value={config.aiContext.brandName}
              onChange={(e) => updateContext("brandName", e.target.value)}
              placeholder="Ex: Loja da Ana"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Nicho
            </label>
            <Input
              value={config.aiContext.niche}
              onChange={(e) => updateContext("niche", e.target.value)}
              placeholder="Ex: Moda feminina plus size"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Tom de voz
            </label>
            <Input
              value={config.aiContext.tone}
              onChange={(e) => updateContext("tone", e.target.value)}
              placeholder="Ex: empolgado e amigável"
            />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h4 className="font-display text-sm font-semibold">
          Contexto da IA
          <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
            a IA usa isso em toda resposta e em cada roteiro
          </span>
        </h4>
      </div>

      <div className="app-cols">
        <Card className="min-w-0 p-4">
          <div className="app-card-head">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                <Sparkles className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="app-card-title">Contexto automático</h3>
                <p className="app-card-desc">
                  Recebe o roteiro pronto e separa cada parte para o produto selecionado.
                </p>
              </div>
            </div>
            <span className="app-tag" data-tone="accent">
              Roteiro → IA
            </span>
          </div>

          <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Package className="h-3.5 w-3.5" />
              Produtos disponíveis para a IA
            </div>
            {config.produtos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {config.produtos.map((produto) => (
                  <button
                    key={produto.id}
                    type="button"
                    onClick={() => activateProduct(produto.id)}
                    className={`inline-flex min-w-0 max-w-[min(280px,100%)] items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      produto.active
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:border-primary/35 hover:text-foreground"
                    }`}
                    title={produto.name}
                  >
                    {produto.active && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    {/* min-w-0 no próprio span: como filho flex ele nasce com
                      min-width auto e o truncate não teria efeito nenhum. */}
                    <span className="min-w-0 truncate">{produto.name}</span>
                    {formatarPreco(produto) ? (
                      <span className="shrink-0 opacity-70">{formatarPreco(produto)}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum produto sincronizado. Use “Sincronizar vitrine” para carregar sua lista.
              </p>
            )}
            {config.produtos.some((produto) => produto.active) && (
              <p className="mt-2 line-clamp-2 text-xs text-primary">
                Produto ativo: {config.produtos.find((produto) => produto.active)?.name}
              </p>
            )}
          </div>

          {selectedProduct ? (
            <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
              <div className="mb-4 flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-semibold">
                    Contexto de venda: {selectedProduct.name}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cada campo pertence somente a este produto. O botão da aba Roteiros preenche
                    estas partes automaticamente.
                  </p>
                </div>
              </div>
              <div className="grid gap-4">
                {(
                  [
                    ["hook", "Gancho", "Abertura curta para capturar atenção."],
                    [
                      "painDesire",
                      "Dor ou desejo",
                      "Situação que conecta o produto à necessidade da pessoa.",
                    ],
                    [
                      "benefits",
                      "Demonstração e benefícios",
                      "Ganhos, usos e diferenciais confirmados.",
                    ],
                    [
                      "objectionResponse",
                      "Objeção e resposta",
                      "Dúvidas comuns e respostas honestas.",
                    ],
                    [
                      "chatInteraction",
                      "Interação com o chat",
                      "Perguntas e convites para envolver o público.",
                    ],
                    ["cta", "Fechamento e CTA", "Forma natural de conduzir para o clique."],
                  ] as const
                ).map(([key, label, placeholder]) => (
                  <div className="app-field" key={key}>
                    <label htmlFor={`produto-ia-${key}`}>{label}</label>
                    <Textarea
                      id={`produto-ia-${key}`}
                      className="app-input"
                      rows={7}
                      maxLength={4_000}
                      value={
                        selectedProduct.aiSalesContext?.[key] ??
                        config.productAiSalesContexts[selectedProduct.id]?.[key] ??
                        EMPTY_PRODUCT_AI_SALES_CONTEXT[key]
                      }
                      onChange={(event) => updateProductContext(key, event.currentTarget.value)}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="app-empty">
              <p className="app-empty-title">Nenhum produto selecionado</p>
              <p>Sincronize sua vitrine e aplique um roteiro para preencher este bloco.</p>
            </div>
          )}
        </Card>

        <Card className="min-w-0 p-4">
          <div className="app-card-head">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground ring-1 ring-inset ring-border">
                <Brain className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="app-card-title">Contexto manual</h3>
                <p className="app-card-desc">
                  Informações gerais da marca, usadas em todos os produtos e respostas.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <PresetPicker cfg={config} setCfg={updateConfig} />
          </div>

          <div className="grid gap-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Nome da marca
              </label>
              <Input
                value={config.aiContext.brandName}
                onChange={(e) => updateContext("brandName", e.target.value)}
                placeholder="Ex: Loja da Ana"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Nicho / categoria
              </label>
              <Input
                value={config.aiContext.niche}
                onChange={(e) => updateContext("niche", e.target.value)}
                placeholder="Ex: Moda feminina plus size"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Tom de voz
              </label>
              <Input
                value={config.aiContext.tone}
                onChange={(e) => updateContext("tone", e.target.value)}
                placeholder="Ex: empolgado e amigável"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Público-alvo
              </label>
              <Input
                value={config.aiContext.targetAudience}
                onChange={(e) => updateContext("targetAudience", e.target.value)}
                placeholder="Ex: mulheres 25-45"
              />
            </div>
            <div className="mt-2 border-t border-border/60 pt-4">
              <div className="mb-1 text-sm font-semibold">Base de conhecimento</div>
              <p className="mb-3 text-xs text-muted-foreground">
                Separe fatos, políticas e dúvidas comuns. Assim a IA encontra a resposta certa sem
                inventar nem vasculhar um texto enorme.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Diferenciais confirmados
              </label>
              <Textarea
                value={config.aiContext.differentials}
                onChange={(e) => updateContext("differentials", e.target.value)}
                rows={3}
                placeholder="Ex: fabricação própria; tecido respirável; acompanha cabo e estojo. Um fato por linha."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Políticas e condições
              </label>
              <Textarea
                value={config.aiContext.policies}
                onChange={(e) => updateContext("policies", e.target.value)}
                rows={4}
                placeholder="Frete, prazo, troca, garantia, formas de pagamento e condições reais."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Perguntas e objeções frequentes
              </label>
              <Textarea
                value={config.aiContext.frequentQuestions}
                onChange={(e) => updateContext("frequentQuestions", e.target.value)}
                rows={4}
                placeholder={
                  "Ex:\n“É original?” — Sim, com nota fiscal.\n“Serve em iPhone?” — modelos 11 ou superior."
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Estratégia de conversa e venda
              </label>
              <Textarea
                value={config.aiContext.salesPlaybook}
                onChange={(e) => updateContext("salesPlaybook", e.target.value)}
                rows={3}
                placeholder="Ex: seja consultiva; pergunte a necessidade antes do pitch; destaque praticidade; convide ao carrinho quando houver interesse."
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Regras (o que NUNCA fazer)
              </label>
              <Textarea
                value={config.aiContext.rules}
                onChange={(e) => updateContext("rules", e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Contexto extra (diferencial, promoções, frete, entrega...)
              </label>
              <Textarea
                value={config.aiContext.extraContext}
                onChange={(e) => updateContext("extraContext", e.target.value)}
                rows={3}
                placeholder="Ex: Frete grátis acima de R$150. Entregamos em 3 dias úteis. Trocas em até 7 dias."
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground">
          Salva o contexto automático por produto e o contexto manual da marca.
        </p>
        <button
          type="button"
          className="app-btn app-btn--primary"
          onClick={() => void saveAiContext()}
          disabled={saving}
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Salvando..." : "Salvar contexto da IA"}
        </button>
      </div>
    </div>
  );
}

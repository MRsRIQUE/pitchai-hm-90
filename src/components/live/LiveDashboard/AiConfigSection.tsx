/**
 * AiConfigSection - Componente para configuração do contexto da IA
 * Parte do LiveDashboard
 */
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Brain, CheckCircle2, Package } from "lucide-react";
import { useLiveStore } from "@/stores/useLiveStore";
import { useShallow } from "zustand/react/shallow";
import { PresetPicker } from "../PresetPicker";
import { type AIContext } from "@/lib/live/config";
import { formatarPreco } from "./sections/produto";

export interface AiConfigSectionProps {
  compact?: boolean;
}

export function AiConfigSection({ compact = false }: AiConfigSectionProps) {
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
      <h4 className="mb-3 font-display text-sm font-semibold">
        Contexto da IA
        <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">
          a IA usa isso em toda resposta e em cada roteiro
        </span>
      </h4>

      <div className="mb-3">
        <PresetPicker cfg={config} setCfg={updateConfig} />
      </div>

      <Card className="p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
            <Brain className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </div>
          <p className="text-sm text-muted-foreground">
            Preencha uma vez. Vira o "cérebro" da IA — combina com os produtos ativos para responder
            no chat e gerar roteiros.
          </p>
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
                  {produto.active && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
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

        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              Regras (o que NUNCA fazer)
            </label>
            <Textarea
              value={config.aiContext.rules}
              onChange={(e) => updateContext("rules", e.target.value)}
              rows={3}
            />
          </div>
          <div className="sm:col-span-2">
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
  );
}

/**
 * AiConfigSection - Componente para configuração do contexto da IA
 * Parte do LiveDashboard
 */
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Brain } from "lucide-react";
import { useLiveStore } from "@/stores/useLiveStore";
import { PresetPicker } from "../PresetPicker";
import { type AIContext } from "@/lib/live/config";

export interface AiConfigSectionProps {
  compact?: boolean;
}

export function AiConfigSection({ compact = false }: AiConfigSectionProps) {
  const { config, updateConfig } = useLiveStore((state) => ({
    config: state.config,
    updateConfig: state.actions.updateConfig,
  }));

  // Função para atualizar o contexto da IA
  const updateContext = <K extends keyof AIContext>(key: K, value: AIContext[K]) => {
    updateConfig((c) => ({
      ...c,
      aiContext: { ...c.aiContext, [key]: value },
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
    <div id="sec-contexto" className="scroll-mt-24 pt-2">
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

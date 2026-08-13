import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NICHE_PRESETS, applyPreset } from "@/lib/live/presets";
import type { LiveConfig } from "@/lib/live/config";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PresetPicker({
  cfg,
  setCfg,
}: {
  cfg: LiveConfig;
  setCfg: (updater: (cfg: LiveConfig) => LiveConfig) => void;
}) {
  const escolher = (id: string) => {
    const preset = NICHE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setCfg((c) => ({
      ...c,
      preset: preset.id,
      aiContext: applyPreset(c.aiContext, preset),
    }));
    toast.success(`Preset ${preset.label} aplicado`, {
      description: "Você pode editar qualquer campo depois.",
    });
  };

  return (
    <Card className="p-4">
      <div className="mb-1 text-sm font-semibold">Comece por um preset do seu nicho</div>
      <p className="mb-3 text-xs text-muted-foreground">
        Preenche tom de voz, público, regras e as objeções mais comuns. Tudo continua editável.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {NICHE_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant={cfg.preset === p.id ? "default" : "outline"}
            className={cn("h-auto flex-col items-start gap-0.5 py-2.5 text-left")}
            onClick={() => escolher(p.id)}
          >
            <span className="text-sm font-semibold">
              {p.emoji} {p.label}
            </span>
            <span
              className={cn(
                "text-[11px] font-normal",
                cfg.preset === p.id ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {p.hint}
            </span>
          </Button>
        ))}
      </div>
    </Card>
  );
}

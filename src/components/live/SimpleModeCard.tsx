import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "@tanstack/react-router";
import { ShoppingBag, Sparkles, Volume2, ShieldCheck, Settings2 } from "lucide-react";
import type { LiveConfig } from "@/lib/live/config";
import { VOICES } from "@/lib/live/voices";
import { cn } from "@/lib/utils";
import { ExtensionStatusBanner } from "@/components/live/ExtensionStatusBanner";

export function SimpleModeCard({
  cfg,
  setCfg,
  onAdvanced,
  syncToken,
}: {
  cfg: LiveConfig;
  setCfg: (updater: (cfg: LiveConfig) => LiveConfig) => void;
  onAdvanced: () => void;
  syncToken?: string;
}) {
  const ativo = cfg.produtos.find((p) => p.active) ?? null;
  const voz = VOICES.find((v) => v.id === cfg.voz.id);

  const setAtivo = (id: string) =>
    setCfg((c) => ({
      ...c,
      produtos: c.produtos.map((p) => ({ ...p, active: p.id === id })),
    }));

  return (
    <Card className="space-y-4 p-5">
      <ExtensionStatusBanner syncToken={syncToken} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold">Sua live em 1 tela</h2>
          <p className="text-xs text-muted-foreground">
            Escolha o produto, confira o que está ligado e comece.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onAdvanced} className="shrink-0">
          <Settings2 className="mr-1.5 h-3.5 w-3.5" />
          Avançado
        </Button>
      </div>

      {/* Produto ativo */}
      <div className="rounded-xl border border-border/60 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Produto que a IA vai vender
        </div>
        {cfg.produtos.length === 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted-foreground">Nenhum produto ainda.</p>
            <Button size="sm" variant="outline" onClick={onAdvanced}>
              Cadastrar produto
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {cfg.produtos.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setAtivo(p.id)}
                  className={cn(
                    "max-w-[220px] truncate rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                    p.active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-card",
                  )}
                >
                  {p.name}
                  {p.price ? ` · ${p.price}` : ""}
                </button>
              ))}
            </div>
            {ativo?.description && (
              <p className="line-clamp-2 text-xs text-muted-foreground">{ativo.description}</p>
            )}
          </div>
        )}
      </div>

      {/* Status — liga/desliga o essencial */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Toggle
          icon={<Sparkles className="h-4 w-4 text-primary" />}
          label="IA responde o chat"
          checked={cfg.respostasIA}
          onChange={(v) => setCfg((c) => ({ ...c, respostasIA: v }))}
        />
        <Toggle
          icon={<ShieldCheck className="h-4 w-4 text-primary" />}
          label="Proteção da live"
          checked={cfg.protecaoGeral}
          onChange={(v) => setCfg((c) => ({ ...c, protecaoGeral: v }))}
        />
        <Toggle
          icon={<Volume2 className="h-4 w-4 text-primary" />}
          label={`Voz: ${voz?.label ?? "padrão"}`}
          checked={cfg.notificacoesVenda}
          onChange={(v) => setCfg((c) => ({ ...c, notificacoesVenda: v }))}
          hint="avisa cada venda"
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Precisa de roteiro, filtros, escolha de voz ou o passo a passo do áudio?{" "}
        <button
          type="button"
          onClick={onAdvanced}
          className="font-medium text-primary hover:underline"
        >
          Abrir modo avançado
        </button>
        {" · "}
        <Link to="/download" className="font-medium text-primary hover:underline">
          Baixar extensão
        </Link>
      </p>
    </Card>
  );
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        {icon}
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{label}</div>
          {hint && <div className="truncate text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

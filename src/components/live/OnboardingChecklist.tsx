import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Circle, ChevronDown, ChevronRight, Rocket } from "lucide-react";
import {
  ONBOARDING_STEPS,
  loadOnboarding,
  saveOnboarding,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/live/onboarding";

export function OnboardingChecklist({ onJump }: { onJump?: (step: OnboardingStep) => void }) {
  const [state, setState] = useState<OnboardingState>(() => loadOnboarding());
  const [open, setOpen] = useState(true);

  useEffect(() => {
    saveOnboarding(state);
  }, [state]);

  const done = useMemo(() => ONBOARDING_STEPS.filter((s) => state[s.id]).length, [state]);
  const total = ONBOARDING_STEPS.length;
  const pct = Math.round((done / total) * 100);
  const complete = done === total;

  function toggle(id: OnboardingStep) {
    setState((s) => ({ ...s, [id]: !s[id] }));
  }

  if (complete && !open) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">
              Primeiros passos {complete ? "· concluído 🎉" : `(${done}/${total})`}
            </div>
            <div className="text-xs text-muted-foreground">
              Configure em 6 passos e comece a vender com IA.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden w-32 sm:block">
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <ol className="mt-4 space-y-2">
          {ONBOARDING_STEPS.map((step, i) => {
            const isDone = state[step.id];
            return (
              <li
                key={step.id}
                className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                  isDone ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(step.id)}
                  className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border-2 transition ${
                    isDone
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40 text-transparent hover:border-primary"
                  }`}
                  aria-label={isDone ? "Desmarcar" : "Marcar como feito"}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span className={isDone ? "line-through opacity-70" : ""}>{step.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{step.description}</div>
                </div>
                {onJump && !isDone && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-shrink-0"
                    onClick={() => onJump(step.id)}
                  >
                    Ir
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

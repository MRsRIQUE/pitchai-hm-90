import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useUserSubscription } from "@/hooks/useUserSubscription";

const AMBER = {
  wrap: "rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm",
  text: "text-white/75",
  strong: "text-amber-300",
  icon: "h-5 w-5 shrink-0 text-amber-400",
  cta: "shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-center font-bold text-black transition hover:bg-amber-300",
};

const RED = {
  wrap: "rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm",
  text: "text-white/75",
  strong: "text-red-300",
  icon: "h-5 w-5 shrink-0 text-red-400",
  cta: "shrink-0 rounded-lg bg-red-400 px-4 py-2 text-center font-bold text-black transition hover:bg-red-300",
};

/**
 * Avisos proativos de consumo e vencimento, no design do /app:
 * - tokens restantes <= 10% da franquia mensal (âmbar);
 * - fim do acesso em <= 7 dias (âmbar) e <= 3 dias (vermelho).
 * Usado no topo de /planos; não renderiza nada sem acesso ativo.
 */
export function SubscriptionNotice() {
  const { isPaidActive, isComped, tokenRemainingPct, daysUntilExpiry } = useUserSubscription();

  if (!isPaidActive) return null;

  const warnings: ReactNode[] = [];

  if (tokenRemainingPct <= 10) {
    warnings.push(
      <div key="tokens" className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${AMBER.wrap}`}>
        <div className="flex items-start gap-3">
          <Sparkles className={AMBER.icon} />
          <p className={AMBER.text}>
            <strong className={AMBER.strong}>
              Restam apenas {tokenRemainingPct}% dos seus tokens de IA este mês.
            </strong>{" "}
            Amplie sua franquia para continuar sem interrupções.
          </p>
        </div>
        <Link to="/planos" className={AMBER.cta}>
          Ver planos
        </Link>
      </div>,
    );
  }

  if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
    const critical = daysUntilExpiry <= 3;
    const tone = critical ? RED : AMBER;
    const label = daysUntilExpiry === 1 ? "1 dia" : `${daysUntilExpiry} dias`;
    warnings.push(
      <div key="expiry" className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${tone.wrap}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={tone.icon} />
          <p className={tone.text}>
            <strong className={tone.strong}>
              {isComped
                ? `Sua cortesia vence em ${label} — assine um plano para não perder o acesso.`
                : `Sua assinatura vence em ${label} — renove para não perder o acesso.`}
            </strong>
          </p>
        </div>
        <Link to="/planos" className={tone.cta}>
          Renovar agora
        </Link>
      </div>,
    );
  }

  if (warnings.length === 0) return null;
  return <div className="mb-5 space-y-3">{warnings}</div>;
}
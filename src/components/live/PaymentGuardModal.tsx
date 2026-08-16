import { Lock, CheckCircle2, ExternalLink, Sparkles, ShieldAlert, Zap } from "lucide-react";
import { PITCHAI_PLANS, formatBRL, type PitchaiPlan } from "@/lib/live/plans";

function checkoutUrl(plan: PitchaiPlan): string {
  return "/comprar?plan=" + encodeURIComponent(plan.priceId);
}

export function PaymentGuardOverlay() {
  return (
    <div className="relative z-50 flex min-h-[600px] w-full flex-col items-center justify-center rounded-3xl border border-purple-500/30 bg-[#120826]/95 p-6 text-white shadow-2xl backdrop-blur-2xl sm:p-10">
      <div className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-[#FF8C00]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-[#7C3AED]/30 blur-3xl" />

      <div className="relative z-10 flex max-w-2xl flex-col items-center text-center">
        <div className="mb-4 inline-flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/20 text-amber-400 shadow-lg">
          <Lock className="h-8 w-8" />
        </div>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-900/60 px-4 py-1 text-xs font-bold text-purple-200">
          <Zap className="h-3.5 w-3.5 text-[#FF8C00]" />
          <span>Acesso restrito ao assinante</span>
        </div>
        <h2 className="font-display text-2xl font-extrabold text-white sm:text-3xl">
          Ferramenta bloqueada — libere seu acesso
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
          Assine com segurança pelo Stripe. O acesso é liberado automaticamente pelo webhook assim
          que o pagamento for confirmado.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#FF8C00] px-5 py-2 text-xs font-bold text-white shadow-md">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Assinar com Stripe</span>
        </div>
      </div>

      <div className="relative z-10 mt-8 w-full max-w-4xl">
        <div className="grid gap-4 sm:grid-cols-3">
          {PITCHAI_PLANS.map((plan) => (
            <div
              key={plan.priceId}
              className={
                "relative flex flex-col justify-between rounded-2xl border p-5 transition-all " +
                (plan.highlight
                  ? "scale-105 border-[#FF8C00] bg-gradient-to-b from-[#2A004D] to-[#180033] shadow-[0_0_30px_rgba(255,140,0,0.3)]"
                  : "border-white/10 bg-white/5 hover:border-white/20")
              }
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#FF8C00] px-3 py-0.5 text-[10px] font-black text-white shadow">
                  {plan.badge}
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">
                    {formatBRL(plan.amountCents)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {plan.months === 1 ? "/mês" : plan.months === 3 ? "/3 meses" : "/ano"}
                  </span>
                </div>
                <ul className="mt-4 space-y-2 border-t border-white/10 pt-3 text-xs text-slate-300">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>Pitch automático na live</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>Respostas de chat com IA</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>Automação da vitrine</span>
                  </li>
                </ul>
              </div>
              <a
                href={checkoutUrl(plan)}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  "mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-xs font-extrabold shadow-md transition-all " +
                  (plan.highlight
                    ? "bg-[#FF8C00] text-white shadow-lg hover:bg-[#E07B00]"
                    : "bg-white/10 text-white hover:bg-white/20")
                }
              >
                <span>Comprar plano {plan.name}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
          <ShieldAlert className="h-3.5 w-3.5 text-emerald-400" />
          <span>Pagamento processado pelo Stripe e acesso liberado automaticamente.</span>
        </p>
      </div>
    </div>
  );
}

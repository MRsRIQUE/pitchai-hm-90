import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Sparkles, Volume2, VolumeX, ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { SiteNav } from "@/components/live/SiteNav";
import { useUserSubscription } from "@/hooks/useUserSubscription";
import {
  PITCHAI_PLANS,
  PLAN_FEATURES,
  FREE_LIMITS,
  formatBRL,
  monthlyEquivalent,
} from "@/lib/live/plans";

export const Route = createFileRoute("/planos")({
  component: PlanosPage,
  head: () => ({
    meta: [
      { title: "Planos do Pitch AI — A partir de R$ 27,90" },
      {
        name: "description",
        content:
          "IA que vende ao vivo no TikTok Shop. Mensal R$ 27,90 (respostas em texto), Trimestral R$ 67,90 (com voz e áudio) ou Anual R$ 117,90 (com voz e áudio).",
      },
      { property: "og:title", content: "Planos do Pitch AI a partir de R$ 27,90" },
      {
        property: "og:description",
        content:
          "Escolha o ciclo ideal para suas lives no TikTok Shop. Planos Trimestral e Anual incluem áudio e voz em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PlanosPage() {
  const { subscription: sub, isPaidActive: isActive, isComped, userId } = useUserSubscription();

  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white">
      <SiteNav tone="dark" />
      <div className="mx-auto max-w-5xl px-4 py-12">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3">Escolha seu plano do Pitch AI</h1>
          <p className="text-white/70 max-w-2xl mx-auto text-base">
            O plano <span className="font-semibold text-amber-300">Mensal</span> inclui todas as
            respostas automáticas via chat por texto. Os planos{" "}
            <span className="font-semibold text-[#00E676]">Trimestral</span> e{" "}
            <span className="font-semibold text-[#00E676]">Anual</span> liberam a voz e narração de
            áudio da IA em tempo real!
          </p>
          {!userId && (
            <p className="mt-4 text-sm text-orange-300">
              <Link to="/entrar" search={{ next: "/planos" }} className="underline">
                Entre na sua conta
              </Link>{" "}
              para manter seus dados e token sincronizados.
            </p>
          )}
          {isComped && sub?.granted_until && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#00E676]/10 px-4 py-2 text-sm text-[#00E676]">
              <Sparkles className="w-4 h-4" />
              Você tem acesso cortesia liberado até{" "}
              {new Date(sub.granted_until).toLocaleDateString("pt-BR")}
            </p>
          )}
        </header>

        <div className="grid gap-6 md:grid-cols-3">
          {PITCHAI_PLANS.map((p) => (
            <div
              key={p.priceId}
              className={`relative flex flex-col justify-between rounded-2xl border p-6 transition-all ${
                p.highlight
                  ? "border-[#7C3AED] bg-[#7C3AED]/10 shadow-[0_0_40px_rgba(124,58,237,0.2)]"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#FF6B35] px-3.5 py-1 text-xs font-bold text-white shadow">
                  {p.badge}
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold">{p.name}</h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold">{formatBRL(p.amountCents)}</span>
                  <span className="text-white/60 text-sm font-medium">
                    {p.months === 1 ? "/mês" : p.months === 12 ? "/ano" : "/trimestre"}
                  </span>
                </div>
                {p.months > 1 && (
                  <div className="mt-1 text-xs text-white/50">
                    equivale a <strong className="text-white/80">{monthlyEquivalent(p)}</strong> por
                    mês
                  </div>
                )}

                {/* Tag de Recurso de Áudio da IA */}
                <div className="mt-5">
                  {p.allowAudio ? (
                    <div className="flex items-start gap-2 rounded-xl bg-[#00E676]/10 border border-[#00E676]/30 p-3 text-xs text-[#00E676]">
                      <Volume2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block font-bold">Voz e Áudio Liberados</strong>
                        <span className="text-white/80 text-[11px] leading-tight block mt-0.5">
                          {p.audioNote}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-300">
                      <VolumeX className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                      <div>
                        <strong className="block font-bold flex items-center gap-1">
                          Áudio / Voz Bloqueado <Lock className="w-3 h-3 text-amber-400" />
                        </strong>
                        <span className="text-amber-200/90 text-[11px] leading-tight block mt-0.5">
                          Apenas respostas por texto. Voz da IA indisponível neste plano.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <ul className="mt-6 space-y-2.5 text-xs text-white/80 border-t border-white/10 pt-4">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#00E676] shrink-0" />
                    <span>Pitch automático de produtos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#00E676] shrink-0" />
                    <span>Respostas ilimitadas no chat</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#00E676] shrink-0" />
                    <span>Auto-fixar ofertas na vitrine</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {p.allowAudio ? (
                      <Check className="w-4 h-4 text-[#00E676] shrink-0" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-0.5" />
                    )}
                    <span
                      className={p.allowAudio ? "text-white" : "text-amber-200/70 line-through"}
                    >
                      Voz da IA em tempo real
                    </span>
                  </li>
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  to="/entrar"
                  search={{ mode: "signup", plan: p.priceId }}
                  className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2 transition-all shadow-md ${
                    p.highlight
                      ? "bg-[#7C3AED] hover:bg-[#6D28D9] text-white hover:shadow-purple-500/25"
                      : "bg-white/10 hover:bg-white/20 text-white"
                  }`}
                >
                  Assinar Plano {p.name} <ArrowRight className="w-4 h-4 opacity-80" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Detalhes de Comparação de Recursos */}
        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <ShieldCheck className="w-5 h-5 text-[#00E676]" /> Incluído em todos os planos
            </div>
            <ul className="space-y-2.5 text-sm">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-[#00E676] shrink-0 mt-0.5" />
                  <span className="text-white/80">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 space-y-4">
            <div className="flex items-center gap-2 text-base font-bold text-amber-300">
              <Volume2 className="w-5 h-5 text-amber-400" /> Política da Voz / Áudio da IA
            </div>
            <p className="text-xs text-white/70 leading-relaxed">
              Para garantir uma experiência de live com narração de voz ao vivo de alta fidelidade:
            </p>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                <strong className="text-amber-300 block mb-1">🔒 Plano Mensal (R$ 27,90)</strong>
                <span className="text-white/70">
                  Sem voz/áudio. O assistente funciona respondendo aos comentários no chat apenas
                  via texto.
                </span>
              </div>
              <div className="p-3 rounded-xl bg-black/30 border border-[#00E676]/20">
                <strong className="text-[#00E676] block mb-1">
                  🎙️ Planos Trimestral (R$ 67,90) e Anual (R$ 117,90)
                </strong>
                <span className="text-white/70">
                  Com áudio completo. A IA narra os pitches, ofertas e saudações em voz humana em
                  tempo real na sua live.
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

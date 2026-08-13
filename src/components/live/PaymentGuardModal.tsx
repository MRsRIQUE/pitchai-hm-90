import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Lock,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  ShieldAlert,
  KeyRound,
  Loader2,
  HelpCircle,
  Zap,
} from "lucide-react";
import { PITCHAI_PLANS, formatBRL } from "@/lib/live/plans";
import { getFirebaseAuth } from "@/lib/firebase";

interface PaymentGuardProps {
  userEmail?: string;
  onActivated?: () => void;
}

export function PaymentGuardOverlay({ userEmail, onActivated }: PaymentGuardProps) {
  const [activeTab, setActiveTab] = useState<"checkout" | "activate">("checkout");
  const [emailInput, setEmailInput] = useState(userEmail || "");
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  // Invalida queries de subscription no React Query — substitui window.location.reload().
  const queryClient = useQueryClient();

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    try {
      // Chamada para a API de ativação por e-mail ou licença
      const auth = getFirebaseAuth();
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
      const res = await fetch("/api/public/payments/activate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: emailInput.trim(),
          licenseKey: licenseKeyInput.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setStatusMsg({
          type: "error",
          text: data.message || "Pagamento não localizado. Verifique o e-mail ou chave digitada.",
        });
      } else {
        setStatusMsg({
          type: "success",
          text: "🎉 Licença ativada com sucesso! Liberando acesso à ferramenta...",
        });
        // Invalida queries de subscription para que hooks refetcham do Firestore.
        await queryClient.invalidateQueries({ queryKey: ["subscription"] });
        if (onActivated) onActivated();
      }
    } catch (err) {
      setStatusMsg({
        type: "error",
        text: "Erro de conexão ao ativar licença. Tente novamente em instantes.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-50 flex min-h-[600px] w-full flex-col items-center justify-center rounded-3xl border border-purple-500/30 bg-[#120826]/95 p-6 text-white shadow-2xl backdrop-blur-2xl sm:p-10">
      {/* Glow de Fundo */}
      <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-[#FF8C00]/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-[#7C3AED]/30 blur-3xl pointer-events-none" />

      {/* Trava Header */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-2xl">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-lg animate-pulse">
          <Lock className="h-8 w-8" />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-purple-900/60 border border-purple-500/40 px-4 py-1 text-xs font-bold text-purple-200 mb-3">
          <Zap className="h-3.5 w-3.5 text-[#FF8C00]" />
          <span>Acesso Restrito ao Assinante</span>
        </div>

        <h2 className="font-display text-2xl font-extrabold sm:text-3xl text-white">
          Ferramenta Bloqueada — Libere seu Acesso
        </h2>
        <p className="mt-2 text-sm text-slate-300 leading-relaxed max-w-xl">
          Para utilizar o assistente de IA, a automação de transmissões ao vivo no TikTok Shop e
          respostas em tempo real, você precisa adquirir uma licença ativa.
        </p>

        {/* Abas: Comprar Link ou Ativar Já Pago */}
        <div className="mt-6 flex items-center rounded-full bg-white/10 p-1 border border-white/15">
          <button
            onClick={() => setActiveTab("checkout")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition-all ${
              activeTab === "checkout"
                ? "bg-[#FF8C00] text-white shadow-md"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Adquirir no Checkout (Link)</span>
          </button>
          <button
            onClick={() => setActiveTab("activate")}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-xs font-bold transition-all ${
              activeTab === "activate"
                ? "bg-[#7C3AED] text-white shadow-md"
                : "text-slate-300 hover:text-white"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>Já paguei? Ativar Licença</span>
          </button>
        </div>
      </div>

      {/* Conteúdo Aba Checkout Links */}
      {activeTab === "checkout" && (
        <div className="relative z-10 mt-8 w-full max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-3">
            {PITCHAI_PLANS.map((plan) => (
              <div
                key={plan.priceId}
                className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all ${
                  plan.highlight
                    ? "border-[#FF8C00] bg-gradient-to-b from-[#2A004D] to-[#180033] shadow-[0_0_30px_rgba(255,140,0,0.3)] scale-105"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#FF8C00] px-3 py-0.5 text-[10px] font-black text-white shadow">
                    {plan.badge}
                  </div>
                )}

                <div>
                  <h3 className="font-bold text-lg text-white">{plan.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-white">
                      {formatBRL(plan.amountCents)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {plan.months === 1 ? "/mês" : plan.months === 3 ? "/3 meses" : "/ano"}
                    </span>
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-slate-300 border-t border-white/10 pt-3">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>Pitch automático na Live</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>Respostas de Chat e IA</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>Auto-Fixar Oferta na Vitrine</span>
                    </li>
                  </ul>
                </div>

                <div className="mt-6">
                  <a
                    href={plan.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full py-3 px-4 rounded-xl font-extrabold text-xs text-center flex items-center justify-center gap-2 transition-all shadow-md ${
                      plan.highlight
                        ? "bg-[#FF8C00] hover:bg-[#E07B00] text-white shadow-lg"
                        : "bg-white/10 hover:bg-white/20 text-white"
                    }`}
                  >
                    <span>Comprar Plano {plan.name}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-emerald-400" />
            <span>Pagamento 100% seguro. Liberado na hora via Webhook ou Validação.</span>
          </p>
        </div>
      )}

      {/* Conteúdo Aba Ativar Licença */}
      {activeTab === "activate" && (
        <div className="relative z-10 mt-8 w-full max-w-md rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-md">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#FF8C00]" />
            <span>Ativar Minha Licença de Compra</span>
          </h3>
          <p className="mt-1 text-xs text-slate-300">
            Digite o e-mail cadastrado na hora do pagamento ou a Chave de Licença enviada no seu
            e-mail.
          </p>

          <form onSubmit={handleActivate} className="mt-4 space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                E-mail da Compra (PerfectPay / Checkout)
              </label>
              <Input
                type="email"
                placeholder="seu.email@exemplo.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                className="border-white/20 bg-black/40 text-white placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Chave de Licença ou Código da Transação (Opcional)
              </label>
              <Input
                type="text"
                placeholder="Ex: PITCHAI-PRO-88X12 ou PP-10492"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                className="border-white/20 bg-black/40 text-white placeholder:text-slate-500 font-mono text-xs"
              />
            </div>

            {statusMsg && (
              <div
                className={`rounded-xl p-3 text-xs font-semibold ${
                  statusMsg.type === "success"
                    ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                    : "bg-red-500/20 border border-red-500/40 text-red-300"
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !emailInput}
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs py-3 rounded-xl gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Validando Pagamento...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Validar e Liberar Acesso</span>
                </>
              )}
            </Button>
          </form>

          <div className="mt-4 border-t border-white/10 pt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-[#FF8C00] shrink-0" />
            <span>Precisa de ajuda? O pagamento pode levar até 2 minutos para processar.</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { PITCHAI_PLANS } from "@/lib/live/plans";
import { calculateUserCost, fetchCosts, type Costs } from "@/lib/live/admin";
import { PLAN_PRICES, PAID_PLAN_IDS } from "./utils";

export function CalculadoraTab() {
  const [simPlan, setSimPlan] = useState("pitchai_mensal");
  const [simLives, setSimLives] = useState(15);
  const [simDuration, setSimDuration] = useState(60);
  const [simPromptsPerLive, setSimPromptsPerLive] = useState(25);
  const [simTtsMinutesPerLive, setSimTtsMinutesPerLive] = useState(6);
  const [simModel, setSimModel] = useState<"flash" | "pro">("flash");

  const { data: costs } = useQuery({ queryKey: ["admin", "costs"], queryFn: fetchCosts });

  const providerPrices: Costs = useMemo(
    () =>
      costs || {
        chat_per_1k_in: 0.0001,
        chat_per_1k_out: 0.0004,
        tts_per_min: 0.015,
        tokens_in_mes: 5000000,
        tokens_out_mes: 1500000,
        minutos_tts_mes: 500,
        usd_brl: 5.6,
      },
    [costs],
  );

  const profilerCalc = useMemo(() => {
    const tokensInPerPrompt = simModel === "flash" ? 1200 : 2500;
    const tokensOutPerPrompt = simModel === "flash" ? 350 : 600;

    const totalPrompts = simLives * simPromptsPerLive;
    const totalTokensIn = totalPrompts * tokensInPerPrompt;
    const totalTokensOut = totalPrompts * tokensOutPerPrompt;
    const totalTtsMin = simLives * simTtsMinutesPerLive;

    const planPrice = PLAN_PRICES[simPlan] || PLAN_PRICES.pitchai_mensal;

    const costDetails = calculateUserCost(
      totalTokensIn,
      totalTokensOut,
      totalTtsMin,
      providerPrices,
      planPrice,
    );

    const costPerLiveBrl = simLives > 0 ? costDetails.totalBrl / simLives : 0;
    const maxLivesBreakEven = costPerLiveBrl > 0 ? Math.floor(planPrice / costPerLiveBrl) : 999;

    return {
      totalTokensIn,
      totalTokensOut,
      totalTtsMin,
      planPrice,
      costPerLiveBrl,
      totalCostUsd: costDetails.totalUsd,
      totalCostBrl: costDetails.totalBrl,
      netMarginBrl: costDetails.netMarginBrl,
      marginPct: costDetails.marginPct,
      maxLivesBreakEven,
    };
  }, [simPlan, simLives, simPromptsPerLive, simTtsMinutesPerLive, simModel, providerPrices]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#7C3AED]" />
            Simulador de Custo do Usuário por Perfil de Uso
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Calcule a margem de lucro exata por usuário com base no número de lives, prompts por
            live e minutos de narração por voz TTS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <label className="flex flex-col text-white/70">
            Plano do Usuário
            <select
              value={simPlan}
              onChange={(e) => setSimPlan(e.target.value)}
              className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-medium outline-none focus:border-[#7C3AED]"
            >
              {PAID_PLAN_IDS.map((planId) => {
                const plan = PITCHAI_PLANS.find((item) => item.priceId === planId)!;
                return (
                  <option key={planId} value={planId}>
                    {plan.name} —{" "}
                    {PLAN_PRICES[planId].toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                    /mês equivalente
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col text-white/70">
            Frequência de Lives no Mês
            <div className="flex items-center gap-3 mt-1.5">
              <input
                type="range"
                min={1}
                max={60}
                value={simLives}
                onChange={(e) => setSimLives(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
              <span className="font-mono font-bold text-white text-sm w-12 text-right">
                {simLives}x
              </span>
            </div>
          </label>

          <label className="flex flex-col text-white/70">
            Duração Média por Live (minutos)
            <div className="flex items-center gap-3 mt-1.5">
              <input
                type="range"
                min={15}
                max={240}
                step={15}
                value={simDuration}
                onChange={(e) => setSimDuration(Number(e.target.value))}
                className="w-full accent-[#7C3AED]"
              />
              <span className="font-mono font-bold text-white text-sm w-12 text-right">
                {simDuration}m
              </span>
            </div>
          </label>

          <label className="flex flex-col text-white/70">
            Prompts de IA Gerados por Live
            <input
              type="number"
              min={1}
              max={200}
              value={simPromptsPerLive}
              onChange={(e) => setSimPromptsPerLive(Number(e.target.value) || 1)}
              className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-mono outline-none focus:border-[#7C3AED]"
            />
          </label>

          <label className="flex flex-col text-white/70">
            Minutos de Narração TTS por Live
            <input
              type="number"
              min={0}
              max={60}
              value={simTtsMinutesPerLive}
              onChange={(e) => setSimTtsMinutesPerLive(Number(e.target.value) || 0)}
              className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-mono outline-none focus:border-[#7C3AED]"
            />
          </label>

          <label className="flex flex-col text-white/70">
            Modelo de IA Utilizado
            <select
              value={simModel}
              onChange={(e) => setSimModel(e.target.value as "flash" | "pro")}
              className="mt-1.5 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white font-medium outline-none focus:border-[#7C3AED]"
            >
              <option value="flash">Gemini 2.5 Flash (Ultrarrápido & Econômico)</option>
              <option value="pro">Gemini 2.5 Pro (Raciocínio Avançado)</option>
            </select>
          </label>
        </div>

        <div className="pt-4 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-white/50 font-sans">Custo por Live</div>
            <div className="text-lg font-bold text-white mt-0.5">
              R$ {profilerCalc.costPerLiveBrl.toFixed(2)}
            </div>
            <div className="text-[10px] text-white/40 font-sans">
              ~{(profilerCalc.totalTokensIn / simLives / 1000).toFixed(1)}k tokens/live
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-white/50 font-sans">Custo IA Total / Mês</div>
            <div className="text-lg font-bold text-red-400 mt-0.5">
              R$ {profilerCalc.totalCostBrl.toFixed(2)}
            </div>
            <div className="text-[10px] text-white/40 font-sans">
              USD ${profilerCalc.totalCostUsd.toFixed(2)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-white/50 font-sans">Lucro Líquido / Usuário</div>
            <div
              className={`text-lg font-bold mt-0.5 ${
                profilerCalc.netMarginBrl >= 0 ? "text-[#00E676]" : "text-red-400"
              }`}
            >
              R$ {profilerCalc.netMarginBrl.toFixed(2)}
            </div>
            <div className="text-[10px] text-white/40 font-sans">
              Margem: {profilerCalc.marginPct.toFixed(1)}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[11px] text-white/50 font-sans">Ponto de Equilíbrio</div>
            <div className="text-lg font-bold text-amber-300 mt-0.5">
              {profilerCalc.maxLivesBreakEven} lives/mês
            </div>
            <div className="text-[10px] text-white/40 font-sans">Limite antes do prejuízo</div>
          </div>
        </div>
      </div>
    </div>
  );
}

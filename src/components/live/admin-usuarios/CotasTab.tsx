import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sliders } from "lucide-react";
import {
  DEFAULT_PLAN_QUOTAS,
  fetchPlanQuotas,
  savePlanQuotas,
  type PlanQuota,
} from "@/lib/live/admin";
import { PLAN_PRICES } from "./utils";

export function CotasTab() {
  const qc = useQueryClient();
  const [quotas, setQuotas] = useState<Record<string, PlanQuota>>(DEFAULT_PLAN_QUOTAS);
  const [quotasSaved, setQuotasSaved] = useState(false);

  const { data: serverQuotas } = useQuery({
    queryKey: ["admin", "plan-quotas"],
    queryFn: fetchPlanQuotas,
  });

  useEffect(() => {
    if (serverQuotas) setQuotas(serverQuotas);
  }, [serverQuotas]);

  const saveQuotasM = useMutation({
    mutationFn: (q: Record<string, PlanQuota>) => savePlanQuotas(q),
    onMutate: () => setQuotasSaved(false),
    onSuccess: () => {
      setQuotasSaved(true);
      window.setTimeout(() => setQuotasSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ["admin", "plan-quotas"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#7C3AED]" />
            Configuração de Cotas e Limites de Consumo de IA
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Defina o teto máximo diário e mensal para evitar prejuízo em assinantes de alta demanda.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(quotas).map(([key, q]) => (
            <div key={key} className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-sm text-white">{q.planName}</span>
                <span className="text-xs font-mono text-[#00E676]">
                  {PLAN_PRICES[key] ? `R$ ${PLAN_PRICES[key]}/mês` : "Gratuito"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label className="flex flex-col text-white/60">
                  Limite Diário (Tokens)
                  <input
                    type="number"
                    step={5000}
                    value={q.dailyTokenLimit}
                    onChange={(e) =>
                      setQuotas({
                        ...quotas,
                        [key]: { ...q, dailyTokenLimit: Number(e.target.value) || 0 },
                      })
                    }
                    className="mt-1 rounded bg-black/60 border border-white/10 px-2.5 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
                  />
                </label>

                <label className="flex flex-col text-white/60">
                  Limite Mensal (Tokens)
                  <input
                    type="number"
                    step={50000}
                    value={q.monthlyTokenLimit}
                    onChange={(e) =>
                      setQuotas({
                        ...quotas,
                        [key]: { ...q, monthlyTokenLimit: Number(e.target.value) || 0 },
                      })
                    }
                    className="mt-1 rounded bg-black/60 border border-white/10 px-2.5 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
                  />
                </label>

                <label className="flex flex-col text-white/60">
                  Limite TTS (Minutos/Mês)
                  <input
                    type="number"
                    step={5}
                    value={q.ttsMinutesLimit}
                    onChange={(e) =>
                      setQuotas({
                        ...quotas,
                        [key]: { ...q, ttsMinutesLimit: Number(e.target.value) || 0 },
                      })
                    }
                    className="mt-1 rounded bg-black/60 border border-white/10 px-2.5 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
                  />
                </label>

                <label className="flex flex-col text-white/60">
                  Ação ao Estourar
                  <select
                    value={q.overLimitAction}
                    onChange={(e) =>
                      setQuotas({
                        ...quotas,
                        [key]: {
                          ...q,
                          overLimitAction: e.target.value as PlanQuota["overLimitAction"],
                        },
                      })
                    }
                    className="mt-1 rounded bg-black/60 border border-white/10 px-2 py-1.5 text-white font-sans outline-none focus:border-[#7C3AED]"
                  >
                    <option value="block">Bloquear IA</option>
                    <option value="throttle">Filas de Espera</option>
                    <option value="alert">Enviar Apenas Alerta</option>
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={() => saveQuotasM.mutate(quotas)}
            disabled={saveQuotasM.isPending}
            className="px-4 py-2 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white text-xs font-semibold shadow transition"
          >
            {saveQuotasM.isPending
              ? "Salvando…"
              : quotasSaved
                ? "Salvo! ✓"
                : "Salvar Regras de Cotas"}
          </button>
        </div>
      </div>
    </div>
  );
}

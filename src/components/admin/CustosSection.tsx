import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCosts, fetchPlans, updateCosts, type Costs } from "@/lib/live/admin";
import { AdminCard, AdminLoading, AdminStat, ErrorState, NumField } from "./admin-ui";
import { brl } from "./format";

export function CustosSection() {
  const qc = useQueryClient();
  const {
    data: c,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "costs"],
    queryFn: fetchCosts,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: fetchPlans,
  });
  const patchM = useMutation({
    mutationFn: (patch: Partial<Costs>) => updateCosts(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "costs"] }),
  });

  const custoChatUsd = useMemo(() => {
    if (!c) return 0;
    return (
      (Number(c.tokens_in_mes) / 1000) * Number(c.chat_per_1k_in) +
      (Number(c.tokens_out_mes) / 1000) * Number(c.chat_per_1k_out)
    );
  }, [c]);
  const custoTtsUsd = useMemo(
    () => (c ? Number(c.minutos_tts_mes) * Number(c.tts_per_min) : 0),
    [c],
  );
  const totalUsd = custoChatUsd + custoTtsUsd;
  const totalBrl = totalUsd * (c ? Number(c.usd_brl) : 0);
  const mrr = plans.reduce((s, p) => s + Number(p.preco_mensal) * p.assinantes, 0);
  const margem = mrr > 0 ? ((mrr - totalBrl) / mrr) * 100 : 0;

  if (error) return <ErrorState error={error} />;
  if (isLoading || !c) return <AdminLoading />;

  return (
    <>
      <section className="app-section">
        <div className="app-grid app-grid--4">
          <AdminStat
            label="Custo Chat"
            value={`$${custoChatUsd.toFixed(2)}`}
            hint="Tokens de entrada e saída"
          />
          <AdminStat
            label="Custo TTS"
            value={`$${custoTtsUsd.toFixed(2)}`}
            hint="Minutos de narração"
          />
          <AdminStat
            label="Total do mês"
            value={brl(totalBrl)}
            hint={`$${totalUsd.toFixed(2)} convertidos pelo câmbio`}
            tone="danger"
          />
          <AdminStat
            label="Margem vs MRR"
            value={`${margem.toFixed(1)}%`}
            hint={brl(mrr - totalBrl)}
            tone={margem >= 0 ? "ok" : "danger"}
          />
        </div>
      </section>

      <section className="app-section">
        <AdminCard title="Preços do provedor (USD)" hint="Salva ao sair do campo.">
          <div className="app-grid app-grid--3">
            <NumField
              label="Chat / 1k tokens IN"
              value={Number(c.chat_per_1k_in)}
              step={0.01}
              onChange={(v) => patchM.mutate({ chat_per_1k_in: v })}
            />
            <NumField
              label="Chat / 1k tokens OUT"
              value={Number(c.chat_per_1k_out)}
              step={0.01}
              onChange={(v) => patchM.mutate({ chat_per_1k_out: v })}
            />
            <NumField
              label="TTS / minuto"
              value={Number(c.tts_per_min)}
              step={0.001}
              onChange={(v) => patchM.mutate({ tts_per_min: v })}
            />
          </div>
        </AdminCard>
      </section>

      <section className="app-section">
        <AdminCard title="Uso mensal estimado">
          <div className="app-grid app-grid--3">
            <NumField
              label="Tokens IN / mês"
              value={Number(c.tokens_in_mes)}
              step={1000}
              onChange={(v) => patchM.mutate({ tokens_in_mes: v })}
            />
            <NumField
              label="Tokens OUT / mês"
              value={Number(c.tokens_out_mes)}
              step={1000}
              onChange={(v) => patchM.mutate({ tokens_out_mes: v })}
            />
            <NumField
              label="Minutos TTS / mês"
              value={Number(c.minutos_tts_mes)}
              step={10}
              onChange={(v) => patchM.mutate({ minutos_tts_mes: v })}
            />
          </div>
        </AdminCard>
      </section>

      <section className="app-section">
        <AdminCard title="Câmbio" hint="Usado para converter o custo do provedor em reais.">
          <div className="app-grid app-grid--3">
            <NumField
              label="USD → BRL"
              value={Number(c.usd_brl)}
              step={0.01}
              onChange={(v) => patchM.mutate({ usd_brl: v })}
            />
          </div>
        </AdminCard>
      </section>

      {patchM.error && (
        <div className="app-section">
          <ErrorState error={patchM.error} />
        </div>
      )}
    </>
  );
}

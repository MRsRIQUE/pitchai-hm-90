import { useQuery } from "@tanstack/react-query";
import { fetchPlans, fetchStripeAdminSnapshot } from "@/lib/live/admin";
import { AdminCard, AdminLoading, AdminStat, ErrorState } from "./admin-ui";
import { brl } from "./format";
import { StripePanel } from "./StripePanel";

export function PlanosSection() {
  const {
    data: plans = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: fetchPlans,
  });
  const stripe = useQuery({
    queryKey: ["admin", "stripe"],
    queryFn: fetchStripeAdminSnapshot,
    refetchInterval: 120_000,
    staleTime: 5 * 60 * 1000,
  });

  const mrr = plans.reduce((s, p) => s + Number(p.preco_mensal) * p.assinantes, 0);
  const arr = mrr * 12;
  const totalUsers = plans.reduce((s, p) => s + p.assinantes, 0);
  const arpu = totalUsers > 0 ? mrr / totalUsers : 0;

  return (
    <>
      <StripePanel
        data={stripe.data}
        loading={stripe.isLoading}
        error={stripe.error}
        onRefresh={() => stripe.refetch()}
        refreshing={stripe.isFetching}
      />

      <section className="app-section">
        <div className="app-section-head">
          <h2 className="app-section-title">Projeção interna do Firestore</h2>
        </div>
        <div className="app-grid app-grid--4">
          <AdminStat label="MRR" value={brl(mrr)} />
          <AdminStat label="ARR" value={brl(arr)} />
          <AdminStat label="Assinantes" value={totalUsers.toString()} />
          <AdminStat label="ARPU" value={brl(arpu)} />
        </div>
      </section>

      <section className="app-section">
        <AdminCard
          title="Planos"
          hint="Preços do catálogo oficial e assinaturas ativas confirmadas pelo backend."
        >
          {error ? (
            <ErrorState error={error} />
          ) : isLoading ? (
            <AdminLoading />
          ) : (
            <div className="app-table-wrap">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Plano</th>
                    <th className="num">Cobrança por ciclo</th>
                    <th className="num">Assinantes ativos</th>
                    <th className="num">MRR equivalente</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="font-medium">{p.nome}</div>
                        <div className="app-field-hint font-mono">{p.slug}</div>
                      </td>
                      <td className="num">
                        {brl(p.amount_cents / 100)} / {p.months} {p.months === 1 ? "mês" : "meses"}
                      </td>
                      <td className="num">{p.assinantes}</td>
                      <td className="num font-semibold text-[var(--app-ok)]">
                        {brl(Number(p.preco_mensal) * p.assinantes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </section>
    </>
  );
}

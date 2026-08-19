import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard, Database, UserCog } from "lucide-react";
import {
  fetchCommissions,
  fetchCosts,
  fetchPlans,
  fetchRanking,
  fetchStripeAdminSnapshot,
} from "@/lib/live/admin";
import { AdminAlert, AdminCard, AdminLoading, AdminStat } from "./admin-ui";
import { adminErrorDetail, brl } from "./format";
import { calculateTotalCostBrl, calculateMarginPct } from "./metrics";
import type { AdminSectionId } from "./sections";

/**
 * Centro de comando: só números que já têm fonte real — Stripe, custos
 * cadastrados, comissões e catálogo. Nada é estimado aqui.
 *
 * As consultas pesadas de usuário (fetchUsersWithUsage) e o listener do
 * Firestore ficam de fora de propósito: abrir o painel não deve custar isso.
 */
export function OverviewSection({ onNavigate }: { onNavigate: (id: AdminSectionId) => void }) {
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: fetchPlans });
  const costs = useQuery({ queryKey: ["admin", "costs"], queryFn: fetchCosts });
  const commissions = useQuery({ queryKey: ["admin", "commissions"], queryFn: fetchCommissions });
  const ranking = useQuery({ queryKey: ["admin", "ranking"], queryFn: fetchRanking });
  // Mesma chave da seção Planos: quem abrir as duas paga uma consulta só.
  const stripe = useQuery({ queryKey: ["admin", "stripe"], queryFn: fetchStripeAdminSnapshot });

  const loading = plans.isLoading || costs.isLoading || commissions.isLoading || ranking.isLoading;
  // Cada fonte carrega o próprio erro junto do nome. Só o nome não distingue
  // sessão expirada (401) de falta de papel (Forbidden) nem de recusa do
  // Firestore, e as três caem no mesmo aviso — sem o texto, todo diagnóstico
  // deste painel vira investigação em log de servidor.
  const failures = [
    { label: "planos e assinaturas", error: plans.error },
    { label: "custos", error: costs.error },
    { label: "comissões", error: commissions.error },
    { label: "ranking", error: ranking.error },
    { label: "Stripe", error: stripe.error },
  ].filter((source) => Boolean(source.error));

  const planRows = plans.data ?? [];
  const activePlans = planRows.filter((plan) => plan.assinantes > 0);
  const monthlyRevenue = planRows.reduce(
    (sum, plan) => sum + Number(plan.preco_mensal) * plan.assinantes,
    0,
  );
  const pendingCommissions = (commissions.data ?? []).filter((item) => item.status === "pendente");
  const commissionTotal =
    pendingCommissions.reduce((sum, item) => sum + item.amount_cents, 0) / 100;
  const costData = costs.data;
  const costTotal = calculateTotalCostBrl(costData);
  const marginPct = calculateMarginPct(monthlyRevenue, costTotal);
  const rankedProducts = ranking.data ?? [];
  const highlighted = rankedProducts.filter((product) => product.destaque).length;

  const snapshot = stripe.data;
  const stripeValue = (value: number) => {
    if (stripe.error) return "Indisponível";
    if (!snapshot) return "…";
    return brl(value / 100);
  };
  const stripeCount = (value: number) => {
    if (stripe.error) return "Indisponível";
    if (!snapshot) return "…";
    return String(value);
  };

  const retryAll = () => {
    void Promise.all([
      plans.refetch(),
      costs.refetch(),
      commissions.refetch(),
      ranking.refetch(),
      stripe.refetch(),
    ]);
  };

  return (
    <>
      {failures.length > 0 && (
        <div className="app-section">
          <AdminAlert
            action={
              <button type="button" className="app-btn app-btn--sm" onClick={retryAll}>
                Tentar novamente
              </button>
            }
          >
            Não foi possível atualizar: {failures.map((source) => source.label).join(", ")}. Os
            demais indicadores continuam disponíveis.
          </AdminAlert>
          {/* Fora do AdminAlert de propósito: o alerta põe os filhos num
              <span>, que não aceita <details> como conteúdo válido. */}
          <details className="app-card app-card--flat mt-2 text-[13px]">
            <summary className="cursor-pointer select-none app-card-desc">
              Detalhes do erro ({failures.length})
            </summary>
            <ul className="mt-3 space-y-2">
              {failures.map((source) => (
                <li key={source.label}>
                  <span className="app-card-title">{source.label}</span>
                  <pre className="app-card-desc mt-1 whitespace-pre-wrap break-all">
                    {adminErrorDetail(source.error)}
                  </pre>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {loading ? (
        <AdminCard title="Indicadores" hint="Buscando os números reais das fontes.">
          <AdminLoading label="Carregando indicadores reais…" />
        </AdminCard>
      ) : (
        <>
          <section className="app-section">
            <div className="app-section-head">
              <h2 className="app-section-title">Financeiro no Stripe</h2>
              {snapshot ? (
                <span
                  className="app-tag"
                  data-tone={snapshot.environment === "live" ? "ok" : "warn"}
                >
                  {snapshot.environment === "live" ? "Produção" : "Modo teste"}
                </span>
              ) : null}
            </div>
            <div className="app-grid app-grid--4">
              <AdminStat
                label="MRR no Stripe"
                value={stripeValue(snapshot?.mrrCents ?? 0)}
                hint="Receita recorrente confirmada"
              />
              <AdminStat
                label="Recebido em 30 dias"
                value={stripeValue(snapshot?.paidLast30DaysCents ?? 0)}
                hint="Faturas pagas no período"
                tone="ok"
              />
              <AdminStat
                label="Saldo disponível"
                value={stripeValue(snapshot?.availableBalanceCents ?? 0)}
                hint={
                  snapshot
                    ? `${brl(snapshot.pendingBalanceCents / 100)} ainda pendente`
                    : "Consultando saldo"
                }
              />
              <AdminStat
                label="Assinaturas ativas"
                value={stripeCount(snapshot?.active ?? 0)}
                hint={
                  snapshot
                    ? `${snapshot.trialing} em teste · ${snapshot.pastDue} com problema`
                    : "Consultando assinaturas"
                }
              />
            </div>
          </section>

          {snapshot && snapshot.unsynced > 0 ? (
            <div className="app-section">
              <AdminAlert tone="danger">
                {snapshot.unsynced} assinatura(s) ativa(s) no Stripe sem o mesmo ID no Firestore.
                Verifique o webhook antes de liberar acesso manualmente.
              </AdminAlert>
            </div>
          ) : null}

          <section className="app-section">
            <div className="app-section-head">
              <h2 className="app-section-title">Operação</h2>
            </div>
            <div className="app-grid app-grid--4">
              <AdminStat
                label="Custo de IA no mês"
                value={costs.error ? "Indisponível" : brl(costTotal)}
                hint={costs.error ? "Falha ao consultar custos" : "Chat + TTS pelo uso cadastrado"}
                tone={costs.error ? undefined : "danger"}
              />
              <AdminStat
                label="Margem vs MRR interno"
                value={plans.error || costs.error ? "Indisponível" : `${marginPct.toFixed(1)}%`}
                hint={
                  plans.error || costs.error
                    ? "Falha ao cruzar receita e custo"
                    : `${brl(monthlyRevenue)} de receita configurada`
                }
                tone={plans.error || costs.error ? undefined : marginPct >= 0 ? "ok" : "danger"}
              />
              <AdminStat
                label="Comissões pendentes"
                value={commissions.error ? "Indisponível" : brl(commissionTotal)}
                hint={
                  commissions.error
                    ? "Falha ao consultar comissões"
                    : `${pendingCommissions.length} pagamento(s) aguardando`
                }
                tone={commissions.error || commissionTotal === 0 ? undefined : "warn"}
              />
              <AdminStat
                label="Produtos ranqueados"
                value={ranking.error ? "Indisponível" : String(rankedProducts.length)}
                hint={ranking.error ? "Falha ao consultar ranking" : `${highlighted} em destaque`}
              />
            </div>
          </section>

          <section className="app-section">
            <div className="app-grid app-grid--2">
              <AdminCard title="Leitura rápida" hint="Sinais para acompanhar nesta sessão.">
                <div className="flex flex-col">
                  <Insight
                    label="Planos ativos"
                    value={plans.error ? "Dados indisponíveis" : `${activePlans.length}`}
                    tone={plans.error ? "warn" : "ok"}
                  />
                  <Insight
                    label="Comissões a pagar"
                    value={
                      commissions.error
                        ? "Dados indisponíveis"
                        : commissionTotal > 0
                          ? brl(commissionTotal)
                          : "Nenhuma pendência"
                    }
                    tone={commissions.error || commissionTotal > 0 ? "warn" : "ok"}
                  />
                  <Insight
                    label="Cobertura de custos"
                    value={
                      plans.error || costs.error
                        ? "Dados indisponíveis"
                        : monthlyRevenue > costTotal
                          ? "Receita acima dos custos"
                          : "Revisar margem"
                    }
                    tone={
                      !plans.error && !costs.error && monthlyRevenue > costTotal ? "ok" : "warn"
                    }
                  />
                </div>
              </AdminCard>

              <AdminCard
                title="Atalhos operacionais"
                hint="Acesse os detalhes sem perder o contexto."
              >
                <div className="app-steps">
                  <QuickLink
                    icon={UserCog}
                    label="Usuários, custos e cotas"
                    hint="Acompanhar a operação conta a conta"
                    onClick={() => onNavigate("usuarios")}
                  />
                  <QuickLink
                    icon={CreditCard}
                    label="Planos e receita"
                    hint="Revisar assinaturas e faturas"
                    onClick={() => onNavigate("planos")}
                  />
                  <QuickLink
                    icon={Database}
                    label="Uso IA em tempo real"
                    hint="Ver consumo ao vivo no Firestore"
                    onClick={() => onNavigate("usage_firestore")}
                  />
                </div>
              </AdminCard>
            </div>
          </section>
        </>
      )}
    </>
  );
}

function Insight({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--app-line-2)] py-2.5 last:border-0 last:pb-0">
      <span className="app-card-desc !mt-0">{label}</span>
      <span className="app-tag" data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

function QuickLink({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof UserCog;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="app-step" onClick={onClick}>
      <span className="app-step-num">
        <Icon aria-hidden="true" />
      </span>
      <span className="app-step-body">
        <span className="app-step-title">{label}</span>
        <span className="app-step-desc block">{hint}</span>
      </span>
      <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 flex-none text-[var(--app-ink-3)]" />
    </button>
  );
}

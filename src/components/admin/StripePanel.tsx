import { ExternalLink } from "lucide-react";
import type { StripeAdminSnapshot } from "@/lib/live/admin";
import { AdminAlert, AdminCard, AdminEmpty, AdminLoading, AdminStat, ErrorState } from "./admin-ui";
import { brl } from "./format";

/** Verde para o que está em dia, âmbar para o que exige ação, neutro para o resto. */
function statusTone(status: string): "ok" | "warn" | undefined {
  if (["active", "paid"].includes(status)) return "ok";
  if (["past_due", "unpaid", "incomplete", "open"].includes(status)) return "warn";
  return undefined;
}

export interface StripePanelProps {
  data?: StripeAdminSnapshot;
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
  refreshing: boolean;
}

export function StripePanel({ data, loading, error, onRefresh, refreshing }: StripePanelProps) {
  if (error) {
    return (
      <AdminCard title="Stripe" hint="Dados financeiros consultados diretamente no Stripe.">
        <ErrorState error={error} />
      </AdminCard>
    );
  }
  if (loading || !data) {
    return (
      <AdminCard title="Stripe" hint="Dados financeiros consultados diretamente no Stripe.">
        <AdminLoading label="Consultando Stripe…" />
      </AdminCard>
    );
  }

  return (
    <>
      <section className="app-section">
        <div className="app-section-head">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="app-section-title">Stripe</h2>
            <span className="app-tag" data-tone={data.environment === "live" ? "ok" : "warn"}>
              {data.environment === "live" ? "Produção" : "Modo teste"}
            </span>
            <span className="app-field-hint">
              Atualizado em {new Date(data.fetchedAt).toLocaleString("pt-BR")}
            </span>
          </div>
          <button
            type="button"
            className="app-btn app-btn--sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Atualizando…" : "Atualizar Stripe"}
          </button>
        </div>

        <div className="app-grid app-grid--4">
          <AdminStat label="MRR no Stripe" value={brl(data.mrrCents / 100)} />
          <AdminStat
            label="Recebido em 30 dias"
            value={brl(data.paidLast30DaysCents / 100)}
            tone="ok"
          />
          <AdminStat label="Saldo disponível" value={brl(data.availableBalanceCents / 100)} />
          <AdminStat label="Saldo pendente" value={brl(data.pendingBalanceCents / 100)} />
        </div>
      </section>

      <section className="app-section">
        <div className="app-grid app-grid--5">
          <AdminStat label="Ativas" value={String(data.active)} tone="ok" />
          <AdminStat label="Em teste" value={String(data.trialing)} />
          <AdminStat
            label="Com problema"
            value={String(data.pastDue)}
            tone={data.pastDue > 0 ? "warn" : undefined}
          />
          <AdminStat label="Canceladas" value={String(data.canceled)} />
          <AdminStat
            label="Não sincronizadas"
            value={String(data.unsynced)}
            tone={data.unsynced > 0 ? "danger" : undefined}
          />
        </div>
      </section>

      {data.unsynced > 0 && (
        <div className="app-section">
          <AdminAlert tone="danger">
            Há {data.unsynced} assinatura(s) ativa(s) no Stripe sem o mesmo ID no Firestore.
            Verifique o webhook antes de liberar acesso manualmente.
          </AdminAlert>
        </div>
      )}

      <section className="app-section">
        <AdminCard
          title="Assinaturas no Stripe"
          hint="Fonte financeira real; atualizada a cada 30 segundos."
        >
          {data.subscriptions.length === 0 ? (
            <AdminEmpty title="Nenhuma assinatura." />
          ) : (
            <div className="app-table-wrap">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Plano</th>
                    <th className="num">Valor/ciclo</th>
                    <th>Status</th>
                    <th>Próxima renovação</th>
                    <th>Firestore</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscriptions.map((sub) => (
                    <tr key={sub.id}>
                      <td>
                        <div>{sub.email || "Sem e-mail"}</div>
                        <div className="app-field-hint font-mono">{sub.id}</div>
                      </td>
                      <td className="font-mono">{sub.plan}</td>
                      <td className="num">{brl(sub.amountCents / 100)}</td>
                      <td>
                        <span className="app-tag" data-tone={statusTone(sub.status)}>
                          {sub.status}
                          {sub.cancelAtPeriodEnd ? " · cancela no fim" : ""}
                        </span>
                      </td>
                      <td>
                        {sub.currentPeriodEnd
                          ? new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td>
                        <span className="app-tag" data-tone={sub.firestoreSynced ? "ok" : "warn"}>
                          {sub.firestoreSynced ? "Sincronizado" : "Divergente"}
                        </span>
                      </td>
                      <td>
                        <div className="app-table-actions">
                          <a
                            className="app-link-ext"
                            href={sub.dashboardUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir
                            <ExternalLink aria-hidden="true" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </section>

      <section className="app-section">
        <AdminCard
          title="Faturas recentes"
          hint="Pagamentos, faturas abertas e falhas dos últimos 30 dias."
        >
          {data.recentInvoices.length === 0 ? (
            <AdminEmpty title="Nenhuma fatura nos últimos 30 dias." />
          ) : (
            <div className="app-table-wrap">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="num">Valor</th>
                    <th>Status</th>
                    <th>Data</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <div>{invoice.email || "Cliente sem e-mail"}</div>
                        <div className="app-field-hint font-mono">{invoice.id}</div>
                      </td>
                      <td className="num">{brl(invoice.amountCents / 100)}</td>
                      <td>
                        <span className="app-tag" data-tone={statusTone(invoice.status)}>
                          {invoice.status}
                        </span>
                      </td>
                      <td>{new Date(invoice.createdAt).toLocaleDateString("pt-BR")}</td>
                      <td>
                        <div className="app-table-actions">
                          {invoice.hostedUrl ? (
                            <a
                              className="app-link-ext"
                              href={invoice.hostedUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver fatura
                              <ExternalLink aria-hidden="true" />
                            </a>
                          ) : (
                            <span className="app-field-hint">—</span>
                          )}
                        </div>
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

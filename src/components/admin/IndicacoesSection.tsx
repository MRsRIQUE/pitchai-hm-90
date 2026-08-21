import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAffiliateDashboard,
  fetchCommissionsPage,
  setAffiliateActive,
  setCommissionStatus,
  type AdminCommission,
} from "@/lib/live/admin";
import { AdminAlert, AdminCard, AdminEmpty, AdminLoading, AdminStat, ErrorState } from "./admin-ui";
import { brl } from "./format";

const COMMISSION_FILTERS = ["todos", "pendente", "pago", "cancelado"] as const;
const AFFILIATE_FILTERS = ["todos", "ativos", "pausados"] as const;

const STATUS_TONE: Record<string, "ok" | "warn" | undefined> = {
  pago: "ok",
  pendente: "warn",
};

const SOURCE_LABELS: Record<string, string> = {
  link: "Link",
  seller_code: "Código digitado",
  checkout: "Checkout",
  unknown: "Origem antiga",
};

function pct(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function sourceSummary(sources: Record<string, number>) {
  const entries = Object.entries(sources).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "—";
  return entries
    .map(([source, count]) => `${SOURCE_LABELS[source] || source}: ${count}`)
    .join(" · ");
}

export function IndicacoesSection() {
  const [commissionFilter, setCommissionFilter] =
    useState<(typeof COMMISSION_FILTERS)[number]>("todos");
  const [affiliateFilter, setAffiliateFilter] =
    useState<(typeof AFFILIATE_FILTERS)[number]>("todos");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "info" | "warn" } | null>(null);
  const qc = useQueryClient();

  const dashboard = useQuery({
    queryKey: ["admin", "affiliates", "dashboard"],
    queryFn: fetchAffiliateDashboard,
  });
  const commissions = useInfiniteQuery({
    queryKey: ["admin", "commissions", "pages"],
    queryFn: ({ pageParam }) => fetchCommissionsPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const items = commissions.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleCommissions = items.filter(
    (commission) => commissionFilter === "todos" || commission.status === commissionFilter,
  );
  const visibleAffiliates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (dashboard.data?.affiliates ?? []).filter((affiliate) => {
      if (affiliateFilter === "ativos" && !affiliate.active) return false;
      if (affiliateFilter === "pausados" && affiliate.active) return false;
      if (!term) return true;
      return [affiliate.code, affiliate.name, affiliate.email, affiliate.uid]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [affiliateFilter, dashboard.data?.affiliates, search]);

  const notify = (message: string, tone: "info" | "warn" = "info") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3500);
  };

  const commissionStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pendente" | "pago" | "cancelado" }) =>
      setCommissionStatus(id, status),
    onSuccess: (_data, variables) => {
      notify(`Comissão marcada como ${variables.status}.`);
      void qc.invalidateQueries({ queryKey: ["admin", "commissions"] });
      void qc.invalidateQueries({ queryKey: ["admin", "affiliates"] });
    },
    onError: (error) => notify(`Falha ao atualizar: ${(error as Error).message}`, "warn"),
  });

  const affiliateStatus = useMutation({
    mutationFn: ({ code, active }: { code: string; active: boolean }) =>
      setAffiliateActive(code, active),
    onSuccess: (_data, variables) => {
      notify(`Código ${variables.active ? "reativado" : "pausado"} com sucesso.`);
      void qc.invalidateQueries({ queryKey: ["admin", "affiliates"] });
    },
    onError: (error) => notify(`Falha ao atualizar: ${(error as Error).message}`, "warn"),
  });

  const data = dashboard.data;

  return (
    <>
      {toast ? (
        <div className="app-section">
          <AdminAlert tone={toast.tone}>{toast.message}</AdminAlert>
        </div>
      ) : null}

      <section className="app-section">
        <div className="app-grid app-grid--4">
          <AdminStat
            label="Afiliados ativos"
            value={
              data ? String(data.affiliates.filter((affiliate) => affiliate.active).length) : "—"
            }
            hint={data ? `${data.affiliates.length} códigos cadastrados` : undefined}
            tone="accent"
          />
          <AdminStat
            label="Leads atribuídos"
            value={data ? String(data.totalReferrals) : "—"}
            hint={data ? `${data.totalSubscribers} viraram assinantes` : undefined}
          />
          <AdminStat
            label="Conversão"
            value={data ? pct(data.conversionRate) : "—"}
            hint="Lead atribuído → assinante"
            tone={data && data.conversionRate > 0 ? "ok" : undefined}
          />
          <AdminStat
            label="A pagar"
            value={data ? brl(data.totalPendingCents / 100) : "—"}
            hint={data ? `${brl(data.totalPaidCents / 100)} já pagos` : undefined}
            tone={data?.totalPendingCents ? "warn" : undefined}
          />
        </div>
      </section>

      <section className="app-section">
        <AdminCard
          title="Afiliados e códigos de vendedor"
          hint="Acompanhe a origem das vendas, conversão e saldo; pause códigos sem apagar o histórico."
        >
          {dashboard.error ? (
            <ErrorState error={dashboard.error} />
          ) : dashboard.isLoading ? (
            <AdminLoading />
          ) : !data?.affiliates.length ? (
            <AdminEmpty title="Nenhum afiliado cadastrado" />
          ) : (
            <>
              <div className="app-toolbar">
                <div className="app-segment">
                  {AFFILIATE_FILTERS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={affiliateFilter === value}
                      onClick={() => setAffiliateFilter(value)}
                    >
                      {value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
                <input
                  className="app-input app-toolbar-end"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  placeholder="Buscar código, nome ou e-mail"
                  aria-label="Buscar afiliado"
                />
              </div>

              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Afiliado</th>
                      <th>Código</th>
                      <th>Origem</th>
                      <th className="num">Leads</th>
                      <th className="num">Assinantes</th>
                      <th className="num">Conversão</th>
                      <th className="num">A pagar</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAffiliates.map((affiliate) => (
                      <tr key={affiliate.code}>
                        <td>
                          <div className="font-semibold">{affiliate.name}</div>
                          <div className="app-field-hint">{affiliate.email || affiliate.uid}</div>
                        </td>
                        <td className="font-mono font-semibold">{affiliate.code}</td>
                        <td className="app-field-hint">{sourceSummary(affiliate.sources)}</td>
                        <td className="num">{affiliate.referrals}</td>
                        <td className="num">{affiliate.subscribers}</td>
                        <td className="num">{pct(affiliate.conversion_rate)}</td>
                        <td className="num font-semibold">{brl(affiliate.pending_cents / 100)}</td>
                        <td>
                          <span className="app-tag" data-tone={affiliate.active ? "ok" : "warn"}>
                            {affiliate.active ? "ativo" : "pausado"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="app-btn app-btn--sm app-btn--ghost"
                            disabled={affiliateStatus.isPending}
                            onClick={() =>
                              affiliateStatus.mutate({
                                code: affiliate.code,
                                active: !affiliate.active,
                              })
                            }
                          >
                            {affiliate.active ? "Pausar código" : "Reativar código"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!visibleAffiliates.length ? (
                <AdminEmpty title="Nenhum afiliado neste filtro." />
              ) : null}
            </>
          )}
        </AdminCard>
      </section>

      <section className="app-section">
        <AdminCard
          title="Comissões"
          hint="Controle individual dos pagamentos e mantenha o histórico de cancelamentos."
        >
          {commissions.error ? (
            <ErrorState error={commissions.error} />
          ) : commissions.isLoading ? (
            <AdminLoading />
          ) : !items.length ? (
            <AdminEmpty
              title="Nenhuma comissão registrada"
              hint="As comissões aparecem após a confirmação da cobrança."
            />
          ) : (
            <>
              <div className="app-toolbar">
                <div className="app-segment">
                  {COMMISSION_FILTERS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={commissionFilter === value}
                      onClick={() => setCommissionFilter(value)}
                    >
                      {value === "todos" ? "Todos" : value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
                <span className="app-toolbar-end app-field-hint">
                  {visibleCommissions.length} de {items.length} comissões
                </span>
              </div>

              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Código / origem</th>
                      <th>Indicador</th>
                      <th>Plano</th>
                      <th className="num">Base</th>
                      <th className="num">Comissão</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCommissions.map((commission) => (
                      <CommissionRow
                        key={commission.id}
                        commission={commission}
                        pending={commissionStatus.isPending}
                        onStatus={(status) =>
                          commissionStatus.mutate({ id: commission.id, status })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {!visibleCommissions.length ? (
                <AdminEmpty title="Nenhuma comissão neste filtro." />
              ) : null}
            </>
          )}
        </AdminCard>
      </section>

      {commissions.hasNextPage ? (
        <button
          type="button"
          className="app-btn mt-4"
          onClick={() => commissions.fetchNextPage()}
          disabled={commissions.isFetchingNextPage}
        >
          {commissions.isFetchingNextPage ? "Carregando…" : "Carregar mais comissões"}
        </button>
      ) : null}
    </>
  );
}

function CommissionRow({
  commission,
  pending,
  onStatus,
}: {
  commission: AdminCommission;
  pending: boolean;
  onStatus: (status: "pago" | "cancelado") => void;
}) {
  return (
    <tr>
      <td>
        {commission.created_at ? new Date(commission.created_at).toLocaleDateString("pt-BR") : "—"}
      </td>
      <td>
        <div className="font-mono font-semibold">{commission.referral_code || "legado"}</div>
        <div className="app-field-hint">
          {SOURCE_LABELS[commission.attribution_source] || commission.attribution_source}
        </div>
      </td>
      <td className="font-mono text-xs">{commission.referrer_id.slice(0, 8)}</td>
      <td className="uppercase">{commission.plan ?? "—"}</td>
      <td className="num">{brl(commission.base_cents / 100)}</td>
      <td className="num font-semibold">{brl(commission.amount_cents / 100)}</td>
      <td>
        <span className="app-tag" data-tone={STATUS_TONE[commission.status]}>
          {commission.status}
        </span>
      </td>
      <td>
        <div className="app-table-actions">
          {commission.status !== "pago" ? (
            <button
              type="button"
              className="app-btn app-btn--sm"
              disabled={pending}
              onClick={() => onStatus("pago")}
            >
              Marcar pago
            </button>
          ) : null}
          {commission.status !== "cancelado" ? (
            <button
              type="button"
              className="app-btn app-btn--sm app-btn--ghost"
              disabled={pending}
              onClick={() => onStatus("cancelado")}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

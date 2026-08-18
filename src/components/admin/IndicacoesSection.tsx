import { useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCommissionsPage, setCommissionStatus, type AdminCommission } from "@/lib/live/admin";
import { AdminAlert, AdminCard, AdminEmpty, AdminLoading, AdminStat, ErrorState } from "./admin-ui";
import { brl } from "./format";

const FILTERS = ["todos", "pendente", "pago", "cancelado"] as const;
type StatusFilter = (typeof FILTERS)[number];

const STATUS_TONE: Record<string, "ok" | "warn" | undefined> = {
  pago: "ok",
  pendente: "warn",
};

export function IndicacoesSection() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [toast, setToast] = useState<{ message: string; tone: "info" | "warn" } | null>(null);
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["admin", "commissions", "pages"],
    queryFn: ({ pageParam }) => fetchCommissionsPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const { isLoading, error } = query;
  const statusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pendente" | "pago" | "cancelado" }) =>
      setCommissionStatus(id, status),
    onSuccess: (_data, variables) => {
      const action = variables.status === "pago" ? "paga" : "cancelada";
      setToast({ message: `Comissão marcada como ${action}.`, tone: "info" });
      qc.invalidateQueries({ queryKey: ["admin", "commissions"] });
      setTimeout(() => setToast(null), 2500);
    },
    onError: (err) => {
      setToast({ message: `Falha ao atualizar: ${(err as Error).message}`, tone: "warn" });
      setTimeout(() => setToast(null), 4000);
    },
  });

  const visibleItems = items.filter((c) => statusFilter === "todos" || c.status === statusFilter);
  const pend = items.filter((c) => c.status === "pendente");
  const pago = items.filter((c) => c.status === "pago");
  const sum = (arr: AdminCommission[]) => arr.reduce((s, c) => s + c.amount_cents, 0) / 100;

  return (
    <>
      {toast && (
        <div className="app-section">
          <AdminAlert tone={toast.tone}>{toast.message}</AdminAlert>
        </div>
      )}
      <section className="app-section">
        <div className="app-grid app-grid--4">
          <AdminStat label="Comissões" value={items.length.toString()} />
          <AdminStat
            label="A pagar"
            value={brl(sum(pend))}
            tone={pend.length ? "warn" : undefined}
          />
          <AdminStat label="Já pago" value={brl(sum(pago))} tone="ok" />
          <AdminStat label="Taxa nível 1" value="60%" hint="Sobre a primeira cobrança" />
        </div>
      </section>

      <section className="app-section">
        <AdminCard
          title="Programa de afiliados · comissões"
          hint="Marque como pago depois de enviar o PIX ao indicador."
        >
          {error ? (
            <ErrorState error={error} />
          ) : isLoading ? (
            <AdminLoading />
          ) : items.length === 0 ? (
            <AdminEmpty
              title="Nenhuma comissão registrada"
              hint="As indicações aparecem aqui assim que a primeira cobrança é confirmada."
            />
          ) : (
            <>
              <div className="app-toolbar">
                <div className="app-segment">
                  {FILTERS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={statusFilter === value}
                      onClick={() => setStatusFilter(value)}
                    >
                      {value === "todos" ? "Todos" : value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
                <span className="app-toolbar-end app-field-hint">
                  {visibleItems.length} de {items.length} comissões
                </span>
              </div>

              <div className="app-table-wrap">
                <table className="app-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Indicador</th>
                      <th>Indicado</th>
                      <th>Plano</th>
                      <th className="num">Base</th>
                      <th className="num">Comissão</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((c) => (
                      <tr key={c.id}>
                        <td>{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                        <td className="font-mono text-xs">{c.referrer_id.slice(0, 8)}</td>
                        <td className="font-mono text-xs">{c.referred_id.slice(0, 8)}</td>
                        <td className="uppercase">{c.plan ?? "—"}</td>
                        <td className="num">{brl(c.base_cents / 100)}</td>
                        <td className="num font-semibold">{brl(c.amount_cents / 100)}</td>
                        <td>
                          <span className="app-tag" data-tone={STATUS_TONE[c.status]}>
                            {c.status}
                          </span>
                        </td>
                        <td>
                          <div className="app-table-actions">
                            {c.status !== "pago" && (
                              <button
                                type="button"
                                className="app-btn app-btn--sm"
                                disabled={statusM.isPending}
                                onClick={() => statusM.mutate({ id: c.id, status: "pago" })}
                              >
                                Marcar pago
                              </button>
                            )}
                            {c.status !== "cancelado" && (
                              <button
                                type="button"
                                className="app-btn app-btn--sm app-btn--ghost"
                                disabled={statusM.isPending}
                                onClick={() => statusM.mutate({ id: c.id, status: "cancelado" })}
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {visibleItems.length === 0 && <AdminEmpty title="Nenhuma comissão neste filtro." />}
            </>
          )}
        </AdminCard>
      </section>

      {query.hasNextPage && (
        <button
          type="button"
          className="app-btn mt-4"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Carregando…" : "Carregar mais comissões"}
        </button>
      )}
    </>
  );
}

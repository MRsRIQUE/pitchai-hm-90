import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPromotionCodeAdmin,
  fetchAffiliateDashboard,
  fetchPromotionCodesAdmin,
  setPromotionCodeActiveAdmin,
  type CreateAdminPromotionCode,
} from "@/lib/live/admin";
import { AdminAlert, AdminCard, AdminEmpty, AdminLoading, AdminStat, ErrorState } from "./admin-ui";

const initialForm: CreateAdminPromotionCode = {
  code: "",
  percentOff: 5,
  duration: "forever",
  affiliateCode: "",
  firstTimeOnly: false,
  maxRedemptions: null,
  expiresAt: null,
};

function formatDate(value: string | null) {
  if (!value) return "Sem vencimento";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

export function CuponsSection() {
  const [form, setForm] = useState<CreateAdminPromotionCode>(initialForm);
  const [message, setMessage] = useState<{ text: string; tone: "info" | "danger" } | null>(null);
  const qc = useQueryClient();
  const coupons = useQuery({
    queryKey: ["admin", "promotion-codes"],
    queryFn: fetchPromotionCodesAdmin,
  });
  const affiliates = useQuery({
    queryKey: ["admin", "affiliates", "dashboard"],
    queryFn: fetchAffiliateDashboard,
  });

  const activeAffiliates = useMemo(
    () => (affiliates.data?.affiliates ?? []).filter((affiliate) => affiliate.active),
    [affiliates.data?.affiliates],
  );
  const data = coupons.data ?? [];
  const activeCount = data.filter((coupon) => coupon.active).length;
  const redemptions = data.reduce((sum, coupon) => sum + coupon.timesRedeemed, 0);
  const linkedAffiliates = new Set(data.map((coupon) => coupon.affiliateUid).filter(Boolean)).size;

  const createCoupon = useMutation({
    mutationFn: createPromotionCodeAdmin,
    onSuccess: (coupon) => {
      setMessage({
        text: `Cupom ${coupon.code} criado e vinculado a ${coupon.affiliateName}.`,
        tone: "info",
      });
      setForm(initialForm);
      void qc.invalidateQueries({ queryKey: ["admin", "promotion-codes"] });
    },
    onError: (error) =>
      setMessage({
        text: `Não foi possível criar o cupom: ${(error as Error).message}`,
        tone: "danger",
      }),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setPromotionCodeActiveAdmin(id, active),
    onSuccess: (_result, variables) => {
      setMessage({
        text: `Cupom ${variables.active ? "reativado" : "pausado"} com sucesso.`,
        tone: "info",
      });
      void qc.invalidateQueries({ queryKey: ["admin", "promotion-codes"] });
    },
    onError: (error) =>
      setMessage({ text: `Falha ao alterar o cupom: ${(error as Error).message}`, tone: "danger" }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    createCoupon.mutate(form);
  };

  return (
    <>
      {message ? (
        <section className="app-section">
          <AdminAlert tone={message.tone}>{message.text}</AdminAlert>
        </section>
      ) : null}

      <section className="app-section">
        <div className="app-grid app-grid--4">
          <AdminStat label="Cupons ativos" value={String(activeCount)} tone="accent" />
          <AdminStat
            label="Resgates"
            value={String(redemptions)}
            hint="Total registrado na Stripe"
          />
          <AdminStat label="Afiliados vinculados" value={String(linkedAffiliates)} />
          <AdminStat
            label="Ambiente Stripe"
            value={data[0]?.environment === "live" ? "Produção" : "Sandbox"}
            hint="Definido pela chave configurada"
            tone={data[0]?.environment === "live" ? "ok" : "warn"}
          />
        </div>
      </section>

      <section className="app-section">
        <AdminCard
          title="Criar cupom de afiliado"
          hint="A Stripe aplica o desconto e o Pitch AI registra qual afiliado originou a venda."
        >
          {affiliates.error ? <ErrorState error={affiliates.error} /> : null}
          <form onSubmit={submit} className="app-grid app-grid--3">
            <div className="app-field">
              <label htmlFor="coupon-code">Código do cupom</label>
              <input
                id="coupon-code"
                className="app-input"
                value={form.code}
                placeholder="RICK5"
                maxLength={32}
                required
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                  }))
                }
              />
              <span className="app-field-hint">Entre 3 e 32 letras, números ou hífens.</span>
            </div>

            <div className="app-field">
              <label htmlFor="coupon-percent">Desconto (%)</label>
              <input
                id="coupon-percent"
                className="app-input"
                type="number"
                min={1}
                max={100}
                step={0.01}
                required
                value={form.percentOff}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    percentOff: Number(event.currentTarget.value),
                  }))
                }
              />
            </div>

            <div className="app-field">
              <label htmlFor="coupon-affiliate">Afiliado</label>
              <select
                id="coupon-affiliate"
                className="app-select"
                required
                value={form.affiliateCode}
                onChange={(event) =>
                  setForm((current) => ({ ...current, affiliateCode: event.currentTarget.value }))
                }
              >
                <option value="">Selecione…</option>
                {activeAffiliates.map((affiliate) => (
                  <option key={affiliate.code} value={affiliate.code}>
                    {affiliate.name} · {affiliate.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="app-field">
              <label htmlFor="coupon-duration">Duração</label>
              <select
                id="coupon-duration"
                className="app-select"
                value={form.duration}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    duration: event.currentTarget.value === "once" ? "once" : "forever",
                  }))
                }
              >
                <option value="forever">Todas as cobranças</option>
                <option value="once">Somente a primeira cobrança</option>
              </select>
            </div>

            <div className="app-field">
              <label htmlFor="coupon-limit">Limite de usos (opcional)</label>
              <input
                id="coupon-limit"
                className="app-input"
                type="number"
                min={1}
                value={form.maxRedemptions ?? ""}
                placeholder="Sem limite"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxRedemptions: event.currentTarget.value
                      ? Number(event.currentTarget.value)
                      : null,
                  }))
                }
              />
            </div>

            <div className="app-field">
              <label htmlFor="coupon-expiry">Válido até (opcional)</label>
              <input
                id="coupon-expiry"
                className="app-input"
                type="date"
                value={form.expiresAt?.slice(0, 10) ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expiresAt: event.currentTarget.value
                      ? `${event.currentTarget.value}T23:59:59.999Z`
                      : null,
                  }))
                }
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--app-ink-2)]">
              <input
                type="checkbox"
                checked={form.firstTimeOnly}
                onChange={(event) =>
                  setForm((current) => ({ ...current, firstTimeOnly: event.currentTarget.checked }))
                }
              />
              Somente para novos clientes
            </label>

            <div className="flex items-end justify-end app-grid--span-2">
              <button
                type="submit"
                className="app-btn app-btn--primary"
                disabled={
                  createCoupon.isPending || affiliates.isLoading || !activeAffiliates.length
                }
              >
                {createCoupon.isPending ? "Criando…" : "Criar cupom na Stripe"}
              </button>
            </div>
          </form>
        </AdminCard>
      </section>

      <section className="app-section">
        <AdminCard
          title="Cupons cadastrados"
          hint="Pausar impede novos usos sem apagar o histórico."
        >
          {coupons.error ? (
            <ErrorState error={coupons.error} />
          ) : coupons.isLoading ? (
            <AdminLoading />
          ) : !data.length ? (
            <AdminEmpty title="Nenhum cupom cadastrado" hint="Crie o primeiro cupom acima." />
          ) : (
            <div className="app-table-wrap">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>Cupom</th>
                    <th>Desconto</th>
                    <th>Afiliado</th>
                    <th>Duração</th>
                    <th className="num">Usos</th>
                    <th>Validade</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((coupon) => (
                    <tr key={coupon.id} data-tone={coupon.active ? "ok" : undefined}>
                      <td>
                        <strong>{coupon.code}</strong>
                      </td>
                      <td>{coupon.percentOff.toLocaleString("pt-BR")}%</td>
                      <td>
                        {coupon.affiliateName}
                        <br />
                        <small>{coupon.affiliateCode}</small>
                      </td>
                      <td>
                        {coupon.duration === "once" ? "Primeira cobrança" : "Todas as cobranças"}
                      </td>
                      <td className="num">
                        {coupon.timesRedeemed}
                        {coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ""}
                      </td>
                      <td>{formatDate(coupon.expiresAt)}</td>
                      <td>
                        <span className="app-status" data-tone={coupon.active ? "ok" : "neutral"}>
                          {coupon.active ? "Ativo" : "Pausado"}
                        </span>
                      </td>
                      <td>
                        <div className="app-table-actions">
                          <button
                            type="button"
                            className="app-btn app-btn--ghost app-btn--sm"
                            disabled={changeStatus.isPending}
                            onClick={() =>
                              changeStatus.mutate({ id: coupon.id, active: !coupon.active })
                            }
                          >
                            {coupon.active ? "Pausar" : "Reativar"}
                          </button>
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

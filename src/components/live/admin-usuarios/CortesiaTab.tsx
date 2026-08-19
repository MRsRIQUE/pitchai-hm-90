import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCheck } from "lucide-react";
import type { CompedAccess } from "@/lib/live/comped.functions";
import {
  COURTESY_DAY_PRESETS,
  COURTESY_DEFAULT_DAYS,
  COURTESY_DEFAULT_PLAN,
  COURTESY_MAX_DAYS,
  COURTESY_MIN_DAYS,
  COURTESY_NOTE_MAX,
  COURTESY_NOTE_MIN,
  COURTESY_PLAN_IDS,
  findPitchaiPlan,
  type CourtesyPlanId,
} from "@/lib/live/plans";
import { AdminAlert } from "@/components/admin/admin-ui";
import { courtesyRequest, readableServerError } from "./utils";

export function CortesiaTab() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [days, setDays] = useState<number>(COURTESY_DEFAULT_DAYS);
  const [plan, setPlan] = useState<CourtesyPlanId>(COURTESY_DEFAULT_PLAN);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const courtesyProblem = useMemo(() => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return "Digite um e-mail válido.";
    if (!Number.isInteger(days) || days < COURTESY_MIN_DAYS || days > COURTESY_MAX_DAYS)
      return `O período deve ser de ${COURTESY_MIN_DAYS} a ${COURTESY_MAX_DAYS} dias.`;
    if (note.trim().length < COURTESY_NOTE_MIN) return "Descreva o motivo da cortesia.";
    return null;
  }, [email, days, note]);

  const {
    data: compedItems = [],
    isLoading: compedLoading,
    error: compedError,
  } = useQuery({
    queryKey: ["admin", "comped"],
    queryFn: async () => (await courtesyRequest<{ items: CompedAccess[] }>("GET")).items,
  });

  const grantM = useMutation({
    mutationFn: () => courtesyRequest<{ ok: true }>("POST", { email, days, plan, note }),
    onSuccess: (res: any) => {
      if (res?.error) return setMsg({ kind: "err", text: res.error });
      const planName = findPitchaiPlan(plan)?.name ?? plan;
      setMsg({
        kind: "ok",
        text: `Cortesia ${planName} de ${days} dias liberada para ${email}`,
      });
      setEmail("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "comped"] });
    },
    onError: (e: unknown) =>
      setMsg({ kind: "err", text: readableServerError(e, "Falha ao liberar") }),
  });

  const revokeM = useMutation({
    mutationFn: (userId: string) => courtesyRequest<{ ok: true }>("DELETE", { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "comped"] }),
    onError: (e: unknown) =>
      setMsg({ kind: "err", text: readableServerError(e, "Falha ao revogar") }),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#7C3AED]" />
            Liberar Acesso Gratuito (Cortesia Admin)
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Conceda plano Pro sem cobrança por um período determinado para parceiros ou testes de
            clientes. Máximo de {COURTESY_MAX_DAYS} dias por concessão — para estender, conceda de
            novo no vencimento.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wide text-white/40">
              E-mail da conta
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@cliente.com"
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[#7C3AED]"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wide text-white/40">
              Plano concedido
            </span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as CourtesyPlanId)}
              className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[#7C3AED]"
            >
              {COURTESY_PLAN_IDS.map((id) => (
                <option key={id} value={id} className="bg-[#0F0F1A]">
                  {findPitchaiPlan(id)?.name ?? id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-white/40">
            Duração — {days} {days === 1 ? "dia" : "dias"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {COURTESY_DAY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDays(preset)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  days === preset
                    ? "border-[#7C3AED] bg-[#7C3AED]/20 text-white"
                    : "border-white/10 bg-black/40 text-white/60 hover:border-white/30"
                }`}
              >
                {preset}d
              </button>
            ))}
            <input
              type="number"
              min={COURTESY_MIN_DAYS}
              max={COURTESY_MAX_DAYS}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Duração personalizada em dias"
              className="w-24 rounded-lg bg-black/40 border border-white/10 px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-[#7C3AED]"
            />
          </div>
        </div>

        <label className="block space-y-1">
          <span className="block text-[10px] uppercase tracking-wide text-white/40">
            Motivo (obrigatório)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, COURTESY_NOTE_MAX))}
            placeholder="Ex: Parceiro TikTok — campanha de setembro"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-[#7C3AED]"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!!courtesyProblem || grantM.isPending}
            onClick={() => {
              setMsg(null);
              grantM.mutate();
            }}
            className="rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] px-4 py-2 text-xs font-semibold disabled:opacity-50 transition"
          >
            {grantM.isPending ? "Liberando…" : "Liberar Cortesia"}
          </button>
          {courtesyProblem && <span className="text-xs text-white/40">{courtesyProblem}</span>}
        </div>
        {msg && <AdminAlert tone={msg.kind === "ok" ? "info" : "danger"}>{msg.text}</AdminAlert>}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="font-semibold text-sm">Acessos Ativos por Cortesia</h2>
        {compedError && (
          <AdminAlert tone="danger">
            {readableServerError(compedError, "Falha ao carregar as cortesias.")}
          </AdminAlert>
        )}
        {compedLoading ? (
          <p className="text-xs text-white/50">Carregando acessos…</p>
        ) : compedItems.length === 0 ? (
          <p className="text-xs text-white/50">Nenhum acesso gratuito concedido ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-white/50 border-b border-white/10">
                <tr>
                  <th className="py-2.5 pr-4">E-mail</th>
                  <th className="py-2.5 pr-4">Plano</th>
                  <th className="py-2.5 pr-4">Válido Até</th>
                  <th className="py-2.5 pr-4">Motivo / Observação</th>
                  <th className="py-2.5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {compedItems.map((u: CompedAccess) => (
                  <tr key={u.userId}>
                    <td className="py-2.5 pr-4 font-sans text-white">{u.email}</td>
                    <td className="py-2.5 pr-4 text-[#00E676] font-bold font-sans">
                      {findPitchaiPlan(u.plan)?.name ?? u.plan}
                    </td>
                    <td className="py-2.5 pr-4 text-white/70">
                      {u.grantedUntil
                        ? new Date(u.grantedUntil).toLocaleDateString("pt-BR")
                        : "Indeterminado"}
                    </td>
                    <td className="py-2.5 pr-4 text-white/60 font-sans">{u.note ?? "—"}</td>
                    <td className="py-2.5 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => revokeM.mutate(u.userId)}
                        className="text-red-400 hover:text-red-300 underline font-medium"
                      >
                        Revogar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

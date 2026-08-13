import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";
import {
  checkIsAdmin,
  deleteAllRankedProducts,
  deleteRankedProduct,
  fetchCommissions,
  fetchCosts,
  fetchPlans,
  fetchRanking,
  insertRankedProducts,
  parseRankingCSV,
  setCommissionStatus,
  updateCosts,
  updatePlan,
  updateRankedProduct,
  type AdminCommission,
  type Costs,
  type Plan,
  type RankedProduct,
} from "@/lib/live/admin";
import { UsuariosTab } from "@/components/live/AdminUsuariosTab";
import { AdminFirestoreUsageTab } from "@/components/live/AdminFirestoreUsageTab";

export const Route = createFileRoute("/admin")({
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [{ title: "Admin · Pitch AI" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

type Tab = "ranking" | "indicacoes" | "usuarios" | "usage_firestore" | "planos" | "custos";

function AdminPage() {
  const [status, setStatus] = useState<"loading" | "signed-out" | "not-admin" | "ok">("loading");
  const [email, setEmail] = useState<string>("");

  async function evaluate() {
    const fbAuth = getFirebaseAuth();
    const user = fbAuth.currentUser;
    if (!user) {
      setStatus("signed-out");
      return;
    }
    setEmail(user.email ?? "");
    const admin = await checkIsAdmin(user.uid, user.email);
    setStatus(admin ? "ok" : "not-admin");
  }

  useEffect(() => {
    evaluate();
    const unsub = onAuthStateChanged(getFirebaseAuth(), () => evaluate());
    return () => unsub();
  }, []);

  async function logout() {
    await firebaseSignOut(getFirebaseAuth());
    setStatus("signed-out");
  }

  if (status === "loading") {
    return (
      <div className="min-h-dvh grid place-items-center bg-[#0F0F1A] text-white/60">
        Carregando…
      </div>
    );
  }
  if (status === "signed-out") return <LoginGate />;
  if (status === "not-admin") return <NotAdmin email={email} onLogout={logout} />;
  return <Dashboard email={email} onLogout={logout} />;
}

/* ---------- Gate ---------- */
function LoginGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch (err: any) {
      setErr(err?.message ?? "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center bg-[#0F0F1A] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4 backdrop-blur"
      >
        <div>
          <h1 className="text-xl font-bold text-white">Admin · Pitch AI</h1>
          <p className="text-sm text-white/60 mt-1">Faça login com uma conta admin.</p>
        </div>
        <input
          type="email"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white outline-none focus:border-[#7C3AED]"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="senha"
          className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-white outline-none focus:border-[#7C3AED]"
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white font-semibold py-2 transition"
        >
          {busy ? "Entrando…" : "Entrar"}
        </button>
        <p className="text-xs text-white/40">
          O acesso admin é concedido pela allowlist de e-mails ou por um documento em{" "}
          <code>admins/&#123;uid&#125;</code>.
        </p>
      </form>
    </div>
  );
}

function NotAdmin({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="min-h-dvh grid place-items-center bg-[#0F0F1A] px-4 text-white">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="text-white/60 text-sm">
          A conta <b>{email}</b> não tem o papel <code>admin</code>.
        </p>
        <button
          onClick={onLogout}
          className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("ranking");
  return (
    <div className="min-h-dvh bg-[#0F0F1A] text-white">
      <header className="border-b border-white/10 bg-black/40 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <span className="text-lg font-bold">
            Pitch AI <span className="text-[#FF6B35]">Admin</span>
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-white/60 hidden sm:inline">{email}</span>
            <button onClick={onLogout} className="text-white/70 hover:text-white underline">
              Sair
            </button>
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {(
            ["ranking", "indicacoes", "usuarios", "usage_firestore", "planos", "custos"] as Tab[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition whitespace-nowrap ${
                tab === t
                  ? "border-[#7C3AED] text-white"
                  : "border-transparent text-white/60 hover:text-white"
              }`}
            >
              {t === "ranking" && "Ranking de produtos"}
              {t === "indicacoes" && "Indicações"}
              {t === "usuarios" && "Usuários, Custos & Cotas"}
              {t === "usage_firestore" && "⚡ Uso IA Real-Time (Firestore)"}
              {t === "planos" && "Planos & receita"}
              {t === "custos" && "Custos Globais de IA"}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "ranking" && <RankingTab />}
        {tab === "indicacoes" && <IndicacoesTab />}
        {tab === "usuarios" && <UsuariosTab />}
        {tab === "usage_firestore" && <AdminFirestoreUsageTab />}
        {tab === "planos" && <PlanosTab />}
        {tab === "custos" && <CustosTab />}
      </main>
    </div>
  );
}

/* ---------- Indicações ---------- */
function IndicacoesTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin", "commissions"],
    queryFn: fetchCommissions,
  });
  const statusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pendente" | "pago" | "cancelado" }) =>
      setCommissionStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "commissions"] }),
  });

  const pend = items.filter((c) => c.status === "pendente");
  const pago = items.filter((c) => c.status === "pago");
  const sum = (arr: AdminCommission[]) => arr.reduce((s, c) => s + c.amount_cents, 0) / 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Comissões" value={items.length.toString()} />
        <Stat label="A pagar" value={brl(sum(pend))} />
        <Stat label="Já pago" value={brl(sum(pago))} />
        <Stat label="Taxa nível 1" value="60%" />
      </div>

      <Card
        title="Comissões de indicação"
        hint="Marque como pago depois de enviar o PIX ao indicador."
      >
        {isLoading ? (
          <p className="text-white/50 text-sm py-6 text-center">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-white/50 text-sm py-6 text-center">
            Nenhuma comissão registrada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 text-left border-b border-white/10">
                  <th className="py-2 pr-2">Data</th>
                  <th className="py-2 pr-2">Indicador</th>
                  <th className="py-2 pr-2">Indicado</th>
                  <th className="py-2 pr-2">Plano</th>
                  <th className="py-2 pr-2 text-right">Base</th>
                  <th className="py-2 pr-2 text-right">Comissão</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} className="border-b border-white/5">
                    <td className="py-2 pr-2 text-white/60">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs">{c.referrer_id.slice(0, 8)}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{c.referred_id.slice(0, 8)}</td>
                    <td className="py-2 pr-2 uppercase">{c.plan ?? "—"}</td>
                    <td className="py-2 pr-2 text-right font-mono text-white/60">
                      {brl(c.base_cents / 100)}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono text-[#00E676]">
                      {brl(c.amount_cents / 100)}
                    </td>
                    <td className="py-2 pr-2">{c.status}</td>
                    <td className="py-2 text-right space-x-2 whitespace-nowrap">
                      {c.status !== "pago" && (
                        <button
                          onClick={() => statusM.mutate({ id: c.id, status: "pago" })}
                          className="rounded bg-[#00E676]/15 text-[#00E676] px-2 py-1 text-xs"
                        >
                          Marcar pago
                        </button>
                      )}
                      {c.status !== "cancelado" && (
                        <button
                          onClick={() => statusM.mutate({ id: c.id, status: "cancelado" })}
                          className="rounded bg-white/5 px-2 py-1 text-xs text-white/60"
                        >
                          Cancelar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Ranking ---------- */
function RankingTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin", "ranking"],
    queryFn: fetchRanking,
  });
  const [raw, setRaw] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "ranking"] });

  const importM = useMutation({
    mutationFn: async (r: string) => {
      const parsed = parseRankingCSV(r);
      await insertRankedProducts(parsed);
    },
    onSuccess: () => {
      setRaw("");
      invalidate();
    },
  });
  const patchM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<RankedProduct> }) =>
      updateRankedProduct(id, patch),
    onSuccess: invalidate,
  });
  const delM = useMutation({
    mutationFn: (id: string) => deleteRankedProduct(id),
    onSuccess: invalidate,
  });
  const resetM = useMutation({
    mutationFn: () => deleteAllRankedProducts(),
    onSuccess: invalidate,
  });

  const totalVendas = items.reduce((s, p) => s + p.vendas, 0);
  const totalReceita = items.reduce((s, p) => s + Number(p.receita), 0);
  const destaques = items.filter((p) => p.destaque);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Produtos" value={items.length.toString()} />
        <Stat label="Destaques" value={destaques.length.toString()} />
        <Stat label="Vendas totais" value={totalVendas.toLocaleString("pt-BR")} />
        <Stat label="Receita" value={brl(totalReceita)} />
      </div>

      <Card
        title="Importar do TikTok Shop"
        hint="Cole no formato: nome,vendas,receita (uma linha por produto). Separador , ; ou tab."
      >
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder={`Camiseta preta,320,9600\nCaneca personalizada,210,4200\n...`}
          className="w-full rounded-lg bg-black/40 border border-white/10 p-3 text-sm font-mono text-white outline-none focus:border-[#7C3AED]"
        />
        <div className="flex gap-2">
          <button
            onClick={() => importM.mutate(raw)}
            disabled={!raw.trim() || importM.isPending}
            className="rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 px-4 py-2 text-sm font-semibold"
          >
            {importM.isPending ? "Importando…" : "Importar"}
          </button>
          <button
            onClick={() => {
              if (confirm("Apagar todo o ranking?")) resetM.mutate();
            }}
            className="rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 text-sm"
          >
            Limpar tudo
          </button>
        </div>
        {importM.error && (
          <p className="text-sm text-red-400">{(importM.error as Error).message}</p>
        )}
      </Card>

      <ProdutoPorLinkCard onDone={invalidate} />

      <Card title="Ranking" hint="Marque a estrela para destacar os melhores produtos.">
        {isLoading ? (
          <p className="text-white/50 text-sm py-6 text-center">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-white/50 text-sm py-6 text-center">
            Sem produtos ainda. Importe acima.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 text-left border-b border-white/10">
                  <th className="py-2 pr-2 w-10">#</th>
                  <th className="py-2 pr-2 w-10">★</th>
                  <th className="py-2 pr-2">Produto</th>
                  <th className="py-2 pr-2 text-right">Vendas</th>
                  <th className="py-2 pr-2 text-right">Receita</th>
                  <th className="py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.id} className="border-b border-white/5">
                    <td className="py-2 pr-2 text-white/40 font-mono">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <button
                        onClick={() =>
                          patchM.mutate({ id: p.id, patch: { destaque: !p.destaque } })
                        }
                        className={`text-lg leading-none ${p.destaque ? "text-[#FF6B35]" : "text-white/20 hover:text-white/60"}`}
                        title={p.destaque ? "Remover destaque" : "Destacar"}
                      >
                        ★
                      </button>
                    </td>
                    <td className="py-2 pr-2">{p.nome}</td>
                    <td className="py-2 pr-2 text-right font-mono">
                      {p.vendas.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">{brl(Number(p.receita))}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => delM.mutate(p.id)}
                        className="text-white/40 hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Planos ---------- */
function PlanosTab() {
  const qc = useQueryClient();
  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: fetchPlans,
  });
  const patchM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Plan> }) => updatePlan(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });

  const mrr = plans.reduce((s, p) => s + Number(p.preco_mensal) * p.assinantes, 0);
  const arr = mrr * 12;
  const totalUsers = plans.reduce((s, p) => s + p.assinantes, 0);
  const arpu = totalUsers > 0 ? mrr / totalUsers : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="MRR" value={brl(mrr)} />
        <Stat label="ARR" value={brl(arr)} />
        <Stat label="Assinantes" value={totalUsers.toString()} />
        <Stat label="ARPU" value={brl(arpu)} />
      </div>

      <Card title="Planos" hint="Ajuste preço mensal e nº de assinantes para simular receita.">
        {isLoading ? (
          <p className="text-white/50 text-sm py-4">Carregando…</p>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <div
                key={p.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px_140px] gap-3 items-center bg-black/30 border border-white/10 rounded-lg p-3"
              >
                <input
                  defaultValue={p.nome}
                  onBlur={(e) => {
                    if (e.target.value !== p.nome)
                      patchM.mutate({ id: p.id, patch: { nome: e.target.value } });
                  }}
                  className="bg-transparent border-b border-white/10 focus:border-[#7C3AED] outline-none py-1"
                />
                <label className="text-xs text-white/60 flex flex-col">
                  Preço/mês (R$)
                  <input
                    type="number"
                    min={0}
                    defaultValue={p.preco_mensal}
                    onBlur={(e) => {
                      const v = +e.target.value || 0;
                      if (v !== p.preco_mensal)
                        patchM.mutate({ id: p.id, patch: { preco_mensal: v } });
                    }}
                    className="mt-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-white font-mono"
                  />
                </label>
                <label className="text-xs text-white/60 flex flex-col">
                  Assinantes
                  <input
                    type="number"
                    min={0}
                    defaultValue={p.assinantes}
                    onBlur={(e) => {
                      const v = +e.target.value || 0;
                      if (v !== p.assinantes) patchM.mutate({ id: p.id, patch: { assinantes: v } });
                    }}
                    className="mt-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-white font-mono"
                  />
                </label>
                <div className="text-right">
                  <div className="text-xs text-white/40">Receita/mês</div>
                  <div className="font-mono text-[#00E676]">
                    {brl(Number(p.preco_mensal) * p.assinantes)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Custos ---------- */
function CustosTab() {
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({
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

  if (isLoading || !c) return <p className="text-white/50 text-sm">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Custo Chat" value={`$${custoChatUsd.toFixed(2)}`} />
        <Stat label="Custo TTS" value={`$${custoTtsUsd.toFixed(2)}`} />
        <Stat label="Total mês" value={brl(totalBrl)} sub={`$${totalUsd.toFixed(2)}`} />
        <Stat label="Margem vs MRR" value={`${margem.toFixed(1)}%`} sub={brl(mrr - totalBrl)} />
      </div>

      <Card title="Preços do provedor (USD)">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      </Card>

      <Card title="Uso mensal estimado">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
      </Card>

      <Card title="Câmbio">
        <NumField
          label="USD → BRL"
          value={Number(c.usd_brl)}
          step={0.01}
          onChange={(v) => patchM.mutate({ usd_brl: v })}
        />
      </Card>
    </div>
  );
}

/* ---------- UI helpers ---------- */
function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-white/50 mt-1">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className="text-xl font-bold font-mono">{value}</div>
      {sub && <div className="text-xs text-white/40 font-mono">{sub}</div>}
    </div>
  );
}
function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col text-xs text-white/60">
      {label}
      <input
        type="number"
        defaultValue={value}
        step={step ?? 1}
        min={0}
        onBlur={(e) => {
          const v = +e.target.value || 0;
          if (v !== value) onChange(v);
        }}
        className="mt-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-white font-mono outline-none focus:border-[#7C3AED]"
      />
    </label>
  );
}
function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ---------- Produto por link (manual) ---------- */
function ProdutoPorLinkCard({ onDone }: { onDone: () => void }) {
  const empty = {
    nome: "",
    link: "",
    imagem_url: "",
    categoria: "",
    preco: 0,
    comissao_pct: 0,
    vendas: 0,
    destaque: false,
  };
  const [form, setForm] = useState(empty);

  const addM = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Informe o nome do produto.");
      await insertRankedProducts([
        {
          nome: form.nome.trim(),
          link: form.link.trim() || null,
          imagem_url: form.imagem_url.trim() || null,
          categoria: form.categoria.trim() || null,
          preco: Number(form.preco) || 0,
          comissao_pct: Number(form.comissao_pct) || 0,
          vendas: Number(form.vendas) || 0,
          receita: (Number(form.preco) || 0) * (Number(form.vendas) || 0),
          destaque: form.destaque,
        },
      ]);
    },
    onSuccess: () => {
      setForm(empty);
      onDone();
    },
  });

  const field =
    "mt-1 w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-white outline-none focus:border-[#7C3AED]";

  return (
    <Card
      title="Adicionar produto pelo link"
      hint="Cole o link do produto e preencha os dados manualmente. Aparece na página pública /quentes."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/60">
        <label className="sm:col-span-2">
          Nome do produto
          <input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className={field}
            placeholder="Kit skincare vitamina C"
          />
        </label>
        <label className="sm:col-span-2">
          Link do produto
          <input
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
            className={field}
            placeholder="https://shop.tiktok.com/..."
          />
        </label>
        <label className="sm:col-span-2">
          URL da imagem
          <input
            value={form.imagem_url}
            onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
            className={field}
            placeholder="https://..."
          />
        </label>
        <label>
          Categoria
          <input
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className={field}
            placeholder="Beleza"
          />
        </label>
        <label>
          Preço (R$)
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.preco}
            onChange={(e) => setForm({ ...form, preco: +e.target.value || 0 })}
            className={`${field} font-mono`}
          />
        </label>
        <label>
          Comissão (%)
          <input
            type="number"
            min={0}
            step={1}
            value={form.comissao_pct}
            onChange={(e) => setForm({ ...form, comissao_pct: +e.target.value || 0 })}
            className={`${field} font-mono`}
          />
        </label>
        <label>
          Vendas
          <input
            type="number"
            min={0}
            value={form.vendas}
            onChange={(e) => setForm({ ...form, vendas: +e.target.value || 0 })}
            className={`${field} font-mono`}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={form.destaque}
          onChange={(e) => setForm({ ...form, destaque: e.target.checked })}
        />
        Marcar como destaque 🔥
      </label>

      {addM.error && <p className="text-sm text-red-400">{(addM.error as Error).message}</p>}
      <button
        onClick={() => addM.mutate()}
        disabled={addM.isPending}
        className="rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-40 px-4 py-2 text-sm font-semibold"
      >
        {addM.isPending ? "Salvando…" : "Adicionar ao ranking"}
      </button>
    </Card>
  );
}

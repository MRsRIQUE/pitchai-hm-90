import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";
import {
  Loader2,
  ArrowLeft,
  Trash2,
  Mic,
  MessageCircle,
  Ban,
  ShoppingBag,
  DollarSign,
} from "lucide-react";
import { deleteSession, listMySessions, type LiveSessionRow } from "@/lib/live/sync";
import { toast } from "sonner";
import { SitePageFrame } from "@/components/live/SitePageFrame";

export const Route = createFileRoute("/lives")({
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [
      { title: "Minhas lives · Pitch AI" },
      {
        name: "description",
        content:
          "Histórico das suas lives com IA no Pitch AI: mensagens respondidas, produtos apresentados, tokens e custo estimado.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LivesPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDuration(startIso: string, endIso: string | null) {
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m}min`;
}
function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function LivesPage() {
  const [status, setStatus] = useState<"loading" | "signed-out" | "ok">("loading");
  const [rows, setRows] = useState<LiveSessionRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setRows(await listMySessions(100));
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const fbAuth = getFirebaseAuth();
    if (fbAuth.currentUser) {
      setStatus("ok");
      refresh();
    } else {
      setStatus("signed-out");
    }
    const unsub = onAuthStateChanged(fbAuth, (user) => {
      if (!user) setStatus("signed-out");
      else {
        setStatus("ok");
        refresh();
      }
    });
    return () => unsub();
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.answered += r.messages_answered;
        acc.ignored += r.messages_ignored;
        acc.blocked += r.messages_blocked;
        acc.cost += r.estimated_cost_cents;
        return acc;
      },
      { answered: 0, ignored: 0, blocked: 0, cost: 0 },
    );
  }, [rows]);

  return (
    /* lista longa: o quadriculado sai para não competir com as linhas */
    <SitePageFrame grid={false}>
      <div className="wrap">
        <header className="sec-head">
          <div className="eyebrow">Histórico</div>
          <h1>
            Minhas <em className="h1-serif">lives</em>
          </h1>
          <div className="site-page-meta">
            <Link to="/app" className="lv-back">
              <ArrowLeft /> Voltar ao painel
            </Link>
            <button type="button" className="btn btn-outline" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="lv-spin" /> : "Atualizar"}
            </button>
          </div>
        </header>

        {status === "loading" && <p className="site-page-note">Carregando…</p>}

        {status === "signed-out" && (
          <div className="card lv-empty">
            <h3>Faça login pra ver seu histórico</h3>
            <p>
              <Link to="/entrar" search={{ next: "/lives" }}>
                Entrar na minha conta
              </Link>{" "}
              pra sincronizar o histórico das suas lives.
            </p>
          </div>
        )}

        {status === "ok" && (
          <>
            <div className="stats-grid lv-stats">
              <Stat label="Respondidas" value={totals.answered.toLocaleString("pt-BR")} />
              <Stat label="Ignoradas" value={totals.ignored.toLocaleString("pt-BR")} />
              <Stat label="Bloqueadas" value={totals.blocked.toLocaleString("pt-BR")} />
              <Stat label="Custo estimado" value={fmtBRL(totals.cost)} />
            </div>

            {rows.length === 0 ? (
              <div className="card lv-empty">
                <p>
                  Nenhuma live registrada ainda. Instale a extensão, cole seu sync token e comece
                  uma live no TikTok — o histórico aparece aqui.
                </p>
              </div>
            ) : (
              <div className="lv-list">
                {rows.map((r) => (
                  <SessionRow key={r.id} row={r} onDelete={refresh} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </SitePageFrame>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-n">{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function SessionRow({ row, onDelete }: { row: LiveSessionRow; onDelete: () => void }) {
  const [busy, setBusy] = useState(false);
  const products = Array.isArray(row.products_pitched) ? row.products_pitched : [];

  async function handleDelete() {
    if (!confirm("Apagar essa live do histórico?")) return;
    setBusy(true);
    try {
      await deleteSession(row.id);
      onDelete();
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card lv-row">
      <div className="lv-row-main">
        <div className="lv-title">
          {fmtDate(row.started_at)}
          <span className="lv-dur">
            {fmtDuration(row.started_at, row.ended_at)}
            {row.ended_at ? "" : " · em andamento"}
          </span>
        </div>

        <div className="lv-meta">
          <span>
            <MessageCircle /> {row.messages_answered} respondidas
          </span>
          <span>
            <Mic /> {row.messages_ignored} ignoradas
          </span>
          <span>
            <Ban /> {row.messages_blocked} bloqueadas
          </span>
          <span>
            tokens: {row.tokens_in.toLocaleString("pt-BR")} in ·{" "}
            {row.tokens_out.toLocaleString("pt-BR")} out
          </span>
          <span>TTS: {row.tts_seconds}s</span>
          <span className="lv-cost">
            <DollarSign /> {fmtBRL(row.estimated_cost_cents)}
          </span>
        </div>

        {products.length > 0 && (
          <div className="lv-products">
            {products.slice(0, 8).map((p, i) => (
              <span className="lv-tag" key={i}>
                <ShoppingBag /> {p.name}
              </span>
            ))}
            {products.length > 8 && <span className="lv-more">+{products.length - 8}</span>}
          </div>
        )}
      </div>

      <button
        type="button"
        className="btn btn-ghost lv-del"
        onClick={handleDelete}
        disabled={busy}
        aria-label="Apagar"
      >
        {busy ? <Loader2 className="lv-spin" /> : <Trash2 />}
      </button>
    </article>
  );
}

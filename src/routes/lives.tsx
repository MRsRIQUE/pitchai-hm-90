import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { SiteNav } from "@/components/live/SiteNav";

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
    <main className="marketing-page min-h-screen bg-background">
      <SiteNav />
      <header className="border-b border-border bg-background/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao painel
          </Link>
          <h1 className="marketing-title text-2xl">Minhas lives</h1>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar"}
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {status === "loading" && (
          <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </Card>
        )}

        {status === "signed-out" && (
          <Card className="space-y-2 p-6">
            <div className="text-sm font-semibold">Faça login pra ver seu histórico</div>
            <p className="text-xs text-muted-foreground">
              <Link to="/entrar" search={{ next: "/lives" }} className="text-primary underline">
                Entrar na minha conta
              </Link>{" "}
              pra sincronizar o histórico das suas lives.
            </p>
          </Card>
        )}

        {status === "ok" && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="Respondidas" value={totals.answered} icon={MessageCircle} />
              <StatCard label="Ignoradas" value={totals.ignored} icon={Mic} />
              <StatCard label="Bloqueadas" value={totals.blocked} icon={Ban} />
              <StatCard label="Custo estimado" value={fmtBRL(totals.cost)} icon={DollarSign} />
            </div>

            {rows.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma live registrada ainda. Instale a extensão, cole seu sync token e comece uma
                live no TikTok — o histórico aparece aqui.
              </Card>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <SessionRow key={r.id} row={r} onDelete={refresh} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </Card>
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
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {fmtDate(row.started_at)}{" "}
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
              {fmtDuration(row.started_at, row.ended_at)}
              {row.ended_at ? "" : " · em andamento"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <MessageCircle className="mr-1 inline h-3 w-3" />
              {row.messages_answered} respondidas
            </span>
            <span>
              <Mic className="mr-1 inline h-3 w-3" />
              {row.messages_ignored} ignoradas
            </span>
            <span>
              <Ban className="mr-1 inline h-3 w-3" />
              {row.messages_blocked} bloqueadas
            </span>
            <span>
              tokens: {row.tokens_in.toLocaleString()} in · {row.tokens_out.toLocaleString()} out
            </span>
            <span>TTS: {row.tts_seconds}s</span>
            <span className="font-medium text-foreground">
              <DollarSign className="mr-0.5 inline h-3 w-3" />
              {fmtBRL(row.estimated_cost_cents)}
            </span>
          </div>
          {products.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {products.slice(0, 8).map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                >
                  <ShoppingBag className="h-3 w-3" />
                  {p.name}
                </span>
              ))}
              {products.length > 8 && (
                <span className="text-[11px] text-muted-foreground">+{products.length - 8}</span>
              )}
            </div>
          )}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          disabled={busy}
          aria-label="Apagar"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 text-destructive" />
          )}
        </Button>
      </div>
    </Card>
  );
}

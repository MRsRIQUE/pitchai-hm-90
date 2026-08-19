import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { onAuthStateChanged } from "firebase/auth";
import { Home, LayoutPanelLeft } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase";
import { requireAuthBeforeLoad } from "@/lib/auth-guard";
import { fetchCommissions } from "@/lib/live/admin";
import { AppShell, type AppSection } from "@/components/app/AppShell";
import { LogoutButton } from "@/components/live/LogoutButton";
import { ADMIN_SECTIONS, type AdminSectionId } from "@/components/admin/sections";
import { OverviewSection } from "@/components/admin/OverviewSection";
import { RankingSection } from "@/components/admin/RankingSection";
import { IndicacoesSection } from "@/components/admin/IndicacoesSection";
import { PlanosSection } from "@/components/admin/PlanosSection";
import { CustosSection } from "@/components/admin/CustosSection";
import { UsuariosTab } from "@/components/live/AdminUsuariosTab";
import { AdminFirestoreUsageTab } from "@/components/live/AdminFirestoreUsageTab";

export const Route = createFileRoute("/admin")({
  beforeLoad: requireAuthBeforeLoad,
  head: () => ({
    meta: [{ title: "Admin · Pitch AI" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

type AdminCheckResult = {
  status: "ok" | "signed-out" | "not-admin";
  email: string;
  errorMsg: string;
};

function AdminPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<AdminCheckResult>({
    queryKey: ["admin", "check"],
    queryFn: async ({ signal }): Promise<AdminCheckResult> => {
      const fbAuth = getFirebaseAuth();
      const user = fbAuth.currentUser;
      if (!user) return { status: "signed-out", email: "", errorMsg: "" };

      const email = user.email ?? "";
      const token = await user.getIdToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      if (signal) signal.addEventListener("abort", () => controller.abort());

      try {
        const res = await fetch("/api/admin/check", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const json = await res.json().catch(() => ({}) as { ok?: boolean; error?: string });

        if (json.ok) return { status: "ok", email, errorMsg: "" };

        return {
          status: res.status === 401 ? "signed-out" : "not-admin",
          email,
          errorMsg: json.error ?? "",
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("Falha ao validar acesso administrativo:", error);
        return {
          status: "not-admin",
          email,
          errorMsg: msg.includes("abort") ? "Tempo esgotado ao verificar acesso." : msg,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1_000,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), () => {
      qc.invalidateQueries({ queryKey: ["admin", "check"] });
    });
    return () => unsub();
  }, [qc]);

  if (isLoading) {
    return (
      <div className="marketing-page min-h-dvh grid place-items-center text-white/60">
        Carregando…
      </div>
    );
  }

  const result = data ?? { status: "not-admin" as const, email: "", errorMsg: "" };
  if (result.status === "signed-out") return <SessionExpired />;
  if (result.status === "not-admin")
    return <NotAdmin email={result.email} errorMsg={result.errorMsg} />;
  return <Dashboard email={result.email} />;
}

function SessionExpired() {
  return (
    <div className="marketing-page min-h-dvh grid place-items-center px-4">
      <div className="marketing-panel w-full max-w-sm rounded-2xl p-6 text-center space-y-4 backdrop-blur">
        <h1 className="marketing-title text-2xl">Sessão encerrada</h1>
        <p className="text-sm text-white/60">
          Entre novamente para acessar o painel administrativo.
        </p>
        <a
          href="/entrar?next=/admin"
          className="block rounded-lg bg-[#7C3AED] px-4 py-2 font-semibold text-white"
        >
          Entrar novamente
        </a>
      </div>
    </div>
  );
}

function NotAdmin({ email, errorMsg }: { email: string; errorMsg?: string }) {
  return (
    <div className="marketing-page min-h-dvh grid place-items-center px-4">
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-bold">Sem permissão</h1>
        <p className="text-white/60 text-sm">
          A conta <b>{email}</b> não tem o papel <code>admin</code>.
        </p>
        {errorMsg && (
          <details className="text-left text-xs text-white/40 bg-white/5 p-3 rounded border border-white/10">
            <summary className="cursor-pointer select-none">Detalhes do erro</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all">{errorMsg}</pre>
          </details>
        )}
        <div className="flex justify-center">
          <LogoutButton alwaysShowLabel />
        </div>
      </div>
    </div>
  );
}

/**
 * Orquestrador do painel: guarda de admin, seção ativa e a casca compartilhada
 * com o `/app`. Todo o conteúdo mora em `components/admin/*`.
 */
function Dashboard({ email }: { email: string }) {
  const [active, setActive] = useState<AdminSectionId>("overview");

  // Mesma chave que a visão geral consome: a pastilha de comissões pendentes
  // sai do cache, sem uma consulta só para ela.
  const commissions = useQuery({ queryKey: ["admin", "commissions"], queryFn: fetchCommissions });
  const pendingCount = (commissions.data ?? []).filter((item) => item.status === "pendente").length;

  const sections = useMemo<AppSection[]>(
    () =>
      ADMIN_SECTIONS.map((section) =>
        section.id === "indicacoes" && pendingCount > 0
          ? { ...section, badge: { text: String(pendingCount), tone: "warn" as const } }
          : section,
      ),
    [pendingCount],
  );

  return (
    <AppShell
      sections={sections}
      active={active}
      onSelect={(id) => setActive(id as AdminSectionId)}
      navLabel="Administração"
      shortcuts={[
        { to: "/app", label: "Painel do usuário", icon: LayoutPanelLeft },
        { to: "/", label: "Página inicial", icon: Home },
      ]}
      actions={<LogoutButton />}
      footer={
        <div className="truncate" title={email}>
          Conectado como {email}
        </div>
      }
    >
      {active === "overview" && <OverviewSection onNavigate={setActive} />}
      {active === "ranking" && <RankingSection />}
      {active === "indicacoes" && <IndicacoesSection />}
      {active === "usuarios" && <UsuariosTab />}
      {active === "usage_firestore" && <AdminFirestoreUsageTab />}
      {active === "planos" && <PlanosSection />}
      {active === "custos" && <CustosSection />}
    </AppShell>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { confirmPasswordReset } from "firebase/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Definir nova senha · Pitch AI" },
      {
        name: "description",
        content: "Escolha uma nova senha para voltar a acessar o painel da Pitch AI.",
      },
      { property: "og:title", content: "Definir nova senha · Pitch AI" },
      {
        property: "og:description",
        content: "Escolha uma nova senha para acessar o painel da Pitch AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oobCode, setOobCode] = useState("");

  useEffect(() => {
    // O link do Firebase chega com ?oobCode=...&mode=resetPassword na URL.
    const params = new URLSearchParams(window.location.search);
    const code = params.get("oobCode");
    const mode = params.get("mode");
    setOobCode(code ?? "");
    setReady(Boolean(code && mode === "resetPassword"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await confirmPasswordReset(getFirebaseAuth(), oobCode, password);
      toast.success("Senha atualizada!");
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível redefinir a senha");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0F0F1A] px-4 text-white">
      <div className="w-full max-w-sm space-y-5">
        <h1 className="text-center text-xl font-semibold">Definir nova senha</h1>
        {!ready ? (
          <p className="text-center text-sm text-white/50">
            Link inválido ou expirado.{" "}
            <Link to="/entrar" className="underline">
              Pedir outro link
            </Link>
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Nova senha (mín. 8 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#7C3AED]"
            />
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar nova senha
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

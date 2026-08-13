import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  signInWithPopup,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb, googleProvider } from "@/lib/firebase";

type Search = { next?: string };

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar na sua conta · Pitch AI" },
      {
        name: "description",
        content:
          "Acesse o painel da Pitch AI para configurar sua IA vendedora, sincronizar a extensão e acompanhar suas lives.",
      },
      { property: "og:title", content: "Entrar na sua conta · Pitch AI" },
      {
        property: "og:description",
        content: "Acesse o painel da Pitch AI e coloque sua IA vendedora no ar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  component: EntrarPage,
});

/** Só aceita caminho interno — nunca URL externa vinda da query. */
function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

function EntrarPage() {
  const { next } = useSearch({ from: "/entrar" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const dest = safeNext(next);

  useEffect(() => {
    const fbAuth = getFirebaseAuth();
    // Apenas onAuthStateChanged dirá o estado real (incluindo persistence
    // hydrated). Evitamos a chamada concorrente `currentUser?.getIdToken().then(...)`
    // que causava double-navigate quando o usuário já estava logado.
    const unsubFb = onAuthStateChanged(fbAuth, (user) => {
      if (user) {
        navigate({ to: dest });
      }
    });
    return () => {
      unsubFb();
    };
  }, [dest, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const fbAuth = getFirebaseAuth();
    try {
      if (mode === "login") {
        const { user } = await signInWithEmailAndPassword(fbAuth, email, password);
        await ensureUserDoc(user.uid, user.email ?? email);
        toast.success("Login efetuado com sucesso!");
        navigate({ to: dest });
      } else if (mode === "signup") {
        const { user } = await createUserWithEmailAndPassword(fbAuth, email, password);
        await ensureUserDoc(user.uid, user.email ?? email);
        toast.success("Conta criada! Redirecionando...");
        navigate({ to: dest });
      } else {
        await sendPasswordResetEmail(fbAuth, email, {
          url: window.location.origin + "/reset-password",
        });
        // Mensagem genérica evita enumeração de e-mails (não revela se o
        // email está cadastrado ou não).
        toast.success("Se o e-mail estiver cadastrado, enviamos um link de redefinição.");
        setMode("login");
      }
    } catch (err) {
      //err?.message ?? "Não foi possível continuar")
      const msg = err instanceof Error ? err.message : "Não foi possível continuar";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    try {
      const fbAuth = getFirebaseAuth();
      const { user } = await signInWithPopup(fbAuth, googleProvider);
      await ensureUserDoc(user.uid, user.email ?? "");
      toast.success("Autenticado com Google com sucesso!");
      navigate({ to: dest });
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Falha no login com Google.");
    } finally {
      setBusy(false);
    }
  }

  /** Cria o doc público users/{uid} com e-mail para que webhooks de pagamento localizem o usuário. */
  async function ensureUserDoc(uid: string, userEmail: string) {
    try {
      const db = getFirebaseDb();
      await setDoc(
        doc(db, "users", uid),
        { email: userEmail.trim().toLowerCase(), updated_at: new Date().toISOString() },
        { merge: true },
      );
    } catch (err) {
      console.warn("[entrar] Falha ao indexar usuário por e-mail:", err);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#0F0F1A] px-4 py-12 text-white">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <Link to="/" className="font-display text-2xl font-bold">
            Pitch<span className="text-[#FF6B35]">aí</span>
          </Link>
          <h1 className="mt-4 text-xl font-semibold">
            {mode === "login"
              ? "Entrar na sua conta"
              : mode === "signup"
                ? "Criar sua conta"
                : "Recuperar acesso"}
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {mode === "forgot"
              ? "Informe seu email e mandamos o link de redefinição."
              : "Seu roteiro, voz e configuração ficam salvos na nuvem."}
          </p>
        </div>

        <button
          onClick={google}
          type="button"
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black hover:opacity-90"
        >
          Continuar com Google
        </button>

        <div className="flex items-center gap-3 text-xs text-white/30">
          <span className="h-px flex-1 bg-white/10" /> ou{" "}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#7C3AED]"
          />
          {mode !== "forgot" && (
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Senha (mín. 8 caracteres)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#7C3AED]"
            />
          )}
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
          </button>
        </form>

        <div className="space-y-2 text-center text-sm text-white/50">
          {mode === "login" && (
            <>
              <button onClick={() => setMode("signup")} className="underline hover:text-white">
                Ainda não tenho conta
              </button>
              <div>
                <button onClick={() => setMode("forgot")} className="underline hover:text-white">
                  Esqueci minha senha
                </button>
              </div>
            </>
          )}
          {mode !== "login" && (
            <button onClick={() => setMode("login")} className="underline hover:text-white">
              Voltar para o login
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Lock, LogOut, Mail } from "lucide-react";
import {
  signInWithPopup,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";
import { ensureAccountProfile } from "@/lib/account-profile";
import { hasActiveAccess } from "@/lib/live/access-check";
import { FluidLoader } from "@/components/live/FluidLoader";
import { LiquidBackground } from "@/components/live/LiquidBackground";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";

type Search = { next?: string; mode?: "login" | "signup" };

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
    mode: s.mode === "signup" ? "signup" : s.mode === "login" ? "login" : undefined,
  }),
  component: EntrarPage,
});

/** Só aceita caminho interno — nunca URL externa vinda da query. */
function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/app";
  return next;
}

/** Traduz códigos de erro do Firebase Auth para mensagens claras em português. */
function translateAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/email-already-in-use": "Este e-mail já tem uma conta. Faça login em vez de cadastrar.",
    "auth/invalid-email": "Digite um e-mail válido.",
    "auth/user-disabled": "Esta conta foi desativada. Fale com o suporte.",
    "auth/user-not-found": "Não encontramos uma conta com este e-mail.",
    "auth/wrong-password": "Senha incorreta. Tente novamente ou clique em “Esqueci minha senha”.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-login-credentials": "E-mail ou senha incorretos.",
    "auth/weak-password": "Senha muito curta. Use pelo menos 8 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um pouco e tente de novo.",
    "auth/network-request-failed":
      "Sem conexão com a internet. Verifique sua rede e tente novamente.",
    "auth/popup-closed-by-user": "Janela do Google fechada antes de concluir o login.",
    "auth/cancelled-popup-request": "Login com Google cancelado.",
    "auth/popup-blocked":
      "O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.",
    "auth/unauthorized-domain":
      "Este endereço do Pitch AI ainda não está autorizado para login com Google.",
    "auth/operation-not-allowed":
      "O login com Google está temporariamente desativado. Fale com o suporte.",
    "auth/internal-error":
      "O Google não conseguiu concluir o login. Feche outras janelas de acesso e tente novamente.",
  };
  if (map[code]) return map[code];
  if (!code && err instanceof Error && err.message) return err.message;
  return "Não foi possível continuar. Tente novamente em alguns instantes.";
}

function EntrarPage() {
  const { next, mode: requestedMode } = useSearch({ from: "/entrar" });
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(requestedMode || "login");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMsg, setBusyMsg] = useState("");
  const dest = safeNext(next);

  function changeMode(nextMode: "login" | "signup" | "forgot") {
    setMode(nextMode);
    setFormError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmError(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function validateEmail(value: string) {
    if (!value.trim()) return "Digite seu e-mail.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return "Digite um e-mail válido.";
    return null;
  }

  function validateForm() {
    const nextEmailError = validateEmail(email);
    const nextPasswordError =
      mode !== "forgot" && password.length < 8 ? "Use pelo menos 8 caracteres na senha." : null;
    const nextConfirmError =
      mode === "signup" && password !== confirmPassword ? "As senhas não coincidem." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    return !nextEmailError && !nextPasswordError && !nextConfirmError;
  }

  // Só observamos a sessão para avisar quem já está conectado — nenhuma
  // navegação automática acontece aqui. Antes este efeito redirecionava sozinho
  // assim que o Firebase reidratava a sessão salva no navegador, e a tela de
  // login "pulava" para o destino sem o usuário clicar em nada.
  useEffect(() => {
    const unsubFb = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setSessionEmail(user?.email ?? null);
    });
    return () => {
      unsubFb();
    };
  }, []);

  /**
   * Destino pós-autenticação: o painel exige plano ativo, então quem não tem
   * assinatura cai na tela de planos. Um `next` explícito (/admin, /indique…)
   * é sempre respeitado — só o painel passa pela checagem de licença.
   */
  async function goAfterAuth(uid: string) {
    if (dest !== "/app") {
      navigate({ to: dest });
      return;
    }
    const active = await hasActiveAccess(uid);
    navigate({ to: active ? "/app" : "/planos" });
  }

  /** Continua com a sessão que já existe no navegador — sempre por clique. */
  async function continueWithSession() {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    setBusy(true);
    setBusyMsg("Verificando sua sessão...");
    try {
      await goAfterAuth(user.uid);
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  /** Encerra a sessão atual para permitir login com outra conta. */
  async function useAnotherAccount() {
    setBusy(true);
    setBusyMsg("Encerrando sessão...");
    try {
      await signOut(getFirebaseAuth());
      setPassword("");
      toast.success("Sessão encerrada. Entre com a conta que quiser.");
    } catch {
      toast.error("Não foi possível encerrar a sessão. Tente novamente.");
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!validateForm()) return;

    setBusy(true);
    setBusyMsg(
      mode === "login"
        ? "Entrando na sua conta..."
        : mode === "signup"
          ? "Criando sua conta..."
          : "Enviando link de recuperação...",
    );
    const fbAuth = getFirebaseAuth();
    try {
      if (mode === "login") {
        const { user } = await signInWithEmailAndPassword(fbAuth, email, password);
        await ensureAccountProfile(user);
        toast.success("Login efetuado com sucesso!");
        await goAfterAuth(user.uid);
      } else if (mode === "signup") {
        const { user } = await createUserWithEmailAndPassword(fbAuth, email, password);
        await ensureAccountProfile(user);
        toast.success("Conta criada! Redirecionando...");
        await goAfterAuth(user.uid);
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
      toast.error(translateAuthError(err));
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  async function google() {
    setBusy(true);
    setBusyMsg("Conectando com o Google...");
    try {
      const fbAuth = getFirebaseAuth();
      const { user } = await signInWithPopup(fbAuth, googleProvider);
      await ensureAccountProfile(user);
      toast.success("Autenticado com Google com sucesso!");
      await goAfterAuth(user.uid);
    } catch (err) {
      console.warn(
        "[entrar] Falha no login Google:",
        (err as { code?: string })?.code || "sem código",
      );
      toast.error(translateAuthError(err));
    } finally {
      setBusy(false);
      setBusyMsg("");
    }
  }

  return (
    <main className="marketing-page relative flex min-h-dvh flex-col items-center justify-center overflow-x-hidden px-4 py-20">
      {/* Glow radial roxo, consistente com a identidade visual do restante do site. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(85% 55% at 82% -8%, rgba(139,92,246,0.22) 0%, transparent 55%), radial-gradient(65% 45% at 8% 4%, rgba(168,85,247,0.12) 0%, transparent 50%)",
        }}
      />

      {/* Líquido roxo subindo no fundo (shader WebGL). */}
      <LiquidBackground className="login-liquid" />

      {/* Loader em tela cheia: líquido roxo subindo enquanto a autenticação roda. */}
      {busy && <FluidLoader label={busyMsg || "Carregando…"} />}

      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="animate-fade-up text-center">
          <Link to="/" aria-label="Pitch AI" className="inline-flex items-center justify-center">
            <PitchAiLogo size="lg" variant="white" />
          </Link>
          <h1 className="marketing-title mt-4 text-3xl text-balance">
            {mode === "login"
              ? "Entrar na sua conta"
              : mode === "signup"
                ? "Criar sua conta"
                : "Recuperar acesso"}
          </h1>
          <p className="mt-1 text-sm text-white/55 text-pretty">
            {mode === "forgot"
              ? "Informe seu e-mail e mandamos o link de redefinição."
              : "Seu roteiro, voz e configuração ficam salvos na nuvem."}
          </p>
        </div>

        <div
          className="login-panel marketing-panel animate-fade-up rounded-2xl p-6 backdrop-blur-2xl max-h-[calc(100dvh-120px)] overflow-y-auto"
          style={{ animationDelay: "90ms" }}
        >
          {/* Sessão salva no navegador: nada acontece sozinho, o usuário decide
              se continua com ela ou entra com outra conta. */}
          {sessionEmail && (
            <div className="mb-5 rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 p-4">
              <p className="text-xs text-white/70">
                Você já está conectado como{" "}
                <strong className="break-all text-white">{sessionEmail}</strong>.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={continueWithSession}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] px-3.5 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  Continuar com esta conta
                </button>
                <button
                  type="button"
                  onClick={useAnotherAccount}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" /> Entrar com outra conta
                </button>
              </div>
            </div>
          )}

          {mode !== "forgot" && (
            <>
              <button
                onClick={google}
                type="button"
                disabled={busy}
                className={`btn-press flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50 ${busy ? "btn-loading" : ""}`}
              >
                <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
                  <path
                    fill="#FFC107"
                    d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6 29.5 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.4 0 10.3-1.8 14-5.7l-6.5-5.4c-2 1.4-4.6 2.1-7.5 2.1-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.5 39.6 16.2 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.5 5.4C41.5 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"
                  />
                </svg>
                Continuar com Google
              </button>

              <div className="my-5 flex items-center gap-3 text-xs text-white/30">
                <span className="h-px flex-1 bg-white/10" /> ou{" "}
                <span className="h-px flex-1 bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="account-email" className="sr-only">
                E-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  id="account-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? "account-email-error" : undefined}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(validateEmail(e.target.value));
                  }}
                  onBlur={() => setEmailError(validateEmail(email))}
                  className={`w-full rounded-lg border bg-white/5 px-3 py-2.5 pl-9 text-sm outline-none transition focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 ${emailError ? "border-[#f87171]" : "border-white/10"}`}
                />
              </div>
              {emailError && (
                <p id="account-email-error" className="mt-1 text-xs text-[#fca5a5]">
                  {emailError}
                </p>
              )}
            </div>

            {mode !== "forgot" && (
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  id="account-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="Senha (mín. 8 caracteres)"
                  value={password}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? "account-password-error" : "account-password-hint"
                  }
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError)
                      setPasswordError(
                        e.target.value.length >= 8 ? null : "Use pelo menos 8 caracteres na senha.",
                      );
                  }}
                  onBlur={() =>
                    setPasswordError(
                      password.length < 8 ? "Use pelo menos 8 caracteres na senha." : null,
                    )
                  }
                  className={`w-full rounded-lg border bg-white/5 px-3 py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 ${passwordError ? "border-[#f87171]" : "border-white/10"}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {mode === "signup" && !passwordError && (
                  <p id="account-password-hint" className="mt-1 text-xs text-white/40">
                    Use pelo menos 8 caracteres.
                  </p>
                )}
                {passwordError && (
                  <p id="account-password-error" className="mt-1 text-xs text-[#fca5a5]">
                    {passwordError}
                  </p>
                )}
              </div>
            )}

            {mode === "signup" && (
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  id="account-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Confirmar senha"
                  value={confirmPassword}
                  aria-invalid={Boolean(confirmError)}
                  aria-describedby={confirmError ? "account-confirm-error" : undefined}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (confirmError)
                      setConfirmError(
                        e.target.value === password ? null : "As senhas não coincidem.",
                      );
                  }}
                  onBlur={() =>
                    setConfirmError(
                      confirmPassword && confirmPassword !== password
                        ? "As senhas não coincidem."
                        : null,
                    )
                  }
                  className={`w-full rounded-lg border bg-white/5 px-3 py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/40 ${confirmError ? "border-[#f87171]" : "border-white/10"}`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
                {confirmError && (
                  <p id="account-confirm-error" className="mt-1 text-xs text-[#fca5a5]">
                    {confirmError}
                  </p>
                )}
              </div>
            )}

            {formError && <p className="text-sm text-[#f87171]">{formError}</p>}

            <button
              type="submit"
              disabled={busy}
              className={`btn-press flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#a855f7] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(139,92,246,0.35)] transition hover:opacity-90 disabled:opacity-50 ${busy ? "btn-loading" : ""}`}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link"}
            </button>
          </form>
        </div>

        <div
          className="animate-fade-up flex items-center justify-center gap-3 text-center text-xs text-white/45"
          style={{ animationDelay: "180ms" }}
        >
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
            Seus dados protegidos
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
            Cancele quando quiser
          </span>
        </div>

        <div
          className="animate-fade-up space-y-2 text-center text-sm text-white/50"
          style={{ animationDelay: "240ms" }}
        >
          {mode === "login" && (
            <>
              <button onClick={() => changeMode("signup")} className="font-semibold text-[#a855f7] hover:text-[#c084fc] transition-colors">
                Ainda não tenho conta
              </button>
              <div>
                <button onClick={() => changeMode("forgot")} className="underline hover:text-white">
                  Esqueci minha senha
                </button>
              </div>
            </>
          )}
          {mode !== "login" && (
            <button onClick={() => changeMode("login")} className="underline hover:text-white">
              Voltar para o login
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

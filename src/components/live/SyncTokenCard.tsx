import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Copy,
  RefreshCw,
  Loader2,
  LogIn,
  UserPlus,
  KeyRound,
  ShieldCheck,
  Lock,
  Sparkles,
  Eye,
  EyeOff,
  User,
  LogOut,
  Mail,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { ExtensionStatusBanner } from "@/components/live/ExtensionStatusBanner";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase";
import { ensureAccountProfile } from "@/lib/account-profile";
import { ensureMyLiveConfig, pushMyLiveConfig, regenerateSyncToken } from "@/lib/live/sync";
import { loadConfig } from "@/lib/live/config";
import { copyToClipboard } from "@/lib/clipboard";
import { toast } from "sonner";

export function SyncTokenCard() {
  const [status, setStatus] = useState<"loading" | "signed-out" | "ready">("loading");
  const [userEmail, setUserEmail] = useState<string>("");
  const [userPhoto, setUserPhoto] = useState<string | null>(null);

  // Form states
  const [tab, setTab] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authing, setAuthing] = useState(false);

  // Sync token & quota
  const [token, setToken] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{
    plan?: string;
    remainingChat?: number;
    remainingTts?: number;
    chatLimit?: number;
    ttsLimit?: number;
    locked?: boolean;
    reason?: string | null;
  }>({});

  async function checkStatus(t: string) {
    if (!t) return;
    try {
      const res = await fetch("/api/public/live/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (res.ok) {
        setTokenInfo({
          plan: data.plan || "free",
          remainingChat: data.remainingChat ?? 0,
          remainingTts: data.remainingTts ?? 0,
          chatLimit: data.chatLimit ?? 100,
          ttsLimit: data.ttsLimit ?? 50,
          locked: !!data.locked,
          reason: data.reason,
        });
      }
    } catch (e) {
      console.error("[SyncTokenCard] error checking status", e);
    }
  }

  const bootstrapInProgress = useRef(false);

  const bootstrap = useCallback(async () => {
    if (bootstrapInProgress.current) return;
    bootstrapInProgress.current = true;
    try {
      // Check Firebase session
      const fbAuth = getFirebaseAuth();
      const fbUser = fbAuth.currentUser;

      const activeEmail = fbUser?.email || "";
      const activePhoto = fbUser?.photoURL || null;

      if (!fbUser) {
        setStatus("signed-out");
        setUserEmail("");
        setUserPhoto(null);
        setConnectionError(null);
        return;
      }

      setUserEmail(activeEmail);
      setUserPhoto(activePhoto);

      // Repara também contas Google criadas antes de existir o índice
      // users/{uid}, para que apareçam na busca de cortesia do admin.
      try {
        await ensureAccountProfile(fbUser);
      } catch (error) {
        console.error("[SyncTokenCard] Falha ao indexar perfil da conta:", error);
      }

      try {
        setConnectionError(null);
        const row = await ensureMyLiveConfig();
        const t = row?.sync_token ?? "";
        setToken(t);
        setStatus("ready");
        if (t) checkStatus(t);
        if (row?.repaired) {
          toast.success("Conexão da extensão reparada automaticamente.");
        }
      } catch (e: any) {
        setStatus("ready");
        setToken("");
        setConnectionError(e?.message || "Não foi possível preparar a conexão da extensão.");
      }
    } finally {
      bootstrapInProgress.current = false;
    }
  }, []);

  useEffect(() => {
    bootstrap();

    // Listeners for auth changes
    const fbAuth = getFirebaseAuth();
    const unsubFb = onAuthStateChanged(fbAuth, () => {
      void bootstrap();
    });

    return () => {
      unsubFb();
    };
  }, [bootstrap]);

  // Login handler
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Preencha email e senha.");
      return;
    }
    setAuthing(true);
    try {
      const fbAuth = getFirebaseAuth();
      const { user } = await signInWithEmailAndPassword(fbAuth, email, password);
      await ensureAccountProfile(user);
      toast.success("Login realizado com sucesso!");
      bootstrap();
    } catch (err: any) {
      const msg = err?.message || "Email ou senha incorretos.";
      toast.error("Erro no login: " + msg);
    } finally {
      setAuthing(false);
    }
  }

  // Register handler
  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setAuthing(true);
    try {
      const fbAuth = getFirebaseAuth();
      const { user } = await createUserWithEmailAndPassword(fbAuth, email, password);
      await ensureAccountProfile(user);
      toast.success("Conta criada com sucesso!");
      bootstrap();
    } catch (err: any) {
      toast.error("Erro ao criar conta: " + (err?.message || "Tente novamente."));
    } finally {
      setAuthing(false);
    }
  }

  // Google Sign In handler
  async function handleGoogleSignIn() {
    setAuthing(true);
    try {
      const fbAuth = getFirebaseAuth();
      const { user } = await signInWithPopup(fbAuth, googleProvider);
      await ensureAccountProfile(user);
      toast.success("Autenticado com Google!");
      bootstrap();
    } catch (err: any) {
      toast.error("Erro na autenticação Google: " + (err?.message || "Falha no login."));
    } finally {
      setAuthing(false);
    }
  }

  // Reset password
  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Informe seu e-mail.");
      return;
    }
    setAuthing(true);
    try {
      const fbAuth = getFirebaseAuth();
      await sendPasswordResetEmail(fbAuth, email);
      toast.success("Link de redefinição de senha enviado para seu e-mail!");
      setTab("login");
    } catch (err: any) {
      toast.error("Erro ao enviar e-mail: " + (err?.message || "Verifique o endereço."));
    } finally {
      setAuthing(false);
    }
  }

  // Logout handler
  async function handleSignOut() {
    try {
      const fbAuth = getFirebaseAuth();
      await firebaseSignOut(fbAuth);
      setStatus("signed-out");
      setUserEmail("");
      setUserPhoto(null);
      setToken("");
      toast.info("Sessão encerrada.");
    } catch {
      toast.error("Erro ao sair.");
    }
  }

  async function copyToken() {
    if (!token) return;
    const copied = await copyToClipboard(token);
    if (copied) toast.success("Token copiado — cole na extensão");
    else toast.error("Não consegui copiar — selecione o token e copie manualmente");
  }

  async function pushNow() {
    setBusy(true);
    try {
      await pushMyLiveConfig(loadConfig());
      toast.success("Configuração enviada pro backend");
      if (token) checkStatus(token);
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
    } finally {
      setBusy(false);
    }
  }

  async function regen() {
    if (!confirm("Gerar novo token invalida o anterior. Confirma?")) return;
    setBusy(true);
    try {
      const t = await regenerateSyncToken();
      if (t) {
        setToken(t);
        checkStatus(t);
      }
      toast.success("Novo token gerado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" /> Verificando autenticação...
      </Card>
    );
  }

  if (status === "signed-out") {
    return (
      <Card className="space-y-4 p-5 border shadow-sm bg-card/80 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" /> Conta & Sincronização Pitch AI
        </div>
        <p className="text-xs text-muted-foreground">
          Entre ou crie sua conta para salvar seus roteiros, dados de IA e gerar seu Sync Token de
          extensão de forma segura.
        </p>

        {/* Social Google Login Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGoogleSignIn}
          disabled={authing}
          className="w-full gap-2 border-muted-foreground/20 hover:bg-muted/60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {authing ? "Conectando..." : "Entrar com Google"}
        </Button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-muted/60" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-card px-2 text-muted-foreground font-medium">Ou via Email</span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-3 w-full h-8 text-xs">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar Conta</TabsTrigger>
            <TabsTrigger value="reset">Recuperar</TabsTrigger>
          </TabsList>

          {/* Login Form */}
          <TabsContent value="login" className="space-y-3 pt-2">
            <form onSubmit={handleLogin} className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-9 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="submit" size="sm" disabled={authing} className="w-full gap-2">
                {authing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Entrar
              </Button>
            </form>
          </TabsContent>

          {/* Sign Up Form */}
          <TabsContent value="signup" className="space-y-3 pt-2">
            <form onSubmit={handleSignUp} className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  placeholder="Criar senha (mínimo 6 caracteres)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-9 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                placeholder="Confirmar senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="text-xs"
              />
              <Button type="submit" size="sm" disabled={authing} className="w-full gap-2">
                {authing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Cadastrar Conta
              </Button>
            </form>
          </TabsContent>

          {/* Reset Password Form */}
          <TabsContent value="reset" className="space-y-3 pt-2">
            <form onSubmit={handlePasswordReset} className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Digite seu email para receber as instruções de redefinição de senha.
              </p>
              <div className="relative">
                <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 text-xs"
                />
              </div>
              <Button type="submit" size="sm" disabled={authing} className="w-full gap-2">
                {authing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Enviar Email de Redefinição
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    );
  }

  return (
    <Card className="w-full min-w-0 space-y-4 overflow-hidden border bg-card/80 p-4 shadow-sm backdrop-blur">
      {/* Account Info Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {userPhoto ? (
            <img src={userPhoto} alt="User" className="h-8 w-8 rounded-full border" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
              <User className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold text-foreground">
              <span className="min-w-0 break-all">{userEmail}</span>
              {tokenInfo.plan && (
                <Badge
                  variant={tokenInfo.locked ? "destructive" : "default"}
                  className="uppercase text-[9px] px-1.5 py-0"
                >
                  {tokenInfo.locked ? (
                    <Lock className="h-2.5 w-2.5 mr-1" />
                  ) : (
                    <ShieldCheck className="h-2.5 w-2.5 mr-1" />
                  )}
                  Plano {tokenInfo.plan}
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">Conta Autenticada</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="h-8 shrink-0 text-xs gap-1 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair
        </Button>
      </div>

      <ExtensionStatusBanner syncToken={token} />

      {connectionError && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
          <strong className="block">Conexão não liberada</strong>
          <span>{connectionError}</span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Se preferir fazer manualmente, copie o código abaixo e cole no campo <b>Sync token</b> da
        sua extensão:
      </p>

      {tokenInfo.chatLimit !== undefined && (
        <div className="min-w-0 space-y-2 rounded-lg border bg-muted/50 p-2.5 text-xs">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-muted-foreground">
            <span className="flex min-w-0 items-start gap-1 font-medium leading-4 text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Cota de mensagens hoje:
            </span>
            <span className="whitespace-nowrap text-right font-mono text-[11px] font-semibold text-foreground">
              {tokenInfo.remainingChat} / {tokenInfo.chatLimit} restantes
            </span>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-muted-foreground">
            <span className="leading-4">Cota de voz (TTS) hoje:</span>
            <span className="whitespace-nowrap text-right font-mono text-[11px] font-semibold text-foreground">
              {tokenInfo.remainingTts} / {tokenInfo.ttsLimit} restantes
            </span>
          </div>
        </div>
      )}

      <div className="flex min-w-0 gap-2">
        <Input readOnly value={token} className="min-w-0 flex-1 font-mono text-xs bg-muted/30" />
        <Button className="shrink-0" size="icon" variant="secondary" onClick={copyToken}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={pushNow} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Enviar config atual
        </Button>
        <Button size="sm" variant="outline" onClick={regen} disabled={busy}>
          <RefreshCw className="h-4 w-4" /> Gerar novo token
        </Button>
      </div>
    </Card>
  );
}

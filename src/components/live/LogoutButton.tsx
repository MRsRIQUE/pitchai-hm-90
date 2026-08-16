import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { signOut } from "firebase/auth";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

type LogoutButtonProps = {
  /** Texto ao lado do ícone. Em telas pequenas ele some por padrão. */
  label?: string;
  /** Mantém o texto visível também no mobile (usado na tela de bloqueio). */
  alwaysShowLabel?: boolean;
  className?: string;
};

/**
 * Botão de sair da conta com a mesma linguagem visual da landing page:
 * pastilha arredondada, borda de vidro e o mesmo roxo (#7C3AED) do CTA do
 * `SiteNav`, com as duas variantes de tema que a LP usa.
 */
export function LogoutButton({ label = "Sair", alwaysShowLabel, className }: LogoutButtonProps) {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await signOut(getFirebaseAuth());
      toast.success("Você saiu da sua conta.");
      navigate({ to: "/" });
    } catch (err) {
      console.warn("[logout] Falha ao encerrar a sessão:", err);
      toast.error("Não foi possível sair agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const tone = isDark
    ? "border-white/12 bg-white/[0.06] text-slate-200 hover:border-[#7C3AED]/45 hover:bg-[#7C3AED]/15 hover:text-white"
    : "border-[#1E0836]/12 bg-white/60 text-[#33283D] hover:border-[#7C3AED]/40 hover:bg-[#7C3AED]/10 hover:text-[#12091A]";

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-bold transition-all duration-200 active:scale-95 disabled:opacity-50 sm:text-sm",
        tone,
        className,
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
      <span className={alwaysShowLabel ? undefined : "hidden sm:inline"}>{label}</span>
    </button>
  );
}

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { onAuthStateChanged } from "firebase/auth";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";
import { LogoutButton } from "@/components/live/LogoutButton";
import { Sparkles, ArrowUpRight } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase";
import { useTheme } from "@/lib/use-theme";

const LINKS = [
  { to: "/planos", label: "Planos" },
  { to: "/quentes", label: "Produtos quentes" },
  { to: "/indique", label: "Programa de afiliados" },
  { to: "/lives", label: "Minhas lives" },
  { to: "/download", label: "Download" },
] as const;

/** Navegação compartilhada — mantém todas as páginas públicas conectadas com a nova identidade Pitch AI. */
export function SiteNav() {
  const { isDark } = useTheme();
  const effTone = isDark ? "dark" : "light";
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => setAuthed(Boolean(user)));
    return () => unsub();
  }, []);

  const wrap =
    effTone === "dark"
      ? "sticky top-0 z-30 border-b border-white/10 bg-[#0A0518]/80 backdrop-blur-md"
      : "sticky top-0 z-30 border-b border-[#1E0836]/10 bg-white/38 text-[#1E0836] shadow-[0_8px_30px_rgba(30,8,54,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/30";

  const linkClass =
    effTone === "dark"
      ? "text-slate-300 hover:text-white transition-colors duration-200 font-medium"
      : "text-[#33283D] hover:text-[#12091A] transition-colors duration-200 font-medium";

  return (
    <header className={wrap}>
      <div className="desktop-rail flex items-center justify-between gap-x-6 py-3.5">
        <Link to="/" className="group flex items-center gap-2">
          <PitchAiLogo size="sm" variant={effTone === "dark" ? "purple" : "dark"} />
        </Link>

        {/* Links Principais */}
        <nav className="hidden lg:flex items-center gap-x-7 text-sm">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className={linkClass}>
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Ações / CTA */}
        <div className="flex items-center gap-2.5 text-sm">
          {authed ? (
            <LogoutButton label="Sair" className="hidden px-3 py-1.5 sm:inline-flex" />
          ) : (
            <Link to="/entrar" className={`${linkClass} hidden sm:inline-block`}>
              Entrar
            </Link>
          )}

          <Link
            to="/app"
            className="group relative inline-flex items-center gap-1.5 rounded-full bg-[#7C3AED] px-4 py-2 font-bold text-white shadow-[0_4px_20px_rgba(124,58,237,0.35)] transition-all duration-200 hover:bg-[#6D28D9] hover:shadow-[0_6px_25px_rgba(124,58,237,0.5)] active:scale-95 text-xs sm:text-sm"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300 animate-pulse" />
            <span>Abrir Painel</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </header>
  );
}

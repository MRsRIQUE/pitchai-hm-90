import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";
import { ThemeModeSelector } from "@/components/live/ThemeModeSelector";
import { useTheme } from "@/lib/use-theme";

const LINKS = [
  { href: "#como", label: "Como funciona" },
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Dúvidas" },
] as const;

/**
 * Nav flutuante da landing: uma pílula de vidro centrada, destacada do topo.
 * Não encosta nas bordas da tela e ganha sombra quando a página rola.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { isDark } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="lp-nav">
      <div className={`lp-nav-pill${scrolled ? " is-scrolled" : ""}`}>
        <Link to="/" className="lp-nav-brand" aria-label="Pitch AI, ir para o início">
          <PitchAiLogo size="sm" variant={isDark ? "white" : "dark"} />
        </Link>

        <nav className="lp-nav-links" aria-label="Principal">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="lp-nav-link">
              {l.label}
            </a>
          ))}
        </nav>

        <ThemeModeSelector tone={isDark ? "dark" : "light"} />

        <Link to="/entrar" className="lp-nav-link lp-nav-signin">
          Entrar
        </Link>

        <Link to="/app" className="lp-nav-cta">
          Começar grátis
        </Link>

        <button
          type="button"
          className="lp-nav-burger"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MenuGlyph open={open} />
        </button>
      </div>

      {open ? (
        <div className="lp-nav-sheet">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link to="/entrar" onClick={() => setOpen(false)}>
            Entrar
          </Link>
        </div>
      ) : null}
    </header>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {open ? (
        <path
          d="M4 4l10 10M14 4L4 14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path d="M2.5 5.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M2.5 12.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Loader2 } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";
import { getFirebaseAuth } from "@/lib/firebase";
import { useLogout } from "@/lib/use-logout";

/**
 * Nav das páginas internas no formato da landing (`LandingNav`): a mesma barra
 * escura encaixada na moldura, o mesmo dropdown e o mesmo CTA de pastilha.
 *
 * A diferença para a `LandingNav` é o conteúdo, não a aparência: aqui os itens
 * são rotas reais (`/planos`, `/quentes`, …) em vez de âncoras da home, e o
 * bloco da direita troca "Entrar" por "Sair" quando existe sessão.
 *
 * Como todo o CSS da LP vive escopado sob `.landing`, esta nav só renderiza
 * corretamente dentro de um `SitePageFrame`.
 */

type NavItem = {
  label: string;
  to?: string;
  items?: Array<{ label: string; desc: string; to: string }>;
};

const NAV: NavItem[] = [
  {
    label: "Produto",
    items: [
      { label: "Produtos quentes", desc: "O que está vendendo agora", to: "/quentes" },
      { label: "Minhas lives", desc: "Histórico e desempenho", to: "/lives" },
      { label: "Baixar o app", desc: "Windows, direto do site", to: "/download" },
    ],
  },
  { label: "Planos", to: "/planos" },
  { label: "Indique e ganhe", to: "/indique" },
];

const ArrowDownRight = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m7 7 10 10" />
    <path d="M17 7v10H7" />
  </svg>
);

function Dropdown({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      className="lp-nav-drop"
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="lp-nav-link lp-nav-drop-btn"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        {item.label}
        <ChevronDown className={`lp-nav-chev${open ? " is-open" : ""}`} />
      </button>

      <div className={`lp-nav-menu${open ? " is-open" : ""}`}>
        <div className="lp-nav-menu-card">
          {item.items?.map((sub) => (
            <Link
              key={sub.label}
              to={sub.to}
              className="lp-nav-menu-item"
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
            >
              <span className="lp-nav-menu-title">{sub.label}</span>
              <span className="lp-nav-menu-desc">{sub.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SiteNavLP() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const { logout, busy } = useLogout();

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (user) => setAuthed(Boolean(user)));
    return () => unsub();
  }, []);

  return (
    <header className="lp-nav">
      <div className="lp-nav-bar">
        <Link to="/" className="lp-nav-brand" aria-label="Pitch AI, ir para o início">
          <PitchAiLogo size="sm" variant="white" />
        </Link>

        <nav className="lp-nav-links" aria-label="Principal">
          {NAV.map((item) =>
            item.items ? (
              <Dropdown key={item.label} item={item} onNavigate={() => setOpen(false)} />
            ) : (
              <Link key={item.label} to={item.to} className="lp-nav-link">
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="lp-nav-actions">
          {authed ? (
            <button
              type="button"
              onClick={logout}
              disabled={busy}
              className="lp-nav-link lp-nav-signin"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sair"}
            </button>
          ) : (
            <Link to="/entrar" className="lp-nav-link lp-nav-signin">
              Entrar
            </Link>
          )}

          <Link to="/app" className="lp-nav-cta">
            <span className="lp-nav-cta-bg" aria-hidden="true" />
            <span className="lp-nav-cta-label">Abrir painel</span>
            <span className="lp-nav-cta-arrow">
              <ArrowDownRight />
            </span>
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
      </div>

      {open ? (
        <div className="lp-nav-sheet">
          {NAV.map((item) => (
            <div key={item.label} className="lp-nav-sheet-group">
              {item.to ? (
                <Link to={item.to} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ) : (
                <span className="lp-nav-sheet-title">{item.label}</span>
              )}
              {item.items?.map((sub) => (
                <Link key={sub.label} to={sub.to} className="sub" onClick={() => setOpen(false)}>
                  {sub.label}
                </Link>
              ))}
            </div>
          ))}
          {authed ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              Sair
            </button>
          ) : (
            <Link to="/entrar" onClick={() => setOpen(false)}>
              Entrar
            </Link>
          )}
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

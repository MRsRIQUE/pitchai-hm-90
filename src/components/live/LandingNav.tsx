import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";
import { ThemeModeSelector } from "@/components/live/ThemeModeSelector";

/**
 * Nav da landing no formato do template Circular: barra fixa encaixada dentro
 * da moldura do site (`SiteFrame`), com o mesmo fundo dela, cantos inferiores
 * arredondados, dropdown de produto e CTA de pastilha + seta.
 *
 * O que muda em relação ao original: as cores saem dos tokens da Pitch AI
 * (roxo no lugar do verde-limão) e o seletor de tema continua na barra.
 */

type NavItem = {
  label: string;
  /** âncora da própria landing */
  hash?: string;
  /** rota interna */
  to?: string;
  items?: Array<{ label: string; desc: string; to?: string; hash?: string }>;
};

const NAV: NavItem[] = [
  {
    label: "Produto",
    items: [
      { label: "Como funciona", desc: "Do download à primeira venda", hash: "como" },
      { label: "Recursos", desc: "Chat, voz, vitrine e proteção", hash: "recursos" },
      { label: "Produtos quentes", desc: "O que está vendendo agora", to: "/quentes" },
      { label: "Baixar o app", desc: "Windows, direto do site", to: "/download" },
    ],
  },
  { label: "Planos", hash: "planos" },
  { label: "Dúvidas", hash: "faq" },
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
          {item.items?.map((sub) =>
            sub.to ? (
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
            ) : (
              <a
                key={sub.label}
                href={`#${sub.hash}`}
                className="lp-nav-menu-item"
                onClick={() => {
                  setOpen(false);
                  onNavigate();
                }}
              >
                <span className="lp-nav-menu-title">{sub.label}</span>
                <span className="lp-nav-menu-desc">{sub.desc}</span>
              </a>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

export function LandingNav() {
  const [open, setOpen] = useState(false);

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
              <a key={item.label} href={`#${item.hash}`} className="lp-nav-link">
                {item.label}
              </a>
            ),
          )}
        </nav>

        <div className="lp-nav-actions">
          <ThemeModeSelector tone="dark" />

          <Link to="/entrar" className="lp-nav-link lp-nav-signin">
            Entrar
          </Link>

          {/* CTA do template: bloco roxo atrás, pastilha clara por cima e o
              quadrado da seta, que gira -45° no hover */}
          <Link to="/app" className="lp-nav-cta">
            <span className="lp-nav-cta-bg" aria-hidden="true" />
            <span className="lp-nav-cta-label">Começar grátis</span>
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
              {item.hash ? (
                <a href={`#${item.hash}`} onClick={() => setOpen(false)}>
                  {item.label}
                </a>
              ) : (
                <span className="lp-nav-sheet-title">{item.label}</span>
              )}
              {item.items?.map((sub) =>
                sub.to ? (
                  <Link key={sub.label} to={sub.to} className="sub" onClick={() => setOpen(false)}>
                    {sub.label}
                  </Link>
                ) : (
                  <a
                    key={sub.label}
                    href={`#${sub.hash}`}
                    className="sub"
                    onClick={() => setOpen(false)}
                  >
                    {sub.label}
                  </a>
                ),
              )}
            </div>
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

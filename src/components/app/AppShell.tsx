import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, type LucideIcon } from "lucide-react";
import { PitchAiLogo } from "@/components/live/PitchAiLogo";
import "@/styles/dashboard.css";

/**
 * Casca dos painéis — sidebar fixa escura + área de trabalho clara.
 *
 * O shell não sabe nada sobre o conteúdo: recebe as seções, qual está ativa e
 * o que renderizar. É isso que deixa `/app` e `/admin` compartilharem o mesmo
 * layout sem compartilhar lógica.
 *
 * A paleta e as classes utilitárias (`app-card`, `app-btn`, `app-step`, …)
 * vivem em `styles/dashboard.css`, escopadas sob `.dash-shell`.
 *
 * A raiz NÃO pode se chamar `app-shell`: esse nome já pertence ao shell mobile
 * de 440px centralizado que o `styles.css` global define, e a regra de lá
 * espremia esta grade inteira numa coluna de 440px.
 */

export type AppSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Pastilha à direita do item: contador, "novo", "!" */
  badge?: { text: string; tone?: "accent" | "ok" | "warn" };
  /** Título e subtítulo da topbar quando esta seção está ativa. */
  title?: string;
  subtitle?: string;
};

/** Link para fora do painel, na parte de baixo da sidebar. */
export type AppShortcut = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export function AppShell({
  sections,
  active,
  onSelect,
  shortcuts = [],
  navLabel = "Painel",
  shortcutsLabel = "Atalhos",
  actions,
  footer,
  children,
}: {
  sections: AppSection[];
  active: string;
  onSelect: (id: string) => void;
  shortcuts?: AppShortcut[];
  navLabel?: string;
  shortcutsLabel?: string;
  /** Botões da direita da topbar (Salvar, Sair, …). */
  actions?: ReactNode;
  /** Rodapé da sidebar — normalmente a versão do app. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = sections.find((s) => s.id === active) ?? sections[0];

  // A gaveta não deve sobreviver à navegação nem ao Esc.
  useEffect(() => {
    setOpen(false);
  }, [active]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="dash-shell">
      <aside className="app-sidebar" data-open={open}>
        <div className="app-sidebar-head">
          <Link to="/" aria-label="Pitch AI, ir para o início">
            <PitchAiLogo size="sm" variant="white" />
          </Link>
        </div>

        <nav className="app-nav" aria-label="Seções do painel">
          <span className="app-nav-label">{navLabel}</span>
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === active;
            return (
              <button
                key={s.id}
                type="button"
                className={`app-nav-item${isActive ? " is-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect(s.id)}
              >
                <Icon aria-hidden="true" />
                <span className="app-nav-item-label">{s.label}</span>
                {s.badge ? (
                  <span className="app-nav-badge" data-tone={s.badge.tone}>
                    {s.badge.text}
                  </span>
                ) : null}
              </button>
            );
          })}

          {shortcuts.length > 0 ? (
            <>
              <div className="app-nav-sep" />
              <span className="app-nav-label">{shortcutsLabel}</span>
              {shortcuts.map((s) => {
                const Icon = s.icon;
                return (
                  <Link key={s.to} to={s.to} className="app-nav-item">
                    <Icon aria-hidden="true" />
                    <span className="app-nav-item-label">{s.label}</span>
                  </Link>
                );
              })}
            </>
          ) : null}
        </nav>

        {footer ? <div className="app-sidebar-foot">{footer}</div> : null}
      </aside>

      <div
        className="app-scrim"
        data-open={open}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div className="app-body">
        <header className="app-topbar">
          <button
            type="button"
            className="app-burger"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="app-topbar-title">
            <h1>{current?.title ?? current?.label}</h1>
            {current?.subtitle ? <p>{current.subtitle}</p> : null}
          </div>

          {actions ? <div className="app-topbar-actions">{actions}</div> : null}
        </header>

        <main className="app-main">
          <div className="app-main-wrap">{children}</div>
        </main>
      </div>
    </div>
  );
}

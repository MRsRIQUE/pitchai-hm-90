import type { ReactNode } from "react";
import { GridField } from "@/components/live/GridField";
import { SiteFrame } from "@/components/live/SiteFrame";
import { SiteNavLP } from "@/components/live/SiteNavLP";
import "@/styles/landing.css";
import "@/styles/site-page.css";

/**
 * Moldura das páginas internas (`/planos`, `/quentes`, `/indique`, `/lives`,
 * `/download`) — a mesma casca visual da home: quadriculado de fundo, moldura
 * fixa e a nav da LP.
 *
 * O `.landing` não é decorativo: todo o design system da LP está escopado sob
 * essa classe, então é ele que faz `lp-nav`, `wrap`, `btn` e companhia
 * existirem dentro da página.
 */
export function SitePageFrame({
  children,
  /** Desliga o quadriculado em páginas com muita tabela ou lista longa. */
  grid = true,
}: {
  children: ReactNode;
  grid?: boolean;
}) {
  return (
    /* `no-grid` também apaga o quadriculado estático do `.landing::before`;
       sem ele a prop só tirava o canvas animado e a malha continuava. */
    <div className={`landing has-frame${grid ? "" : " no-grid"}`}>
      {grid ? <GridField /> : null}
      <SiteFrame />
      <SiteNavLP />
      <main className="site-page-body">{children}</main>
    </div>
  );
}

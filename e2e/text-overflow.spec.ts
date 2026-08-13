import { test, expect, type Page } from "@playwright/test";

/**
 * Detecta textos que vazam ou encostam nas bordas de cards, chips e
 * elementos com fundo. Roda em rotas públicas; rotas protegidas (e.g. /app,
 * /admin, /lives, /indique) são cobertas em suites autenticadas dedicadas.
 *
 * Regras:
 *  - scrollWidth/scrollHeight do container não pode exceder clientWidth/Height
 *    (overflow real de texto).
 *  - O retângulo do nó de texto deve manter um padding mínimo até a borda
 *    interna do container (MIN_INSET px).
 */

const ROUTES = ["/", "/entrar", "/planos", "/quentes", "/download", "/reset-password"];

const MIN_INSET = 4; // px mínimos entre texto e borda interna

const SELECTOR = [
  ".bg-card",
  ".bg-elevated",
  ".bg-muted",
  ".bg-accent",
  ".bg-secondary",
  ".bg-primary",
  ".bg-popover",
  ".glass",
  ".glass-strong",
  "[class*='rounded-full']",
  "[class*='chip']",
  "[data-chip]",
  "[role='status']",
  "[role='button']",
  "button",
].join(",");

type Issue = {
  route: string;
  kind: "overflow" | "edge";
  selector: string;
  text: string;
  details: string;
};

async function collectIssues(page: Page, route: string, minInset: number): Promise<Issue[]> {
  return page.evaluate(
    ({ sel, minInset, route }) => {
      const issues: Issue[] = [] as any;

      const isVisible = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return (
          r.width > 4 &&
          r.height > 4 &&
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          cs.opacity !== "0"
        );
      };

      const shortSel = (el: Element) => {
        const tag = el.tagName.toLowerCase();
        const cls = (el.getAttribute("class") || "")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .join(".");
        return cls ? `${tag}.${cls}` : tag;
      };

      const containers = Array.from(document.querySelectorAll(sel)).filter(isVisible);

      for (const el of containers) {
        const html = el as HTMLElement;
        const cs = getComputedStyle(html);
        // Ignora containers que rolagem é esperada
        if (cs.overflowX === "auto" || cs.overflowX === "scroll") continue;
        if (cs.overflowY === "auto" || cs.overflowY === "scroll") continue;

        // 1) Overflow real do conteúdo
        const overflowX = html.scrollWidth - html.clientWidth;
        const overflowY = html.scrollHeight - html.clientHeight;
        if (overflowX > 1 || overflowY > 1) {
          issues.push({
            route,
            kind: "overflow",
            selector: shortSel(html),
            text: (html.innerText || "").slice(0, 60),
            details: `scroll ${html.scrollWidth}x${html.scrollHeight} vs client ${html.clientWidth}x${html.clientHeight}`,
          });
          continue;
        }

        // 2) Texto encostando na borda interna
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const padT = parseFloat(cs.paddingTop) || 0;
        const padB = parseFloat(cs.paddingBottom) || 0;
        const rect = html.getBoundingClientRect();
        const innerLeft = rect.left + padL;
        const innerRight = rect.right - padR;
        const innerTop = rect.top + padT;
        const innerBottom = rect.bottom - padB;

        const walker = document.createTreeWalker(html, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while ((n = walker.nextNode())) {
          const text = (n.nodeValue || "").trim();
          if (!text) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const rects = Array.from(range.getClientRects());
          for (const tr of rects) {
            if (tr.width < 1 || tr.height < 1) continue;
            const dl = tr.left - innerLeft;
            const dr = innerRight - tr.right;
            const dt = tr.top - innerTop;
            const db = innerBottom - tr.bottom;
            const worst = Math.min(dl, dr, dt, db);
            if (worst < -1) {
              issues.push({
                route,
                kind: "overflow",
                selector: shortSel(html),
                text: text.slice(0, 60),
                details: `texto vaza ${worst.toFixed(1)}px (L${dl.toFixed(1)} R${dr.toFixed(1)} T${dt.toFixed(1)} B${db.toFixed(1)})`,
              });
            } else if (worst < minInset) {
              issues.push({
                route,
                kind: "edge",
                selector: shortSel(html),
                text: text.slice(0, 60),
                details: `texto a ${worst.toFixed(1)}px da borda (min ${minInset}px)`,
              });
            }
          }
        }
      }

      // Dedup por (selector|text|details)
      const seen = new Set<string>();
      return issues.filter((i) => {
        const k = `${i.selector}|${i.text}|${i.details}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    },
    { sel: SELECTOR, minInset, route },
  );
}

for (const route of ROUTES) {
  test(`texto não vaza nem encosta nas bordas — ${route}`, async ({ page }) => {
    const resp = await page.goto(route, { waitUntil: "networkidle" });
    // Algumas rotas podem redirecionar (e.g. /app → /entrar); validamos a UI atual.
    expect(resp?.status() ?? 0, `falha ao carregar ${route}`).toBeLessThan(500);

    // Pequeno settle para fontes/layout
    await page.waitForTimeout(300);
    await page.evaluate(() => (document as any).fonts?.ready);

    const issues = await collectIssues(page, route, MIN_INSET);

    if (issues.length) {
      const msg = issues
        .slice(0, 25)
        .map((i) => `  [${i.kind}] ${i.selector} :: "${i.text}" — ${i.details}`)
        .join("\n");
      throw new Error(`Encontrados ${issues.length} problemas de texto em ${route}:\n${msg}`);
    }
  });
}

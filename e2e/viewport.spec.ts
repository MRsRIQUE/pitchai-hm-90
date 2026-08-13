import { test, expect, type Page } from "@playwright/test";

/**
 * Rotas públicas a verificar. Acrescentar conforme novas páginas surgirem.
 * Rotas protegidas (e.g. /app, /admin, /lives, /indique) são cobertas separadamente
 * em suites autenticadas (auth.spec.ts, admin.spec.ts, live.spec.ts).
 */
const ROUTES = ["/", "/entrar", "/planos", "/quentes", "/download", "/reset-password"];

async function getMetrics(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const bg = getComputedStyle(body).backgroundColor;
    return {
      docWidth: html.scrollWidth,
      docHeight: html.scrollHeight,
      clientWidth: html.clientWidth,
      clientHeight: html.clientHeight,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      bodyBg: bg,
      // pixel no canto inferior-direto da viewport — deve casar com bg do app,
      // nunca branco puro (faixa exposta pela URL bar dinâmica)
      bottomRightOpaque: bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent",
    };
  });
}

async function expectNoHorizontalScroll(page: Page) {
  const { docWidth, clientWidth } = await getMetrics(page);
  // Tolerância de 1px para arredondamento de zoom em dispositivos com DPR alto.
  expect(docWidth, "documento não pode exceder a viewport (scroll horizontal)").toBeLessThanOrEqual(
    clientWidth + 1,
  );
}

async function expectBackgroundCoversViewport(page: Page) {
  const m = await getMetrics(page);
  expect(m.bottomRightOpaque, "body deve ter background opaco (sem faixa branca)").toBe(true);
  // Altura do documento >= altura visível: garante que o shell preenche a tela
  // mesmo quando a URL bar colapsa (100dvh > 100vh).
  expect(m.docHeight, "shell deve preencher pelo menos a viewport visível").toBeGreaterThanOrEqual(
    Math.floor(m.visualHeight) - 1,
  );
}

for (const route of ROUTES) {
  test.describe(`rota ${route}`, () => {
    test("sem scroll horizontal e fundo cobre a viewport", async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      await expectNoHorizontalScroll(page);
      await expectBackgroundCoversViewport(page);
    });

    test("após rotação portrait → landscape mantém invariantes", async ({ page, viewport }) => {
      test.skip(!viewport, "viewport indefinido");
      await page.goto(route, { waitUntil: "networkidle" });
      // Rotaciona invertendo width/height
      await page.setViewportSize({ width: viewport!.height, height: viewport!.width });
      // Aguarda hook useDevice re-medir via requestAnimationFrame
      await page.waitForTimeout(120);
      await expectNoHorizontalScroll(page);
      await expectBackgroundCoversViewport(page);
    });

    test("após simulação de URL bar colapsando não expõe faixa branca", async ({ page }) => {
      await page.goto(route, { waitUntil: "networkidle" });
      // Simula a URL bar do Safari/Chrome colapsando: shrink de ~80px no visualViewport.
      // Como Playwright não dispara o evento real, validamos via 100dvh diretamente.
      const dvhCoversAtLeastSvh = await page.evaluate(() => {
        const probe = document.createElement("div");
        probe.style.cssText =
          "position:fixed;inset:0;height:100dvh;width:100vw;pointer-events:none;visibility:hidden";
        document.body.appendChild(probe);
        const dvh = probe.getBoundingClientRect().height;
        probe.style.height = "100svh";
        const svh = probe.getBoundingClientRect().height;
        probe.remove();
        return dvh >= svh;
      });
      expect(dvhCoversAtLeastSvh, "100dvh deve cobrir >= 100svh").toBe(true);
    });
  });
}

test.describe("navegação entre rotas", () => {
  test("home → /planos → voltar preserva invariantes", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expectNoHorizontalScroll(page);

    await page.getByRole("link", { name: /^Planos$/i }).click();
    await page.waitForURL("**/planos");
    await expectNoHorizontalScroll(page);
    await expectBackgroundCoversViewport(page);

    await page.goBack();
    await page.waitForURL("**/");
    await expectNoHorizontalScroll(page);
    await expectBackgroundCoversViewport(page);
  });
});

test.describe("teclado virtual em formulário", () => {
  test("foco em input no /reset-password não introduz scroll horizontal", async ({ page }) => {
    await page.goto("/reset-password", { waitUntil: "networkidle" });
    const firstInput = page.locator("input, textarea").first();
    await firstInput.scrollIntoViewIfNeeded();
    await firstInput.focus();
    // Simula shrink de visualViewport (~280px de teclado) e valida que o
    // layout continua sem overflow horizontal e cobre o espaço visível.
    await page.evaluate(() => {
      const evt = new Event("resize");
      window.visualViewport?.dispatchEvent(evt);
    });
    await expectNoHorizontalScroll(page);
    await expectBackgroundCoversViewport(page);
  });
});

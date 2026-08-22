import { expect, test } from "@playwright/test";

test.describe("regressões da landing", () => {
  test("landing mobile mantém o hero legível e elimina vazios de scroll", async ({ page }) => {
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/", { waitUntil: "domcontentloaded" });

      await expect(page.locator(".hero-mega-title")).toBeVisible();
      const metrics = await page.evaluate(() => {
        const rect = (selector: string) => {
          const value = document.querySelector(selector)?.getBoundingClientRect();
          if (!value) throw new Error(`Elemento ausente: ${selector}`);
          return { top: value.top, bottom: value.bottom, height: value.height };
        };
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          title: rect(".hero-mega-text"),
          offer: rect(".hero-mega-card"),
          phone: rect(".hero-mobile-point"),
          logoReveal: rect(".logo-reveal"),
          manifesto: rect(".manifesto"),
          finalCta: rect(".cta-final"),
          finalPhoneDisplay: getComputedStyle(
            document.querySelector(".cta-final-phone") as HTMLElement,
          ).display,
        };
      });

      expect(metrics.documentWidth).toBe(metrics.viewport);
      expect(metrics.title.bottom).toBeLessThanOrEqual(metrics.offer.top + 1);
      expect(metrics.offer.bottom).toBeLessThanOrEqual(metrics.phone.top + 1);
      expect(metrics.logoReveal.height).toBeLessThan(800);
      expect(metrics.manifesto.height).toBeLessThan(800);
      expect(metrics.finalCta.height).toBeLessThan(650);
      expect(metrics.finalPhoneDisplay).toBe("none");
    }
  });

  /*
   * O que este teste vigia mudou de forma, porque a landing mudou.
   *
   * Ele nasceu para provar que o vídeo do hero não remontava ao alternar o
   * tema. Só que a landing hoje é escura e ponto: `ForceDarkTheme` trava o modo
   * enquanto a página de marketing está montada, e o seletor de tema foi
   * retirado dali de propósito — hero, partículas e máscaras foram calibrados
   * sobre preto e no claro não têm contraste. Um teste que clica num botão que
   * não existe mais não protege nada; ficava vermelho por conta própria.
   *
   * O que segue valendo é o vídeo do hero montar e tocar: ele é a primeira
   * coisa que o visitante vê, é pesado, e já quebrou antes. O `<video>` único
   * de classe `stage-video` deu lugar ao HeroMotion, que monta um deitado e um
   * em pé e deixa o CSS escolher qual aparece — daí o `:visible`.
   */
  test("vídeo do hero monta e toca na landing", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const video = page.locator(".landing .hero-video:visible");
    await expect(video).toHaveCount(1);
    await expect
      .poll(() => video.evaluate((el) => (el as HTMLVideoElement).readyState))
      .toBeGreaterThan(1);

    await video.evaluate((el) => (el as HTMLVideoElement).play());
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);

    // O tema continua escuro o tempo todo: se alguém devolver o seletor à
    // landing, é aqui que a decisão volta a ser discutida.
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("todos os CTAs de assinatura preservam o plano e usuário anônimo vai ao cadastro", async ({
    page,
  }) => {
    for (const route of ["/", "/planos"] as const) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const links = page.getByRole("link", {
        name: /Assinar(?: Plano)? (Mensal|Trimestral|Anual)/i,
      });
      await expect(links).toHaveCount(3);
      await expect(links.nth(0)).toHaveAttribute("href", "/comprar?plan=pitchai_mensal");
      await expect(links.nth(1)).toHaveAttribute("href", "/comprar?plan=pitchai_trimestral");
      await expect(links.nth(2)).toHaveAttribute("href", "/comprar?plan=pitchai_anual");
    }

    await page.getByRole("link", { name: "Assinar Plano Mensal" }).click();
    await page.waitForURL(/\/entrar\?.*mode=signup/);
    await expect(page.getByRole("heading", { name: "Criar sua conta" })).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get("next")).toBe("/comprar?plan=pitchai_mensal");
  });
});

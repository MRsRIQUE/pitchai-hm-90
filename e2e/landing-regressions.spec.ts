import { expect, test } from "@playwright/test";

test.describe("regressões da landing", () => {
  test("vídeo continua reproduzindo após alternar o tema", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const video = page.locator(".landing .stage-video");
    await expect(video).toHaveCount(1);
    await expect
      .poll(() => video.evaluate((el) => (el as HTMLVideoElement).readyState))
      .toBeGreaterThan(1);

    await video.evaluate((el) => (el as HTMLVideoElement).play());
    const sourceBefore = await video.getAttribute("src");
    await page
      .getByRole("banner")
      .getByRole("button", { name: /Mudar para o modo/i })
      .click();

    await expect(video).toHaveAttribute("src", sourceBefore!);
    await expect.poll(() => video.evaluate((el) => (el as HTMLVideoElement).paused)).toBe(false);
    await expect
      .poll(() => video.evaluate((el) => (el as HTMLVideoElement).readyState))
      .toBeGreaterThan(1);
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

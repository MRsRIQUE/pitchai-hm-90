import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config focado em regressões de viewport/PWA:
 * - faixas brancas (background não cobre 100dvh)
 * - scroll horizontal
 * - rotação retrato/paisagem
 * - navegação entre rotas
 * - teclado virtual (simulado via visualViewport shrink)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 8080",
        url: "http://localhost:8080",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "iphone-se",
      use: { ...devices["iPhone SE"] },
    },
    {
      name: "iphone-15",
      use: { ...devices["iPhone 15"] },
    },
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "ipad",
      use: { ...devices["iPad (gen 7)"] },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_DESKTOP_CHROMIUM
          ? { executablePath: process.env.PLAYWRIGHT_DESKTOP_CHROMIUM }
          : undefined,
      },
    },
  ],
});

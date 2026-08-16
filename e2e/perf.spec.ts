import { test, expect, type Page, type Request } from "@playwright/test";

/**
 * Smoke de performance: navega /app autenticado e garante que nenhuma
 * combinação (método + endpoint) seja chamada além do limite definido.
 *
 * Conta TODAS as requisições — incluindo redes lentas/refetch — para detectar
 * regressões como chamadas duplicadas que tornavam o painel lento.
 *
 * Variáveis necessárias no CI:
 *   E2E_ALUNO_EMAIL, E2E_ALUNO_PASSWORD   (usuário de teste no Firebase)
 *
 * Sem credenciais → o teste é pulado, não falha o CI.
 */

const EMAIL = process.env.E2E_ALUNO_EMAIL ?? "";
const PASSWORD = process.env.E2E_ALUNO_PASSWORD ?? "";

// Limite máximo de chamadas para a MESMA combinação método+endpoint
// durante a sessão. Tunar com cautela — todo aumento é uma regressão.
const MAX_DUPLICATE_CALLS = 3;
// Janela de captura após `load`.
const CAPTURE_MS = 5_000;

/** Reduz URLs do backend (Firestore REST e /api do app) a `METHOD path` ignorando filtros de query. */
function endpointKey(req: Request): string | null {
  const url = req.url();
  const isFirestore = url.includes("firestore.googleapis.com/v1/projects");
  const isAppApi = url.includes("/api/") && !url.includes("gateway.lovable.dev");
  if (!isFirestore && !isAppApi) return null;
  try {
    const u = new URL(url);
    return `${req.method()} ${u.pathname}`;
  } catch {
    return null;
  }
}

async function signInOnUi(page: Page) {
  await page.goto("/entrar", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("seu@email.com").fill(EMAIL);
  await page.getByPlaceholder("Senha (mín. 8 caracteres)").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/app", { timeout: 15_000 });
}

test.describe("perf: painel do aluno", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "defina E2E_ALUNO_EMAIL / E2E_ALUNO_PASSWORD para rodar este teste",
  );

  // Roda apenas no projeto "desktop" — selecione via `--project=desktop`.

  test("nenhum endpoint é chamado mais que o limite", async ({ page }) => {
    await signInOnUi(page);

    const counts = new Map<string, number>();
    page.on("request", (req) => {
      const k = endpointKey(req);
      if (!k) return;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });

    await page.goto("/app", { waitUntil: "load" });
    await page.waitForTimeout(CAPTURE_MS);

    const offenders = [...counts.entries()]
      .filter(([, n]) => n > MAX_DUPLICATE_CALLS)
      .sort((a, b) => b[1] - a[1]);

    if (offenders.length) {
      console.log("⚠️  Endpoints duplicados:");
      for (const [k, n] of offenders) console.log(`  ${n.toString().padStart(3)}x  ${k}`);
    }

    expect(
      offenders,
      `endpoints chamados mais de ${MAX_DUPLICATE_CALLS}x em ${CAPTURE_MS}ms`,
    ).toEqual([]);
  });

  test("zero respostas 4xx/5xx em /app", async ({ page }) => {
    await signInOnUi(page);

    const failures: string[] = [];
    page.on("response", (resp) => {
      const url = resp.url();
      if (!url.includes("firestore.googleapis.com") && !url.includes("/api/")) return;
      const s = resp.status();
      if (s >= 400) failures.push(`${s} ${resp.request().method()} ${url}`);
    });

    await page.goto("/app", { waitUntil: "load" });
    await page.waitForTimeout(CAPTURE_MS);

    expect(failures, `requests com erro:\n${failures.join("\n")}`).toEqual([]);
  });
});

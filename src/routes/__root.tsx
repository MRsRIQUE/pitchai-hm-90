import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { ThemeProvider } from "@/lib/use-theme";
import { Toaster } from "@/components/ui/sonner";
import { ReferralCapture } from "@/components/ReferralCapture";
import { ThemeModeSelector } from "@/components/live/ThemeModeSelector";

/**
 * Decide, antes da primeira pintura, se o preloader da home aparece.
 *
 * Roda na análise do HTML — não na hidratação — porque quem deve pular não
 * pode ver flash preto nenhum, e quem deve ver precisa do preloader opaco
 * desde o primeiro quadro. Quem pula ganha um <style> que o esconde na hora.
 *
 * Mostra em: primeira visita da sessão, reload, ou entrada vinda de fora.
 * Não mostra ao navegar entre rotas internas. `pitchai_skip_preloader` é a
 * chave de escape das ferramentas de captura (não esperam 3s por screenshot).
 *
 * O guard `__pitchaiPreloaderDecided` existe porque o React pode reinserir o
 * script na hidratação: sem ele a segunda execução leria o sessionStorage que
 * a primeira acabou de gravar e concluiria "pular" no meio da animação.
 */
const PRELOADER_DECIDE = `(function(){
  if (window.__pitchaiPreloaderDecided) return;
  window.__pitchaiPreloaderDecided = true;
  var show = false;
  try {
    var ss = window.sessionStorage;
    var home = location.pathname === '/' || location.pathname === '/index.html';
    var nav = (performance.getEntriesByType('navigation')[0] || {}).type || 'navigate';
    var internal = document.referrer.indexOf(location.origin) !== -1;
    var seen = ss.getItem('pitchai_seen_home') === 'true';

    if (home) ss.setItem('pitchai_seen_home', 'true');

    show = home && (nav === 'reload' || (nav !== 'back_forward' && !internal && !seen));
    if (ss.getItem('pitchai_skip_preloader') === 'true') show = false;
  } catch (e) {
    show = true;
  }
  var skip = !show;
  window.__pitchaiPreloaderSkip = skip;
  if (skip) {
    var st = document.createElement('style');
    st.setAttribute('data-preloader-skip', '');
    st.textContent = '.pa-preloader{display:none!important}';
    document.head.appendChild(st);
  }
})();`;

function NotFoundComponent() {
  return (
    <div className="marketing-page flex min-h-screen items-center justify-center px-4">
      <div className="marketing-panel max-w-md rounded-3xl p-8 text-center">
        <h1 className="marketing-title text-7xl text-foreground">404</h1>
        <p className="mt-4 text-sm text-muted-foreground">Página não encontrada.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Ir para o início
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("[root-error]", error);
  }, [error]);
  return (
    <div className="marketing-page flex min-h-screen items-center justify-center px-4">
      <div className="marketing-panel max-w-md rounded-3xl p-8 text-center">
        <h1 className="marketing-title text-3xl text-foreground">Algo deu errado</h1>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Pitch AI — Automação de LIVE" },
      {
        name: "description",
        content:
          "Automatize sua LIVE do TikTok Shop com IA: pitch em voz, respostas no chat e proteção.",
      },
      { name: "theme-color", content: "#0F0F1A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Pitch AI" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Pitch AI — Automação de LIVE" },
      { property: "og:description", content: "Automatize sua LIVE do TikTok Shop com IA." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@600;700;800&family=Sora:wght@700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              /* As páginas de marketing são escuras e não têm seletor (ver
                 ForceDarkTheme). A decisão precisa sair AQUI, antes da primeira
                 pintura: deixar para o effect faria quem tem preferência clara
                 salva ver um flash branco antes da landing assentar. */
              '(function(){try{var mkt=!/^\\/(app|admin)/.test(location.pathname);var t=localStorage.getItem("pitchai-theme");var d=mkt||(t?t==="dark":!matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.classList.add(d?"dark":"light");document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){document.documentElement.classList.add("dark")}})();',
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: PRELOADER_DECIDE }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    let cancelled = false;

    const clearLegacyWorker = async () => {
      const registrations =
        "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistrations() : [];
      const cacheKeys = "caches" in window ? await caches.keys() : [];
      const legacyCacheKeys = cacheKeys.filter(
        (key) => key.startsWith("fit-") || key.startsWith("pitchai-"),
      );

      await Promise.all([
        ...registrations.map((registration) => registration.unregister()),
        ...legacyCacheKeys.map((key) => caches.delete(key)),
      ]);

      const needsReload = registrations.length > 0 || legacyCacheKeys.length > 0;
      const reloadKey = "pitchai-legacy-cache-cleared-v1";
      if (!cancelled && needsReload && sessionStorage.getItem(reloadKey) !== "1") {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      }
    };

    void clearLegacyWorker().catch(() => {
      // Cache cleanup must never prevent the application from rendering.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Outlet />
        <ReferralCapture />
        <div className="theme-float fixed bottom-5 right-5 z-[100] rounded-full bg-background/55 p-1 shadow-lg backdrop-blur-xl">
          <ThemeModeSelector />
        </div>
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

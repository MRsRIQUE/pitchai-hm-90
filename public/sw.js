// Service worker para o PWA: NetworkFirst para navegações (HTML),
// CacheFirst para assets versionados. Auto-update agressivo: assim que
// uma nova versão é detectada, ativa imediatamente e recarrega as abas.

const VERSION = "v4";
const RUNTIME_CACHE = `fit-runtime-${VERSION}`;
const ASSETS_CACHE = `fit-assets-${VERSION}`;
const IMAGES_CACHE = `fit-images-${VERSION}`;

self.addEventListener("install", (event) => {
  // Nova versão entra em vigor imediatamente, sem esperar abas fecharem.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches antigos de versões anteriores.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("fit-") && !k.endsWith(VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Permite que a página force ativação imediata de uma versão pendente.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isHTMLRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isHashedAsset(url) {
  return /\/assets\/.+\.[a-f0-9]{6,}\.(?:js|css|woff2?|png|jpg|jpeg|svg|webp|avif)$/i.test(
    url.pathname,
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Exercise images: CacheFirst (imutáveis por exerciseId+resolution).
  if (url.pathname.startsWith("/api/exercise-image/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGES_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone()).catch(() => {});
        return res;
      })(),
    );
    return;
  }

  // Nunca cachear API/auth/webhooks (exceto exercise-image acima).
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/~oauth")) return;

  // HTML: NetworkFirst — sempre tenta rede para pegar a build nova.
  if (isHTMLRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: "no-store" });
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match(request);
          return cached || caches.match("/");
        }
      })(),
    );
    return;
  }

  // Assets versionados: CacheFirst (são imutáveis pelo hash).
  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok) {
          const cache = await caches.open(ASSETS_CACHE);
          cache.put(request, res.clone()).catch(() => {});
        }
        return res;
      })(),
    );
  }
});

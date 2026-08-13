// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    // O deploy alvo é Vercel; node-server gera apenas um servidor Node
    // standalone e deixa o Vercel sem uma função/rota para responder ao domínio.
    preset: "vercel",
    prerender: {
      routes: ["/"],
    },
  } as unknown as { preset: string },
  vite: {
    resolve: {
      alias: {
        "node:async_hooks": path.resolve(__dirname, "./src/lib/async-hooks-stub.ts"),
        async_hooks: path.resolve(__dirname, "./src/lib/async-hooks-stub.ts"),
      },
    },
    optimizeDeps: {
      exclude: ["zod"],
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-router",
        "@tanstack/react-query",
        "framer-motion",
        "lucide-react",
        "sonner",
        "date-fns",
        "clsx",
        "tailwind-merge",
        "class-variance-authority",
      ],
    },
    build: {
      target: "es2022",
      minify: "esbuild",
      cssMinify: "lightningcss",
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        treeshake: {
          preset: "recommended",
          moduleSideEffects: false,
        },
        output: {
          compact: true,
        },
      },
    },
    esbuild: {
      legalComments: "none",
      drop: ["debugger"],
      pure: ["console.log", "console.debug", "console.trace"],
    },
    plugins: [
      VitePWA({
        // O Nitro/Vercel controla o diretório final; gerar o SW aqui causa
        // ENOENT porque o plugin roda depois que o output é reorganizado.
        disable: process.env.NODE_ENV === "production",
        outDir: ".output/public",
        selfDestroying: true,
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        manifest: false, // we ship our own public/manifest.json
        workbox: {
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//, /^\/~oauth/],
          globPatterns: ["**/*.{js,css,html,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            // HTML — always try network first
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html-nav",
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            // Images / thumbnails — cache first for fast repeats
            {
              urlPattern: ({ request }) => request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "img-cache",
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Videos (mp4/webm) — range-aware cache
            {
              urlPattern: ({ request, url }) =>
                request.destination === "video" || /\.(mp4|webm|m4v)(\?|$)/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "video-cache",
                rangeRequests: true,
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 14 },
                cacheableResponse: { statuses: [0, 200, 206] },
              },
            },
            // Google Fonts
            {
              urlPattern: ({ url }) =>
                url.origin === "https://fonts.googleapis.com" ||
                url.origin === "https://fonts.gstatic.com",
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts" },
            },
          ],
        },
      }),
    ],
  },
});

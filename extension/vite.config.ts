import { defineConfig } from "vite";
import { resolve } from "node:path";

/**
 * Build da extensão (arquitetura TypeScript em src/).
 *
 * Cada entrada é um content script independente — content scripts do Chrome
 * não suportam ESM com chunks compartilhados, então cada arquivo é gerado
 * como um bundle autocontido (sem code-splitting).
 *
 * Nota: os arquivos legados na raiz de extension/ (content.js, regions.js,
 * dom-map.js, hook.js, net-bridge.js, panel.js) continuam sendo os arquivos
 * efetivamente distribuídos no zip até a migração para TypeScript ser
 * concluída. Use `npm run build` para validar/gerar os bundles de src/.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Um único entry por build evita chunks compartilhados.
    // O script scripts/build-entries.mjs itera sobre todas as entradas.
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "PitchAI",
      formats: ["iife"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
});

/**
 * Empacota a extensão do Chrome em public/pitchai-extension.zip.
 *
 * IMPORTANTE: o zip é um arquivo BINÁRIO. Ele nunca deve ser editado ou
 * copiado por pipelines de texto (isso foi o que corrompeu a versão
 * anterior — todos os bytes não-ASCII foram substituídos por U+FFFD).
 * Sempre regenere com: npm run build:extension
 */
import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const extDir = path.join(rootDir, "extension");
const outZip = path.join(rootDir, "public", "pitchai-extension.zip");

// Arquivos distribuídos — exatamente os referenciados pelo manifest.json
const FILES = [
  "manifest.json",
  "content.js",
  "dom-map.js",
  "hook.js",
  "net-bridge.js",
  "regions.js",
  "panel.html",
  "panel.js",
  "panel.css",
  "popup.html",
  "styles.css",
  "icon.png",
];

// Validações antes de empacotar
const manifest = JSON.parse(readFileSync(path.join(extDir, "manifest.json"), "utf8"));
if (!manifest.manifest_version || !manifest.version) {
  console.error("[pack-extension] manifest.json inválido");
  process.exit(1);
}

const missing = FILES.filter((f) => !existsSync(path.join(extDir, f)));
if (missing.length) {
  console.error("[pack-extension] Arquivos ausentes:", missing.join(", "));
  process.exit(1);
}

// Garante que o ícone é um PNG de verdade (Chrome rejeita JPEG renomeado)
const iconHead = readFileSync(path.join(extDir, "icon.png")).subarray(0, 8);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!iconHead.equals(PNG_MAGIC)) {
  console.error("[pack-extension] icon.png não é um PNG válido");
  process.exit(1);
}

// Empacota com o utilitário zip do sistema (modo binário garantido)
try {
  execFileSync("zip", ["-X", "-q", "-j", "-FS", outZip, ...FILES.map((f) => path.join(extDir, f))], {
    cwd: extDir,
  });
} catch (err) {
  console.error("[pack-extension] Falha ao executar 'zip':", err.message);
  process.exit(1);
}

// Verificação de integridade
execFileSync("unzip", ["-t", "-q", outZip]);
const size = statSync(outZip).size;
console.log(
  `[pack-extension] OK — ${path.relative(rootDir, outZip)} (${(size / 1024).toFixed(1)} KB, v${manifest.version}, ${FILES.length} arquivos)`,
);

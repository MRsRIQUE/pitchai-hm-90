/**
 * Empacota a extensão do Chrome em public/pitchai-extension.zip.
 *
 * IMPORTANTE: o zip é um arquivo BINÁRIO. Ele nunca deve ser editado ou
 * copiado por pipelines de texto (isso foi o que corrompeu a versão
 * anterior — todos os bytes não-ASCII foram substituídos por U+FFFD).
 * Sempre regenere com: npm run build:extension
 */
import { existsSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const extDir = path.join(rootDir, "extension");
const outZip = path.join(rootDir, "public", "pitchai-extension.zip");

// Arquivos distribuídos — exatamente os referenciados pelo manifest.json
const FILES = [
  "manifest.json",
  "blocklist.js",
  "account-bridge.js",
  "product-bridge.js",
  "product-scrape.js",
  "background.js",
  "offscreen.html",
  "offscreen.js",
  "content.js",
  "dom-map.js",
  "hook.js",
  "media-injector.js",
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

const psQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;

// ---------------------------------------------------------------------------
// Manifest de release: remove hosts de desenvolvimento (localhost/127.0.0.1).
// O manifest fonte mantém localhost para facilitar testes locais; o zip
// distribuído (Chrome Web Store) nunca deve referenciar hosts de dev.
// ---------------------------------------------------------------------------
const DEV_HOST_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/\*$/;

const stripDevMatches = (patterns) => (patterns ?? []).filter((p) => !DEV_HOST_RE.test(p));

const releaseManifest = {
  ...manifest,
  host_permissions: stripDevMatches(manifest.host_permissions),
  content_scripts: (manifest.content_scripts ?? []).map((cs) => ({
    ...cs,
    matches: stripDevMatches(cs.matches),
  })),
};

const stagingDir = mkdtempSync(path.join(tmpdir(), "pitchai-ext-"));
try {
  const stagedManifest = path.join(stagingDir, "manifest.json");
  writeFileSync(stagedManifest, JSON.stringify(releaseManifest, null, 2));

  // Empacota em modo binário. Linux/macOS usam zip; Windows possui fallback
  // nativo para que `npm run build:extension` funcione também no ambiente local.
  const zipFiles = FILES.map((f) =>
    f === "manifest.json" ? stagedManifest : path.join(extDir, f),
  );
  try {
    execFileSync("zip", ["-X", "-q", "-j", "-FS", outZip, ...zipFiles], {
      cwd: extDir,
    });
  } catch (err) {
    if (process.platform !== "win32") {
      console.error("[pack-extension] Falha ao executar 'zip':", err.message);
      process.exit(1);
    }
    const literalPaths = zipFiles.map((f) => psQuote(f)).join(",");
    const command = `Compress-Archive -LiteralPath @(${literalPaths}) -DestinationPath ${psQuote(outZip)} -CompressionLevel Optimal -Force`;
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      cwd: extDir,
      stdio: "pipe",
    });
  }
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}

const forbiddenBackends = ["pitchai.ai.studio", "pitchai-live.lovable.app"];
const forbiddenMatches = FILES.filter((file) => {
  if (!/\.(?:html|js|json)$/.test(file)) return false;
  const source = readFileSync(path.join(extDir, file), "utf8");
  return forbiddenBackends.some((backend) => source.includes(backend));
});
if (forbiddenMatches.length) {
  console.error(
    "[pack-extension] Referencia a backend legado encontrada:",
    forbiddenMatches.join(", "),
  );
  process.exit(1);
}

// Verificação de integridade
try {
  execFileSync("unzip", ["-t", "-q", outZip]);
} catch (err) {
  if (process.platform !== "win32") throw err;
  const verify = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead(${psQuote(outZip)}); try { if ($z.Entries.Count -ne ${FILES.length}) { throw 'Quantidade de arquivos inválida' } } finally { $z.Dispose() }`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", verify], {
    stdio: "pipe",
  });
}
// ---------------------------------------------------------------------------
// Versão única do produto: o manifest da extensão é a fonte da verdade.
// O site lia uma constante escrita à mão que parou de ser bumpada e ficou 14
// versões atrás. Além de mostrar o número errado no painel e na página de
// download, ela congelava o cache-buster de /pitchai-extension.zip?v=… — o
// usuário podia baixar um zip velho servido do cache.
// ---------------------------------------------------------------------------
const versionFile = path.join(rootDir, "src", "lib", "live", "version.ts");
const versionSource = `/**
 * Versão única do produto — usada no painel, rodapé e página de download.
 *
 * ARQUIVO GERADO por scripts/pack-extension.mjs a partir de
 * extension/manifest.json. Não edite à mão: bumpe o manifest e rode
 * \`npm run build:extension\`.
 */
export const APP_VERSION = "${manifest.version}";
`;
const versionBefore = existsSync(versionFile) ? readFileSync(versionFile, "utf8") : "";
if (versionBefore !== versionSource) {
  writeFileSync(versionFile, versionSource);
  const antes = versionBefore.match(/APP_VERSION = "([^"]+)"/)?.[1] ?? "ausente";
  console.log(
    `[pack-extension] ${path.relative(rootDir, versionFile)} sincronizado: ${antes} → ${manifest.version}`,
  );
}

const size = statSync(outZip).size;
console.log(
  `[pack-extension] OK — ${path.relative(rootDir, outZip)} (${(size / 1024).toFixed(1)} KB, v${manifest.version}, ${FILES.length} arquivos)`,
);

/**
 * Empacota a extensão do Chrome.
 *
 *   node scripts/pack-extension.mjs                 → private-assets/pitchai-extension.zip
 *     Distribuição pelo site (/download). O zip fica fora de public/ e é servido
 *     pela rota autenticada, para a URL estática não contornar a licença. O
 *     manifest mantém o campo `key`, então o ID da extensão fica fixo em
 *     qualquer pasta em que o zip for extraído.
 *
 *   node scripts/pack-extension.mjs --webstore      → dist/pitchai-extension-webstore.zip
 *     Upload na Chrome Web Store, que REJEITA o campo `key` ("O campo key não é
 *     permitido no manifesto"). A Store assina o pacote com a chave dela; o ID
 *     só continua o mesmo da distribuição pelo site se a chave privada for enviada
 *     no PRIMEIRO upload do item: `--key-pem <caminho>` inclui o arquivo como
 *     `key.pem` na raiz do zip (esse zip contém a chave privada — não distribua).
 *     O alvo --webstore não toca no zip do site nem no version.ts.
 *
 * IMPORTANTE: o zip é um arquivo BINÁRIO. Ele nunca deve ser editado ou
 * copiado por pipelines de texto (isso foi o que corrompeu a versão
 * anterior — todos os bytes não-ASCII foram substituídos por U+FFFD).
 * Sempre regenere com: npm run build:extension
 */
import {
  existsSync,
  readFileSync,
  statSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createPublicKey } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const extDir = path.join(rootDir, "extension");

// ---------------------------------------------------------------------------
// Alvo do empacotamento
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const WEBSTORE = argv.includes("--webstore");
const keyPemIndex = argv.indexOf("--key-pem");
const keyPemPath = keyPemIndex >= 0 ? path.resolve(String(argv[keyPemIndex + 1] || "")) : "";
if (keyPemIndex >= 0 && !argv[keyPemIndex + 1]) {
  console.error("[pack-extension] --key-pem exige o caminho do arquivo .pem");
  process.exit(1);
}
if (keyPemPath && !WEBSTORE) {
  console.error("[pack-extension] --key-pem só faz sentido junto com --webstore");
  process.exit(1);
}

const outZip = WEBSTORE
  ? path.join(rootDir, "dist", "pitchai-extension-webstore.zip")
  : path.join(rootDir, "private-assets", "pitchai-extension.zip");

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
// Manifest de release.
// - Remove hosts de desenvolvimento (localhost/127.0.0.1): o manifest fonte pode
//   mantê-los para testes locais; o zip distribuído nunca deve referenciá-los.
// - Remove permissões que não existem no MV3 (o Chrome loga "Permission X is
//   unknown." e a Web Store pode recusar). Mic/câmera são pedidos em runtime
//   por getUserMedia, não por `permissions`.
// - No alvo --webstore, remove o `key` (a Store não aceita o campo).
// ---------------------------------------------------------------------------
const DEV_HOST_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/\*$/;
const UNKNOWN_PERMISSIONS = new Set(["microphone", "camera"]);

const stripDevMatches = (patterns) => (patterns ?? []).filter((p) => !DEV_HOST_RE.test(p));

const permissions = (manifest.permissions ?? []).filter((p) => {
  if (!UNKNOWN_PERMISSIONS.has(p)) return true;
  console.warn(
    `[pack-extension] aviso: a permissão "${p}" não existe no MV3 — removida do zip (remova também do extension/manifest.json).`,
  );
  return false;
});

const releaseManifest = {
  ...manifest,
  permissions,
  host_permissions: stripDevMatches(manifest.host_permissions),
  content_scripts: (manifest.content_scripts ?? []).map((cs) => ({
    ...cs,
    matches: stripDevMatches(cs.matches),
  })),
};
if (WEBSTORE) delete releaseManifest.key;

// A chave privada enviada no 1º upload precisa ser o par do `key` do manifest —
// senão a Store gera outro ID e o upload "com chave" não serviu para nada.
if (keyPemPath) {
  if (!existsSync(keyPemPath)) {
    console.error("[pack-extension] --key-pem: arquivo não encontrado:", keyPemPath);
    process.exit(1);
  }
  if (!manifest.key) {
    console.error("[pack-extension] --key-pem: o manifest fonte não tem `key` para comparar");
    process.exit(1);
  }
  let derivedKey = "";
  try {
    derivedKey = createPublicKey(readFileSync(keyPemPath, "utf8"))
      .export({ type: "spki", format: "der" })
      .toString("base64");
  } catch (err) {
    console.error("[pack-extension] --key-pem: não foi possível ler a chave:", err.message);
    process.exit(1);
  }
  if (derivedKey !== manifest.key) {
    console.error(
      "[pack-extension] --key-pem: a chave privada NÃO corresponde ao `key` do manifest — abortando.",
    );
    process.exit(1);
  }
}

mkdirSync(path.dirname(outZip), { recursive: true });

const stagingDir = mkdtempSync(path.join(tmpdir(), "pitchai-ext-"));
let zipFiles = [];
try {
  const stagedManifest = path.join(stagingDir, "manifest.json");
  writeFileSync(stagedManifest, JSON.stringify(releaseManifest, null, 2));

  // Empacota em modo binário. Linux/macOS usam zip; Windows possui fallback
  // nativo para que `npm run build:extension` funcione também no ambiente local.
  zipFiles = FILES.map((f) => (f === "manifest.json" ? stagedManifest : path.join(extDir, f)));
  if (keyPemPath) {
    // Precisa se chamar exatamente key.pem e ficar na raiz do zip.
    const stagedPem = path.join(stagingDir, "key.pem");
    writeFileSync(stagedPem, readFileSync(keyPemPath));
    zipFiles.push(stagedPem);
  }
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
const expectedEntries = zipFiles.length;
try {
  execFileSync("unzip", ["-t", "-q", outZip]);
} catch (err) {
  if (process.platform !== "win32") throw err;
  const verify = `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead(${psQuote(outZip)}); try { if ($z.Entries.Count -ne ${expectedEntries}) { throw 'Quantidade de arquivos inválida' } } finally { $z.Dispose() }`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", verify], {
    stdio: "pipe",
  });
}

// ---------------------------------------------------------------------------
// Versão única do produto: o manifest da extensão é a fonte da verdade.
// O site lia uma constante escrita à mão que parou de ser bumpada e ficou 14
// versões atrás. Além de mostrar o número errado no painel e na página de
// download, ela congelava o nome da versão mostrado para o usuário.
// (Só no alvo padrão: o build da Web Store não mexe no código-fonte do site.)
// ---------------------------------------------------------------------------
if (!WEBSTORE) {
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
}

const size = statSync(outZip).size;
const target = WEBSTORE ? "Chrome Web Store (sem `key`)" : "distribuição manual (com `key`)";
console.log(
  `[pack-extension] OK — ${path.relative(rootDir, outZip)} (${(size / 1024).toFixed(1)} KB, v${manifest.version}, ${expectedEntries} arquivos, ${target})`,
);
if (WEBSTORE) {
  console.log(
    keyPemPath
      ? "[pack-extension] key.pem incluído: use este zip SÓ no primeiro upload do item; depois gere sem --key-pem. Não distribua este arquivo."
      : "[pack-extension] sem key.pem: se este for o primeiro upload do item, a Store vai gerar um ID diferente do da distribuição manual.",
  );
}

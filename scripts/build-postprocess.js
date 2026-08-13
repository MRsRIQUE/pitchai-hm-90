import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputPublicDir = path.join(rootDir, ".output", "public");
const distDir = path.join(rootDir, "dist");

console.log("[build-postprocess] Starting post-build process...");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(outputPublicDir)) {
  console.log("[build-postprocess] Copying .output/public to dist...");
  fs.cpSync(outputPublicDir, distDir, { recursive: true });
}

console.log("[build-postprocess] Completed.");

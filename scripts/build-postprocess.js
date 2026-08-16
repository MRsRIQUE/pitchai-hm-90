import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const outputPublicDir = path.join(rootDir, ".output", "public");
const distDir = path.join(rootDir, "dist");
const vercelAssetsDir = path.join(rootDir, ".vercel", "output", "static", "assets");

console.log("[build-postprocess] Starting post-build process...");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

if (fs.existsSync(outputPublicDir)) {
  console.log("[build-postprocess] Copying .output/public to dist...");
  fs.cpSync(outputPublicDir, distDir, { recursive: true });
}

// Keep the asset URLs emitted by the long-lived LP preview working on the
// production alias. Browsers that cached that HTML would otherwise request
// those hashes after a promotion, receive 404, and render the page without CSS.
if (fs.existsSync(vercelAssetsDir)) {
  const files = fs.readdirSync(vercelAssetsDir);
  const findAsset = (pattern, pick = 0) => {
    const matches = files
      .filter((name) => pattern.test(name))
      .map((name) => ({ name, size: fs.statSync(path.join(vercelAssetsDir, name)).size }))
      .sort((a, b) => b.size - a.size);
    return matches[pick]?.name;
  };

  const current = {
    entry: findAsset(/^index-[A-Za-z0-9_-]+\.js$/),
    landing: findAsset(/^index-[A-Za-z0-9_-]+\.js$/, 1),
    landingCss: findAsset(/^index-[A-Za-z0-9_-]+\.css$/),
    globalCss: findAsset(/^styles-[A-Za-z0-9_-]+\.css$/),
    download: findAsset(/^download-[A-Za-z0-9_-]+\.js$/, 1),
    mic: findAsset(/^mic-[A-Za-z0-9_-]+\.js$/),
    logo: findAsset(/^PitchAiLogo-[A-Za-z0-9_-]+\.js$/),
    plans: findAsset(/^plans-[A-Za-z0-9_-]+\.js$/),
    plus: findAsset(/^plus-[A-Za-z0-9_-]+\.js$/),
    volume: findAsset(/^volume-2-[A-Za-z0-9_-]+\.js$/),
    x: findAsset(/^x-[A-Za-z0-9_-]+\.js$/),
    zap: findAsset(/^zap-[A-Za-z0-9_-]+\.js$/),
  };

  const legacyAliases = {
    "styles-tGGWyqWa.css": current.globalCss,
    "index-BvZMx9Js.css": current.landingCss,
    "index-CEmpWF32.js": current.entry,
    "index-weFlNHwg.js": current.landing,
    "download-kDAIbCOH.js": current.download,
    "mic-BRCN1La8.js": current.mic,
    "PitchAiLogo-DAcgMGo_.js": current.logo,
    "plans-CCROMSSy.js": current.plans,
    "plus-BQBV9IMN.js": current.plus,
    "volume-2-BpgDC2OG.js": current.volume,
    "x-DXdiXy92.js": current.x,
    "zap-C2_6vsZG.js": current.zap,
  };

  for (const [legacyName, currentName] of Object.entries(legacyAliases)) {
    if (!currentName) {
      console.warn(
        `[build-postprocess] Skipping legacy alias without a current chunk: ${legacyName}`,
      );
      continue;
    }
    fs.copyFileSync(
      path.join(vercelAssetsDir, currentName),
      path.join(vercelAssetsDir, legacyName),
    );
  }
  console.log("[build-postprocess] Added legacy LP asset aliases.");
}

console.log("[build-postprocess] Completed.");

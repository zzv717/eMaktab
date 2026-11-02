#!/usr/bin/env node
// 🤖 Android TWA loyihasini generatsiya qilish (bubblewrap TwaGenerator bilan).
// Ishlatish: node scripts/gen-android.js  (natija: android/ papka)
// Eslatma: npm i -D @bubblewrap/core kerak (yoki BUBBLEWRAP_CORE_PATH muhit o'zgaruvchisi).
const fs = require("fs");
const path = require("path");

const corePath = process.env.BUBBLEWRAP_CORE_PATH || "@bubblewrap/core";
const { TwaManifest, TwaGenerator, ConsoleLog, BufferedLog } = require(corePath);

async function main() {
  const root = path.resolve(__dirname, "..");
  const manifestPath = path.join(root, "twa-manifest.json");
  const target = path.join(root, "android");

  const manifest = await TwaManifest.fromFile(manifestPath);
  // Ikonalarni qo'lda qo'yamiz — tashqi yuklab olish o'chiriladi (offline generatsiya)
  manifest.iconUrl = manifest.iconUrl || "https://example.com/icon.png";
  manifest.maskableIconUrl = "";
  manifest.monochromeIconUrl = "";

  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  const log = new BufferedLog(new ConsoleLog("gen-android"));
  const generator = new TwaGenerator();
  // Rasmlarni yuklab olish o'rniga — qo'lda qo'yiladi (offline)
  generator.generateIcons = async () => {};
  generator.generateShortcuts = async () => {};
  generator.writeWebManifest = async () => {};
  await generator.createTwaProject(target, manifest, log, () => {});
  log.flush();

  // 🎨 Ikonalarni qo'lda qo'yamiz (PNG — barcha zichliklar uchun)
  const icon = path.join(root, "public", "icons", "icon-512.png");
  const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
  for (const d of densities) {
    const dir = path.join(target, "app", "src", "main", "res", `mipmap-${d}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(icon, path.join(dir, "ic_launcher.png"));
    fs.copyFileSync(icon, path.join(dir, "ic_launcher_round.png"));
  }
  // Adaptive (anydpi) XML'lar yo'q drawable'larga ishora qilgani uchun o'chiramiz
  const anydpi = path.join(target, "app", "src", "main", "res", "mipmap-anydpi-v26");
  if (fs.existsSync(anydpi)) fs.rmSync(anydpi, { recursive: true, force: true });

  console.log("✅ android/ loyihasi generatsiya qilindi");
}

main().catch((e) => {
  console.error("XATO:", e.message);
  process.exit(1);
});

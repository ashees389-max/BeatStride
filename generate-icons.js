/**
 * BeatStride Icon Generator
 * Converts beatstride-icon.svg into all required PNG sizes
 * 
 * Run from your project folder:
 *   node generate-icons.js
 *
 * Requires: sharp
 *   npm install sharp
 */

const sharp  = require("sharp");
const fs     = require("fs");
const path   = require("path");

const SVG_PATH  = path.join(__dirname, "beatstride-icon.svg");
const ICONS_DIR = path.join(__dirname, "icons");

const SIZES = [48, 72, 96, 144, 192, 512];

const EXTRA = [
  { size: 1024, name: "icon-1024.png",         note: "Play Store high-res icon" },
  { size: 512,  name: "icon-512-playstore.png", note: "Play Store listing icon" },
];

async function generate() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR);
    console.log("Created icons/ folder");
  }

  // Verify SVG exists and is not empty
  if (!fs.existsSync(SVG_PATH)) {
    console.error("ERROR: beatstride-icon.svg not found in this folder.");
    console.error("Make sure beatstride-icon.svg is in:", __dirname);
    return;
  }

  const svgContent = fs.readFileSync(SVG_PATH, "utf8");
  if (!svgContent || svgContent.trim().length === 0) {
    console.error("ERROR: beatstride-icon.svg is empty.");
    return;
  }

  // Convert SVG string to buffer explicitly
  const svgBuffer = Buffer.from(svgContent, "utf8");

  console.log("\nGenerating icons from beatstride-icon.svg...\n");

  for (const size of SIZES) {
    const outPath = path.join(ICONS_DIR, `icon-${size}.png`);
    await sharp(svgBuffer, { density: 300 })
      .resize(size, size)
      .png({ quality: 100 })
      .toFile(outPath);
    console.log(`  ✅ icon-${size}.png  (${size}×${size}px)`);
  }

  for (const extra of EXTRA) {
    const outPath = path.join(ICONS_DIR, extra.name);
    await sharp(svgBuffer, { density: 300 })
      .resize(extra.size, extra.size)
      .png({ quality: 100 })
      .toFile(outPath);
    console.log(`  ✅ ${extra.name}  — ${extra.note}`);
  }

  const featurePath = path.join(ICONS_DIR, "feature-graphic.png");
  await sharp(svgBuffer, { density: 300 })
    .resize(1024, 500, {
      fit: "contain",
      background: { r: 3, g: 8, b: 16, alpha: 1 }
    })
    .png({ quality: 100 })
    .toFile(featurePath);
  console.log(`  ✅ feature-graphic.png  (1024×500px) — Play Store banner`);

  console.log("\n✅ All icons generated in the icons/ folder");
}

generate().catch(err => {
  console.error("Error generating icons:", err.message);
  console.log("\nMake sure you ran: npm install sharp");
});
/**
 * Generate Electron + web app icons from the source PBooks Pro logo PNG.
 * Usage: node scripts/generate-app-icons.mjs [source-png]
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import png2icons from 'png2icons';

const ROOT = process.cwd();
const SOURCE = path.resolve(ROOT, process.argv[2] || 'pbookspro logo.png');

if (!fs.existsSync(SOURCE)) {
  console.error(`Source logo not found: ${SOURCE}`);
  process.exit(1);
}

const OUTPUT_DIRS = ['electron/assets', 'public'];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const PNG_SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];

async function resizePng(size) {
  return sharp(SOURCE)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  for (const dir of OUTPUT_DIRS) {
    fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  }

  const pngBySize = new Map();
  for (const size of PNG_SIZES) {
    pngBySize.set(size, await resizePng(size));
  }

  const icoBuffer = await pngToIco(ICO_SIZES.map((size) => pngBySize.get(size)));
  fs.writeFileSync(path.join(ROOT, 'electron/assets/icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(ROOT, 'public/icon.ico'), icoBuffer);

  const icnsBuffer = png2icons.createICNS(pngBySize.get(1024), png2icons.BICUBIC, 0, false);
  if (!icnsBuffer) {
    throw new Error('Failed to generate icon.icns');
  }
  fs.writeFileSync(path.join(ROOT, 'electron/assets/icon.icns'), icnsBuffer);

  fs.writeFileSync(path.join(ROOT, 'public/icon.png'), pngBySize.get(256));
  fs.writeFileSync(path.join(ROOT, 'public/icon-192.png'), pngBySize.get(192));
  fs.writeFileSync(path.join(ROOT, 'public/icon-512.png'), pngBySize.get(512));
  fs.writeFileSync(path.join(ROOT, 'public/apple-touch-icon.png'), pngBySize.get(180));
  fs.writeFileSync(path.join(ROOT, 'public/favicon-32x32.png'), pngBySize.get(32));
  fs.writeFileSync(path.join(ROOT, 'public/favicon-16x16.png'), pngBySize.get(16));

  const meta = await sharp(SOURCE).metadata();
  console.log(`Generated app icons from ${path.basename(SOURCE)} (${meta.width}x${meta.height})`);
  console.log('  electron/assets/icon.ico, icon.icns');
  console.log('  public/icon.ico, icon.png, icon-192.png, icon-512.png, apple-touch-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

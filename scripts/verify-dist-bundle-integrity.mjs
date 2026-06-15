/**
 * Fail if Vite output references chunk files that are missing from dist/assets.
 * Catches intermittent ENOENT failures during electron-builder packaging.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('[verify-dist-bundle-integrity] dist/assets missing — run npm run build first');
  process.exit(1);
}

const importRe = /(?:from\s*["']\.\/|import\s*\(\s*["']\.\/)([^"']+)["']/g;
const missing = new Set();

function checkFile(filePath) {
  const dir = path.dirname(filePath);
  const text = fs.readFileSync(filePath, 'utf8');
  let m;
  importRe.lastIndex = 0;
  while ((m = importRe.exec(text)) !== null) {
    const rel = m[1];
    if (!rel.endsWith('.js')) continue;
    const target = path.join(dir, rel);
    if (!fs.existsSync(target)) {
      missing.add(path.relative(root, target));
    }
  }
}

for (const name of fs.readdirSync(assetsDir)) {
  if (!name.endsWith('.js')) continue;
  checkFile(path.join(assetsDir, name));
}

const indexHtml = path.join(distDir, 'index.html');
if (fs.existsSync(indexHtml)) {
  const html = fs.readFileSync(indexHtml, 'utf8');
  for (const m of html.matchAll(/(?:src|href)=["']\.\/assets\/([^"']+)["']/g)) {
    const target = path.join(assetsDir, m[1]);
    if (!fs.existsSync(target)) {
      missing.add(path.relative(root, target));
    }
  }
}

if (missing.size > 0) {
  console.error('[verify-dist-bundle-integrity] Missing referenced dist files:');
  for (const rel of [...missing].sort()) {
    console.error(`  - ${rel}`);
  }
  console.error('Try: remove dist/ and rebuild (npm run build). Close other Vite/Electron processes first.');
  process.exit(1);
}

console.log('[verify-dist-bundle-integrity] OK — all chunk references resolve');

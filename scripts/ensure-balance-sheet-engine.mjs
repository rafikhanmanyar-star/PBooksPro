/**
 * Bundles components/reports/balanceSheetEngine.ts → backend/dist/balanceSheetEngine.mjs
 * so the API can import the same logic as the desktop client without duplicating formulas.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const entry = path.join(root, 'components', 'reports', 'balanceSheetEngine.ts');
const out = path.join(root, 'backend', 'dist', 'balanceSheetEngine.mjs');

fs.mkdirSync(path.dirname(out), { recursive: true });

const esbuild = await import('esbuild');
esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
});
console.log('[ensure-balance-sheet-engine] OK →', out);

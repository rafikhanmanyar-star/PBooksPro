/**
 * Bundles components/reports/profitLossEngine.ts → backend/dist/profitLossEngine.mjs
 * for GET /api/reports/profit-loss (same logic as desktop).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from './load-esbuild.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const entry = path.join(root, 'components', 'reports', 'profitLossEngine.ts');
const out = path.join(root, 'backend', 'dist', 'profitLossEngine.mjs');

fs.mkdirSync(path.dirname(out), { recursive: true });

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
});
console.log('[ensure-profit-loss-engine] OK →', out);

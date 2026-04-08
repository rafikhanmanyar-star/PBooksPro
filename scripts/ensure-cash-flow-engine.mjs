/**
 * Bundles components/reports/cashFlowEngine.ts → backend/dist/cashFlowEngine.mjs
 * so GET /api/reports/cash-flow uses the same logic as the desktop report.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const entry = path.join(root, 'components', 'reports', 'cashFlowEngine.ts');
const out = path.join(root, 'backend', 'dist', 'cashFlowEngine.mjs');

fs.mkdirSync(path.dirname(out), { recursive: true });

const esbuild = await import('esbuild');
esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
});
console.log('[ensure-cash-flow-engine] OK →', out);

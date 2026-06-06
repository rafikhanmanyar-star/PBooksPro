/**
 * Bundles components/reports/ownerIncomeSummaryReportEngine.ts → backend/dist/ownerIncomeSummaryReportEngine.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const entry = path.join(root, 'components', 'reports', 'ownerIncomeSummaryReportEngine.ts');
const out = path.join(root, 'backend', 'dist', 'ownerIncomeSummaryReportEngine.mjs');

fs.mkdirSync(path.dirname(out), { recursive: true });

const esbuild = await import('esbuild');
esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
});
console.log('[ensure-owner-income-summary-engine] OK →', out);

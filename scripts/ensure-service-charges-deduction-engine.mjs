/**
 * Bundles components/reports/serviceChargesDeductionReportEngine.ts → backend/dist/serviceChargesDeductionReportEngine.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const entry = path.join(root, 'components', 'reports', 'serviceChargesDeductionReportEngine.ts');
const out = path.join(root, 'backend', 'dist', 'serviceChargesDeductionReportEngine.mjs');

fs.mkdirSync(path.dirname(out), { recursive: true });

const esbuild = await import('esbuild');
esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
});
console.log('[ensure-service-charges-deduction-engine] OK →', out);

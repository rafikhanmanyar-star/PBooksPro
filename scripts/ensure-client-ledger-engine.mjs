/**
 * Bundles components/reports/clientLedgerReportEngine.ts → backend/dist/clientLedgerReportEngine.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const entry = path.join(root, 'components', 'reports', 'clientLedgerReportEngine.ts');
const out = path.join(root, 'backend', 'dist', 'clientLedgerReportEngine.mjs');

fs.mkdirSync(path.dirname(out), { recursive: true });

const esbuild = await import('esbuild');
esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
});
console.log('[ensure-client-ledger-engine] OK →', out);

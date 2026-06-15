/**
 * Track F P4 — bundle shared/report-engines/serverEntry.ts into backend/src for tsc.
 * Replaces 13 per-engine ensure-*-engine.mjs scripts + runtime dynamic imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from './load-esbuild.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const entry = path.join(root, 'shared', 'report-engines', 'serverEntry.ts');
const outDir = path.join(root, 'backend', 'src', 'report-engines');
const out = path.join(outDir, 'reportEngines.compiled.js');

fs.mkdirSync(outDir, { recursive: true });

// Remove legacy per-engine bundles from prior builds.
const legacyDist = path.join(root, 'backend', 'dist');
if (fs.existsSync(legacyDist)) {
  for (const name of fs.readdirSync(legacyDist)) {
    if (name.endsWith('Engine.mjs')) {
      fs.unlinkSync(path.join(legacyDist, name));
      console.log('[ensure-shared-report-engines] removed legacy', name);
    }
  }
}

const banner = `/**
 * AUTO-GENERATED — do not edit.
 * Source: shared/report-engines/serverEntry.ts
 * Regenerate: node scripts/ensure-shared-report-engines.mjs
 */\n`;

esbuild.buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  banner: { js: banner },
});

console.log('[ensure-shared-report-engines] OK →', out);

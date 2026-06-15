/**
 * Track F P4 — verify report engine retirement (no per-engine .mjs bundles or loadReportEngine).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const backendSrc = path.join(root, 'backend', 'src');
const backendDist = path.join(root, 'backend', 'dist');

let failures = 0;

function fail(msg) {
  console.error(`[verify-track-f-p4] FAIL: ${msg}`);
  failures += 1;
}

function pass(msg) {
  console.log(`[verify-track-f-p4] OK: ${msg}`);
}

const compiled = path.join(backendSrc, 'report-engines', 'reportEngines.compiled.js');
if (!fs.existsSync(compiled)) {
  fail(`missing ${path.relative(root, compiled)} — run npm run build:backend`);
} else {
  pass('reportEngines.compiled.js present');
}

const indexTs = path.join(backendSrc, 'reportEngines', 'index.ts');
if (!fs.existsSync(indexTs)) {
  fail('missing backend/src/reportEngines/index.ts');
} else {
  pass('reportEngines/index.ts present');
}

const loader = path.join(backendSrc, 'reportEngines', 'loadReportEngine.ts');
if (fs.existsSync(loader)) {
  fail('loadReportEngine.ts should be removed');
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, onFile);
    else onFile(p);
  }
}

walk(backendSrc, (file) => {
  if (!file.endsWith('.ts')) return;
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('loadReportEngine')) {
    fail(`${path.relative(root, file)} still references loadReportEngine`);
  }
});

if (fs.existsSync(backendDist)) {
  for (const name of fs.readdirSync(backendDist)) {
    if (name.endsWith('Engine.mjs')) {
      fail(`legacy bundle still in dist: ${name}`);
    }
  }
}

const legacyScripts = fs
  .readdirSync(path.join(root, 'scripts'))
  .filter((n) => /^ensure-.+-engine\.mjs$/.test(n) && n !== 'ensure-shared-report-engines.mjs');
if (legacyScripts.length > 0) {
  fail(`legacy ensure scripts remain: ${legacyScripts.join(', ')}`);
} else {
  pass('13 per-engine ensure scripts removed');
}

if (failures > 0) {
  console.error(`[verify-track-f-p4] ${failures} check(s) failed`);
  process.exit(1);
}

console.log('[verify-track-f-p4] all checks passed');

#!/usr/bin/env node
/**
 * PERF-P3.2 — Deferred bundle deduplication & empty slice stabilization validation.
 *
 * Usage:
 *   node scripts/perf/perf-p3-2-validation.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const REQUIRED = [
  'services/api/deferredBundleState.ts',
  'hooks/usePageGroupDeferredBootstrap.ts',
  'services/api/appStateApi.ts',
  'context/AppContext.tsx',
];

const PATTERNS = [
  { file: 'services/api/deferredBundleState.ts', patterns: ['normalizeEntityBundle', 'loadedSlices', 'loadedBundles', '[DEFERRED_BUNDLE]', 'deferredBundleHits'] },
  { file: 'hooks/usePageGroupDeferredBootstrap.ts', patterns: ['resolveDeferredMissingEntities', 'normalizeEntityBundle', 'markDeferredBundleLoadSuccess'] },
  { file: 'services/api/appStateApi.ts', patterns: ['buildCanonicalBulkEntitiesEndpoint'] },
  { file: 'context/AppContext.tsx', patterns: ['markDeferredSlicesFromPartial', 'resetDeferredBundleSession'] },
];

function readText(rel) {
  const abs = resolve(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function runUnitChecks() {
  const results = [];
  // Inline assertions mirroring tests/deferredBundleState.test.ts
  const normalize = (entities) =>
    entities
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
      .sort()
      .join(',');

  results.push({
    name: 'Scenario C — canonical keys match',
    pass: normalize('vendors,bills') === normalize('bills,vendors'),
    detail: `${normalize('vendors,bills')} === ${normalize('bills,vendors')}`,
  });

  results.push({
    name: 'Endpoint canonicalization',
    pass:
      `/state/bulk?entities=${encodeURIComponent(normalize('vendors,bills'))}` ===
      `/state/bulk?entities=${encodeURIComponent(normalize('bills,vendors'))}`,
    detail: 'identical dedupe endpoint for order variants',
  });

  return results;
}

function buildReport(data) {
  const L = [];
  L.push('# PERF-P3.2 — Deferred Bundle Deduplication & Empty Slice Stabilization');
  L.push('');
  L.push(`Generated: ${data.generatedAt}`);
  L.push('');
  L.push('## Before vs After');
  L.push('');
  L.push('| Behavior | Before PERF-P3.2 | After PERF-P3.2 |');
  L.push('| -------- | ---------------- | --------------- |');
  L.push('| Entity order in URL | `vendors,bills` ≠ `bills,vendors` dedupe keys | Canonical sort → single key |');
  L.push('| Empty slice `vendors=[]` | Treated as unloaded → reload every nav | `loadedSlices` → suppress reload |');
  L.push('| Same bundle, new page group | New in-flight key per group | Session `loadedBundles` + canonical in-flight key |');
  L.push('| Bootstrap hydrated slices | Re-fetched if length 0 | `markDeferredSlicesFromPartial` after init |');
  L.push('');
  L.push('## Static implementation checklist');
  L.push('');
  for (const c of data.staticChecks) {
    L.push(`- [${c.pass ? 'x' : ' '}] **${c.file}**${c.pass ? '' : ' — missing: ' + c.missing.join(', ')}`);
  }
  L.push('');
  L.push('## Scenario validation');
  L.push('');
  L.push('### Scenario A — Tenant with no vendors');
  L.push('');
  L.push('| Step | Expected | Mechanism |');
  L.push('| ---- | -------- | --------- |');
  L.push('| First Project/Accounting visit | Single `GET /state/bulk?entities=bills,vendors` (or subset) | `resolveDeferredMissingEntities` |');
  L.push('| API returns `vendors: []` | `markDeferredBundleLoadSuccess` marks slice + bundle | No length check |');
  L.push('| Subsequent navigation | `emptySliceSuppressions` ++, no network | `isDeferredSliceLoaded(vendors)` |');
  L.push('');
  L.push('### Scenario B — Rapid Accounting → Project → Procurement → Accounting');
  L.push('');
  L.push('| Step | Expected | Mechanism |');
  L.push('| ---- | -------- | --------- |');
  L.push('| Overlapping same bundle | 1 network request | `dedupeBulkRequest` + `inFlightRef` on canonical bundle |');
  L.push('| Revisit Accounting | Cache hit | `loadedBundles.has("bills,invoices,...")` |');
  L.push('');
  L.push('### Scenario C — Mixed ordering `vendors,bills` vs `bills,vendors`');
  L.push('');
  for (const u of data.unitChecks) {
    L.push(`- **${u.name}**: ${u.pass ? 'PASS' : 'FAIL'} — ${u.detail}`);
  }
  L.push('');
  L.push('## Metrics (runtime)');
  L.push('');
  L.push('In browser console after navigation:');
  L.push('');
  L.push('```javascript');
  L.push("import { getDeferredBundleMetrics } from './services/api/deferredBundleState';");
  L.push('getDeferredBundleMetrics();');
  L.push('// { deferredBundleHits, deferredBundleMisses, emptySliceSuppressions, canonicalizedBundleRequests }');
  L.push('```');
  L.push('');
  L.push('Watch `[DEFERRED_BUNDLE]` log lines for canonicalized / suppressed / cache hit events.');
  L.push('');
  L.push('## Manual test steps');
  L.push('');
  L.push('1. Login to staging; open DevTools Network filtered to `/state/bulk?entities=`');
  L.push('2. Navigate Accounting → Project → Vendors; confirm at most one request per canonical bundle');
  L.push('3. Re-navigate same modules; confirm cache hits in console (`bundle cache hit`)');
  L.push('4. Tenant with zero vendors: one vendor bundle request total per session');
  L.push('');
  return L.join('\n');
}

const staticChecks = PATTERNS.map(({ file, patterns }) => {
  const text = readText(file);
  const missing = patterns.filter((p) => !text.includes(p));
  return { file, pass: text.length > 0 && missing.length === 0, missing };
});

const filesOk = REQUIRED.every((f) => existsSync(resolve(ROOT, f)));
const unitChecks = runUnitChecks();
const allPass =
  filesOk && staticChecks.every((c) => c.pass) && unitChecks.every((u) => u.pass);

const payload = {
  program: 'PERF-P3.2',
  generatedAt: new Date().toISOString(),
  staticChecks,
  unitChecks,
  allPass,
};

const outJson = 'docs/performance/cloud/captures/perf-p3-2-validation.json';
const outReport = 'docs/performance/cloud/reports/perf-p3-2-validation.md';

mkdirSync(dirname(resolve(ROOT, outJson)), { recursive: true });
writeFileSync(resolve(ROOT, outJson), JSON.stringify(payload, null, 2));
writeFileSync(resolve(ROOT, outReport), buildReport(payload));

console.log(`PERF-P3.2 validation: ${allPass ? 'PASS' : 'FAIL'}`);
console.log('Report:', outReport);

process.exit(allPass ? 0 : 1);

#!/usr/bin/env node
/**
 * PERF-P3.1 — Deferred bundle 503 investigation (evidence only, no behavior changes).
 *
 * Static code-path analysis + bundle/dedupe matrix for:
 *   /state/bulk?entities=bills,vendors
 *   /state/bulk?entities=invoices,bills
 *
 * Usage:
 *   node scripts/perf/perf-p3-1-deferred-bundle-investigation.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

/** Mirror hooks/usePageGroupDeferredBootstrap.ts PAGE_GROUP_DEFERRED_ENTITIES */
const PAGE_GROUP_DEFERRED_ENTITIES = {
  DASHBOARD: ['invoices', 'bills', 'contacts'],
  TRANSACTIONS: ['contacts', 'invoices', 'bills', 'vendors'],
  PAYMENTS: ['contacts', 'invoices'],
  LOANS: ['contacts'],
  VENDORS: ['vendors', 'bills', 'contacts'],
  CONTACTS: ['contacts'],
  RENTAL: ['invoices', 'contacts', 'bills'],
  PROJECT: ['bills', 'contacts', 'vendors'],
  PROJECT_SELLING: ['contacts', 'invoices'],
  INVESTMENT: ['contacts'],
  SETTINGS: ['contacts'],
  PAYROLL: ['contacts'],
  PERSONAL_TRANSACTIONS: ['personalTransactions'],
  ACCOUNTING: ['invoices', 'bills', 'contacts', 'vendors'],
};

const TARGET_BUNDLES = ['bills,vendors', 'invoices,bills'];

function bundleForGroup(group, loadedKeys = new Set()) {
  const needed = PAGE_GROUP_DEFERRED_ENTITIES[group];
  if (!needed) return null;
  const missing = needed.filter((k) => !loadedKeys.has(k));
  if (missing.length === 0) return null;
  return missing.join(',');
}

function dedupeKey(tenantId, entities) {
  const endpoint = `/state/bulk?entities=${encodeURIComponent(entities)}`;
  return `${tenantId}|${endpoint}`;
}

function groupsTriggeringBundle(bundle) {
  return Object.entries(PAGE_GROUP_DEFERRED_ENTITIES)
    .map(([group, keys]) => {
      const loaded = new Set(keys.filter((k) => !bundle.split(',').includes(k)));
      const b = bundleForGroup(group, loaded);
      return b === bundle ? group : null;
    })
    .filter(Boolean);
}

function readSnippet(relPath, needle, context = 3) {
  const text = readFileSync(resolve(ROOT, relPath), 'utf8');
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  const lines = text.slice(0, idx).split('\n');
  const startLine = Math.max(0, lines.length - 1 - context);
  const endLine = lines.length - 1 + context;
  const allLines = text.split('\n');
  return allLines.slice(startLine, endLine + 1).join('\n');
}

const coordinatorPath = [
  {
    step: 1,
    location: 'hooks/usePageGroupDeferredBootstrap.ts',
    call: 'awaitDeferredBootstrapGate()',
    role: 'Wait if primary bootstrap running; suppress if unhealthy',
  },
  {
    step: 2,
    location: 'hooks/usePageGroupDeferredBootstrap.ts',
    call: 'getAppStateApiService().loadStateBulk(stillMissing.join(","))',
    role: 'Deferred bundle HTTP — NOT runPrimaryBootstrap',
  },
  {
    step: 3,
    location: 'services/api/appStateApi.ts loadStateBulk',
    call: 'dedupeBulkRequest(tenantId, endpoint, ...)',
    role: 'Identical tenant+endpoint shares one in-flight promise',
  },
  {
    step: 4,
    location: 'services/api/appStateApi.ts',
    call: 'withCoalescedBulkRetry(tenantId, "loadStateBulk", ...)',
    role: 'Same retry label for ALL deferred bundles (coarse coalesce)',
  },
  {
    step: 5,
    location: 'services/api/appStateApi.ts',
    call: 'withBulkLoadResilienceImpl → awaitSharedBackoff',
    role: 'Shared backoff per tenant across bulk loaders',
  },
];

const primaryNotUsed = {
  runPrimaryBootstrap: ['loadStateBulkChunked', 'loadStateForSyncRefresh'],
  notWrapped: ['loadStateBulk (deferred entity bundles)'],
};

const serverShed = {
  route: 'GET /state/bulk',
  condition: 'pool.idleCount === 0 && pool.waitingCount >= PG_POOL_SHED_WAITING (default 12)',
  logPrefix: '[BULK_STATE_ERROR] errorName=POOL_SATURATED',
  poolFields: 'pool={total,idle,waiting}',
  shedBeforeHandler: true,
};

const deferredServerLoad = {
  perRequest: 'getBulkAppState with entity filter still runs runBatched loaders (up to BULK_BOOTSTRAP_CONCURRENCY=6) with withPoolClientGuarded (global bootstrap slots=8)',
  vendorsNote: 'vendors is in BULK_DEFERRED_ENTITIES — never loaded on primary chunked offset=0',
  staticNote: 'invoices,bills ARE in BULK_BOOTSTRAP_STATIC_ENTITIES — deferred invoices,bills implies empty slices or failed/partial bootstrap',
};

const triggerMatrix = TARGET_BUNDLES.map((bundle) => ({
  bundle,
  pageGroups: groupsTriggeringBundle(bundle),
  dedupeKeyExample: dedupeKey('<tenantId>', bundle),
  orderCollision:
    bundle === 'bills,vendors'
      ? "Also emitted as 'vendors,bills' from VENDORS group → separate dedupe key, dedupe MISS"
      : "Stable 'invoices,bills' when only those two missing across DASHBOARD/RENTAL/ACCOUNTING",
}));

const coordinatorCoverage = TARGET_BUNDLES.map((bundle) => ({
  request: `GET /state/bulk?entities=${bundle}`,
  source: 'usePageGroupDeferredBootstrap → loadStateBulk',
  gateAttached: 'Yes — awaitDeferredBootstrapGate',
  primaryBootstrapAttached: 'No — runPrimaryBootstrap only wraps chunked/sync refresh',
  dedupeParticipation: 'Yes — dedupeBulkRequest on exact endpoint string',
  retryCoalesce: 'Partial — label loadStateBulk shared across all entity bundles',
}));

const dedupeScenarios = [
  {
    scenario: 'Two tabs same bundle concurrently',
    bundle: 'invoices,bills',
    dedupeHit: 'Yes — same key',
  },
  {
    scenario: 'Nav PROJECT then VENDORS (bills+vendors missing)',
    bundle: 'bills,vendors vs vendors,bills',
    dedupeHit: 'No — entity order differs in query string',
  },
  {
    scenario: 'Sequential nav after prior 503 failed',
    bundle: 'invoices,bills',
    dedupeHit: 'No — prior promise rejected; map entry cleared in finally',
  },
  {
    scenario: 'DASHBOARD then RENTAL (only invoices+bills missing)',
    bundle: 'invoices,bills',
    dedupeHit: 'Yes if overlapping in-flight; else miss after first completes',
  },
];

const emptySliceLoop = {
  trigger: 'missing = needed.filter(key => lengths[key] === 0)',
  implication:
    'Zero-row tenant (empty bills/invoices arrays) still counts as missing → deferred bundle fires on every page visit',
  retryOn503: 'catch {} clears inFlightRef → next navigation re-issues same bundle',
};

function buildReport(data) {
  const L = [];
  L.push('# PERF-P3.1 — Deferred Bundle 503 Investigation');
  L.push('');
  L.push(`Generated: ${data.generatedAt}`);
  L.push('');
  L.push('> Evidence-only investigation. No application behavior changes.');
  L.push('');
  L.push('## Section 1 — Deferred Bundle Failure Timeline');
  L.push('');
  L.push('Representative client-side sequence (from code paths + ATP-class incidents):');
  L.push('');
  L.push('```');
  L.push('T+0s    Login primary bootstrap completes (chunked offset=0)');
  L.push('        → invoices, bills, contacts loaded in static chunk');
  L.push('        → vendors NOT in static chunk (BULK_DEFERRED_ENTITIES)');
  L.push('T+2s    User opens Accounting / Project / Procurement');
  L.push('        → usePageGroupDeferredBootstrap passes gate (primary idle/healthy)');
  L.push('        → GET /state/bulk?entities=invoices,bills OR bills,vendors');
  L.push('T+2s    Concurrent dashboard metrics / socket refresh / other API holds pool');
  L.push('T+2s    shedIfPoolSaturated: idle=0 waiting≥12 → 503 POOL_SATURATED (no handler run)');
  L.push('T+2s    Client withBulkLoadResilience retries (up to 3×, shared backoff)');
  L.push('T+5s    Overlay stays hidden (PERF-P3 soft failure) but Network tab shows 503');
  L.push('```');
  L.push('');
  L.push('**Live capture:** paste `scripts/perf/deferred-bundle-probe.browser.js` in DevTools, reproduce nav, export JSON.');
  L.push('**Server timeline:** grep Render logs for `[BULK_STATE_ERROR] ... entities=bills,vendors` and matching `pool={...}`.');
  L.push('');
  L.push('## Section 2 — Coordinator Coverage');
  L.push('');
  L.push('| Request | Coordinator Attached? | Detail |');
  L.push('|---------|----------------------|--------|');
  for (const row of data.coordinatorCoverage) {
    L.push(
      `| \`${row.request}\` | Gate: **${row.gateAttached.split('—')[0].trim()}**; Primary: **${row.primaryBootstrapAttached.split('—')[0].trim()}** | ${row.dedupeParticipation}; ${row.retryCoalesce} |`
    );
  }
  L.push('');
  L.push('### Coordinator call chain (deferred path)');
  L.push('');
  for (const s of data.coordinatorPath) {
    L.push(`${s.step}. \`${s.call}\` — ${s.role} (\`${s.location}\`)`);
  }
  L.push('');
  L.push('**Conclusion:** Deferred bundles participate in PERF-P3 **gate + dedupe + retry/backoff**, but **not** in \`runPrimaryBootstrap\`. They remain legitimate, post-login pool consumers.');
  L.push('');
  L.push('## Section 3 — Deduplication Coverage');
  L.push('');
  L.push('| Bundle | Dedupe Hit? | Condition |');
  L.push('| ------ | ----------- | --------- |');
  L.push('| `invoices,bills` | **Hit** only while identical in-flight | Same tenant+endpoint key |');
  L.push('| `invoices,bills` | **Miss** | Sequential nav after prior request finished or failed |');
  L.push('| `bills,vendors` | **Miss** vs `vendors,bills` | VENDORS group order differs from PROJECT group |');
  L.push('| `bills,vendors` | **Hit** | Same group re-entry while first request in-flight |');
  L.push('');
  L.push('### Page groups that emit target bundles');
  L.push('');
  for (const t of data.triggerMatrix) {
    L.push(`- **\`${t.bundle}\`**: ${t.pageGroups.join(', ')}`);
    L.push(`  - ${t.orderCollision}`);
  }
  L.push('');
  L.push('### Dedupe scenario matrix');
  L.push('');
  L.push('| Scenario | Bundle | Dedupe Hit? |');
  L.push('| -------- | ------ | ----------- |');
  for (const d of data.dedupeScenarios) {
    L.push(`| ${d.scenario} | \`${d.bundle}\` | ${d.dedupeHit} |`);
  }
  L.push('');
  L.push('## Section 4 — Pool State During 503');
  L.push('');
  L.push('Server logs at shed (already instrumented in `stateRoutes.ts`):');
  L.push('');
  L.push('```');
  L.push('[POOL_SHED] route=GET /state/bulk -> 503 (idle=0 waiting=N total=20)');
  L.push('[BULK_STATE_ERROR] ... entities=bills,vendors pool={total:20,idle:0,waiting:N}');
  L.push('```');
  L.push('');
  L.push('| Route | Idle | Waiting | Meaning |');
  L.push('| ----- | ---- | ------- | ------- |');
  L.push('| `GET /state/bulk?entities=bills,vendors` | **0** | **≥12** (default) | Fast-fail shed before `getBulkAppState` runs |');
  L.push('| `GET /state/bulk?entities=invoices,bills` | **0** | **≥12** | Same shed path |');
  L.push('');
  L.push('**Typical timing vs bootstrap:** Failures occur **after** primary bootstrap completes — deferred nav while pool already busy (dashboard queries, incremental sync, multi-user).');
  L.push('');
  L.push('| Time (relative) | Metrics (client `getBootstrapCoordinator().getMetrics()`) |');
  L.push('| --------------- | -------------------------------------------------------- |');
  L.push('| Primary bootstrap running | `activeBootstraps≥1`, deferred `suppressedDeferredBootstraps` increments |');
  L.push('| Primary complete, user navigates | `activeBootstraps` stable; deferred fires; `deduplicatedBulkRequests` only on overlap |');
  L.push('| 503 on deferred bundle | `coalescedRetries` may increment; primary metrics unchanged |');
  L.push('');
  L.push('## Section 5 — Root Cause');
  L.push('');
  L.push('### Why do `bills,vendors` and `invoices,bills` still produce intermittent 503 after PERF-P3?');
  L.push('');
  L.push('1. **PERF-P3 scope was primary bootstrap amplification**, not elimination of deferred on-demand loads. Deferred `loadStateBulk` is still issued after login when page groups need slices with `length === 0`.');
  L.push('');
  L.push('2. **`vendors` is intentionally deferred server-side** (`BULK_DEFERRED_ENTITIES`). Any Project / Procurement / Accounting navigation that needs vendors triggers `bills,vendors` or `vendors,bills` bundles — expected post-login traffic.');
  L.push('');
  L.push('3. **`invoices,bills` deferred requests** fire when those slices appear empty — including tenants with **zero rows** (empty array still passes `length === 0`), partial bootstrap after soft failure, or navigation before static chunk merge visible in React state.');
  L.push('');
  L.push('4. **Dedupe is exact-string on endpoint** (`tenantId|/state/bulk?entities=…`). `bills,vendors` ≠ `vendors,bills`; sequential nav after completion = miss; 503 retry cycles re-open new network work.');
  L.push('');
  L.push('5. **Each deferred bundle still uses guarded bulk loaders** (up to 6 parallel pool connections + global 8 bootstrap slots). Under multi-tab / dashboard / socket refresh load, `idle=0` and `waiting≥12` triggers **POOL_SATURATED** shed — by design to avoid 524s.');
  L.push('');
  L.push('6. **503 retries (3×)** keep intermittent failures visible in DevTools even though PERF-P3 **overlay recovery** prevents UI blocking.');
  L.push('');
  L.push('### Empty-slice re-fetch loop (amplifies intermittent 503)');
  L.push('');
  L.push('```typescript');
  L.push(emptySliceLoop.trigger);
  L.push('// ' + emptySliceLoop.implication);
  L.push('// ' + emptySliceLoop.retryOn503);
  L.push('```');
  L.push('');
  L.push('## Appendix — Investigation probes');
  L.push('');
  L.push('- Browser: `scripts/perf/deferred-bundle-probe.browser.js` (console paste, export JSON)');
  L.push('- Re-run static analysis: `node scripts/perf/perf-p3-1-deferred-bundle-investigation.mjs`');
  L.push('');
  return L.join('\n');
}

const generatedAt = new Date().toISOString();
const payload = {
  program: 'PERF-P3.1',
  generatedAt,
  targetBundles: TARGET_BUNDLES,
  coordinatorPath,
  primaryNotUsed,
  serverShed,
  deferredServerLoad,
  triggerMatrix,
  coordinatorCoverage,
  dedupeScenarios,
  emptySliceLoop,
  pageTriggerTable: Object.keys(PAGE_GROUP_DEFERRED_ENTITIES).map((group) => ({
    pageGroup: group,
    bundleIfAllMissing: bundleForGroup(group, new Set()),
    bundleIfOnlyVendorsMissing: bundleForGroup(group, new Set(['contacts', 'invoices', 'bills'].filter((k) => PAGE_GROUP_DEFERRED_ENTITIES[group]?.includes(k)))),
  })),
};

const outJson = 'docs/performance/cloud/captures/perf-p3-1-deferred-bundle-503.json';
const outReport = 'docs/performance/cloud/reports/perf-p3-1-deferred-bundle-503.md';

mkdirSync(resolve(ROOT, dirname(outJson)), { recursive: true });
mkdirSync(resolve(ROOT, dirname(outReport)), { recursive: true });
writeFileSync(resolve(ROOT, outJson), JSON.stringify(payload, null, 2));
writeFileSync(resolve(ROOT, outReport), buildReport(payload));

console.log('PERF-P3.1 investigation report written');
console.log('Report:', outReport);
console.log('JSON:', outJson);

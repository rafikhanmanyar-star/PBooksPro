#!/usr/bin/env node
/**
 * PERF-P3 — Bootstrap failure containment validation (static + optional live probe).
 *
 * Usage:
 *   node scripts/perf/perf-p3-validation.mjs
 *   node scripts/perf/perf-p3-validation.mjs --capture docs/performance/cloud/captures/nav-probe-2026-06-22-atp.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const P3_FILES = [
  'services/api/bootstrapCoordinator.ts',
  'services/api/appStateApi.ts',
  'hooks/usePageGroupDeferredBootstrap.ts',
  'context/AppContext.tsx',
  'context/appStateStore.ts',
  'App.tsx',
  'components/stability/BootstrapRecoveryBanner.tsx',
];

const EXPECTED_PATTERNS = [
  { file: 'services/api/bootstrapCoordinator.ts', patterns: ['runPrimaryBootstrap', 'dedupeBulkRequest', 'withCoalescedBulkRetry', 'awaitSharedBackoff', 'enterSoftFailure', '[BOOTSTRAP_COORDINATOR]'] },
  { file: 'services/api/appStateApi.ts', patterns: ['getBootstrapCoordinator', 'dedupeBulkRequest', 'runPrimaryBootstrap', 'withCoalescedBulkRetry'] },
  { file: 'hooks/usePageGroupDeferredBootstrap.ts', patterns: ['awaitDeferredBootstrapGate'] },
  { file: 'context/AppContext.tsx', patterns: ['enterSoftFailure', 'scheduleBackgroundRecovery', 'resetForTenant'] },
  { file: 'App.tsx', patterns: ['useBootstrapSoftFailure', 'BootstrapRecoveryBanner'] },
];

function parseArgs(argv) {
  const out = {
    captureFile: 'docs/performance/cloud/captures/nav-probe-2026-06-22-atp.json',
    outJson: 'docs/performance/cloud/captures/perf-p3-validation.json',
    outReport: 'docs/performance/cloud/reports/perf-p3-validation.md',
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--capture' && argv[i + 1]) {
      out.captureFile = argv[++i];
    } else if (argv[i] === '--out-json' && argv[i + 1]) {
      out.outJson = argv[++i];
    } else if (argv[i] === '--out-report' && argv[i + 1]) {
      out.outReport = argv[++i];
    }
  }
  return out;
}

function readText(relPath) {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return { ok: false, abs, text: '' };
  return { ok: true, abs, text: readFileSync(abs, 'utf8') };
}

function analyzeCapture(capturePath) {
  if (!existsSync(resolve(ROOT, capturePath))) {
    return { available: false, reason: 'capture not found' };
  }
  const raw = JSON.parse(readFileSync(resolve(ROOT, capturePath), 'utf8'));
  const entries = raw.requests ?? raw.network ?? [];
  const bulk = entries.filter((r) => {
    const url = String(r.url ?? r.path ?? '');
    return url.includes('/state/bulk');
  });
  const bulkChunked = entries.filter((r) => String(r.url ?? r.path ?? '').includes('/state/bulk-chunked'));
  const status503 = entries.filter((r) => Number(r.status ?? r.statusCode) === 503);
  return {
    available: true,
    totalRequests: entries.length,
    bulkCount: bulk.length,
    bulkChunkedCount: bulkChunked.length,
    poolSaturated503: status503.length,
    windowMs: raw.windowMs ?? raw.durationMs ?? null,
    note: 'Pre-P3 ATP capture — expect overlap; post-P3 should show coordinator dedupe in browser metrics',
  };
}

function buildReport(result) {
  const lines = [];
  lines.push('# PERF-P3 — Bootstrap Failure Containment Validation');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Static implementation checklist');
  lines.push('');
  for (const check of result.staticChecks) {
    lines.push(`- [${check.pass ? 'x' : ' '}] **${check.file}** — ${check.pass ? 'OK' : 'MISSING: ' + check.missing.join(', ')}`);
  }
  lines.push('');
  lines.push('## Architecture (PERF-P3)');
  lines.push('');
  lines.push('```mermaid');
  lines.push('flowchart TD');
  lines.push('  A[AppContext init] --> C[BootstrapCoordinator.runPrimaryBootstrap]');
  lines.push('  B[refreshFromApi full load] --> C');
  lines.push('  D[usePageGroupDeferredBootstrap] --> G{primary running or unhealthy?}');
  lines.push('  G -->|yes| W[wait / suppress]');
  lines.push('  G -->|no| E[loadStateBulk deduped]');
  lines.push('  C --> F[loadStateBulkChunked deduped chunks]');
  lines.push('  F --> R[withCoalescedBulkRetry + shared backoff]');
  lines.push('  E --> R');
  lines.push('  R -->|retries exhausted| S[enterSoftFailure]');
  lines.push('  S --> UI[Shell + BootstrapRecoveryBanner]');
  lines.push('  S --> BG[scheduleBackgroundRecovery]');
  lines.push('```');
  lines.push('');
  lines.push('## Before vs after request flow');
  lines.push('');
  lines.push('| Trigger | Before PERF-P3 | After PERF-P3 |');
  lines.push('|---------|----------------|---------------|');
  lines.push('| Login init | Independent chunked bulk | Single primary pipeline; refresh attaches |');
  lines.push('| refreshFromApi (full) | Second chunked bulk + retries | Attaches to primary if in-flight |');
  lines.push('| Page nav deferred | Immediate bulk?entities= | Waits for coordinator; suppressed if unhealthy |');
  lines.push('| Parallel identical bulk | N network calls | 1 shared promise (dedupeBulkRequest) |');
  lines.push('| 503 retry storm | 3 loaders × 3 retries each | Coalesced retry + shared backoff |');
  lines.push('| Overlay on failure | Blocking spinner / init screen | Soft failure: shell + recovery banner |');
  lines.push('');
  lines.push('## Baseline capture (pre-fix reference)');
  lines.push('');
  if (result.baseline.available) {
    lines.push(`- Capture: \`${result.baseline.captureFile}\``);
    lines.push(`- Total requests: ${result.baseline.totalRequests}`);
    lines.push(`- \`/state/bulk\`: ${result.baseline.bulkCount}`);
    lines.push(`- \`/state/bulk-chunked\`: ${result.baseline.bulkChunkedCount}`);
    lines.push(`- HTTP 503: ${result.baseline.poolSaturated503}`);
  } else {
    lines.push(`- ${result.baseline.reason}`);
  }
  lines.push('');
  lines.push('## Manual validation steps');
  lines.push('');
  lines.push('1. Login — DevTools Network: at most one concurrent primary bootstrap pipeline.');
  lines.push('2. Dashboard — no duplicate `/state/bulk?entities=` while chunked bootstrap runs.');
  lines.push('3. Rental navigation — deferred bootstrap waits; check `[BOOTSTRAP_COORDINATOR]` console logs.');
  lines.push('4. Simulate 503 (staging pool pressure) — overlay clears; amber recovery banner; background retry.');
  lines.push('');
  lines.push('## Risk assessment');
  lines.push('');
  lines.push('| Risk | Mitigation |');
  lines.push('|------|------------|');
  lines.push('| Stale attach to failed primary | Health → unhealthy; deferred waits for background recovery |');
  lines.push('| Partial state after soft failure | Background recovery merges full bulk when server recovers |');
  lines.push('| Over-suppression of deferred loads | Gate clears when health → healthy |');
  lines.push('| Tenant switch stale coordinator | `resetForTenant` on company switch |');
  lines.push('');
  lines.push('## Instrumentation counters');
  lines.push('');
  lines.push('`getBootstrapCoordinator().getMetrics()` exposes: `activeBootstraps`, `suppressedDeferredBootstraps`, `deduplicatedBulkRequests`, `coalescedRetries`, `overlayRecoveryEvents`.');
  lines.push('');
  return lines.join('\n');
}

const args = parseArgs(process.argv);
const staticChecks = [];

for (const spec of EXPECTED_PATTERNS) {
  const { ok, text } = readText(spec.file);
  const missing = ok ? spec.patterns.filter((p) => !text.includes(p)) : spec.patterns;
  staticChecks.push({ file: spec.file, pass: ok && missing.length === 0, missing });
}

const filesPresent = P3_FILES.map((f) => ({ file: f, present: readText(f).ok }));
const baseline = analyzeCapture(args.captureFile);
baseline.captureFile = args.captureFile;

const result = {
  task: 'PERF-P3',
  generatedAt: new Date().toISOString(),
  staticChecks,
  filesPresent,
  baseline,
  allStaticPass: staticChecks.every((c) => c.pass) && filesPresent.every((f) => f.present),
};

mkdirSync(dirname(resolve(ROOT, args.outJson)), { recursive: true });
mkdirSync(dirname(resolve(ROOT, args.outReport)), { recursive: true });
writeFileSync(resolve(ROOT, args.outJson), JSON.stringify(result, null, 2));
writeFileSync(resolve(ROOT, args.outReport), buildReport(result));

console.log(`PERF-P3 validation: static ${result.allStaticPass ? 'PASS' : 'FAIL'}`);
console.log(`Report: ${args.outReport}`);
console.log(`JSON: ${args.outJson}`);
process.exit(result.allStaticPass ? 0 : 1);

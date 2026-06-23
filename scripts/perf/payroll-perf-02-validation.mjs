#!/usr/bin/env node
/**
 * PAYROLL-PERF-02 validation notes — static + manual measurement checklist.
 *
 * Usage: node scripts/perf/payroll-perf-02-validation.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const out = 'docs/performance/cloud/reports/payroll-perf-02-validation.md';

const body = `# PAYROLL-PERF-02 — Safe Payroll Sync Remediation Validation

## Changes

| Part | Change |
| ---- | ------ |
| 1 | Removed \`PayrollDashboard\` sync; Hub owns initial sync |
| 2 | \`payrollSyncCoordinator\` dedupes in-flight sync per tenant |
| 3 | \`EmployeeList\` cache-first + background refresh when stale |
| 4 | \`PaymentHistory\` skips full sync when \`lastSyncedAt\` < 5 min |
| 5 | \`[PAYROLL_SYNC]\` logs + metrics on coordinator |

## Manual validation (DevTools Network)

Filter: \`/payroll/\`

### Payroll landing (Dashboard tab)

| Check | Before (PERF-01) | After (expected) |
| ----- | ---------------- | ---------------- |
| Full sync count on first open | 2 parallel | **1** |
| Console | — | \`[PAYROLL_SYNC] start { source: 'payroll-hub' }\` once |

### Employees tab

| Check | Before | After (expected) |
| ----- | ------ | ---------------- |
| Blocks on GET /employees | Yes | **No** — renders cache immediately |
| GET /employees when cache fresh (<5 min) | Always | **Skipped** (cache hit log) |
| Second visit | Re-fetch | **Instant** from cache |

### Payment History tab

| Check | Before | After (expected) |
| ----- | ------ | ---------------- |
| Full sync every tab switch | Yes | **Skipped** if synced < 5 min ago |
| Console on repeat visit | \`start\` × N | \`skip_fresh\` or \`cache_hit\` |

## Metrics (browser console)

After exercising payroll flows, inspect coordinator metrics via app devtools or temporary log of \`getPayrollSyncCoordinator().getMetrics()\`.

## Unit tests

\`\`\`powershell
npx tsx --test tests/payrollSyncCoordinator.test.ts
\`\`\`
`;

mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
writeFileSync(resolve(ROOT, out), body);
console.log('Wrote', out);

#!/usr/bin/env node
/**
 * PAYROLL-PERF-03A validation report generator.
 *
 * Usage: node scripts/perf/payroll-perf-03a-validation.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const out = 'docs/performance/cloud/reports/payroll-perf-03a-validation.md';

const body = `# PAYROLL-PERF-03A — Payroll Audit Log Cache Validation

## Files changed

| File | Role |
| ---- | ---- |
| \`components/payroll/services/payrollAuditCache.ts\` | Tenant cache, TTL, metrics, \`[PAYROLL_AUDIT]\` logs |
| \`components/payroll/PayrollAuditLog.tsx\` | Cache-first render, client-side action filter |
| \`tests/payrollAuditCache.test.ts\` | Unit tests |
| \`scripts/perf/payroll-perf-03a-validation.mjs\` | This report |

## Cache design

| Key | Content |
| --- | ------- |
| \`payroll_audit_cache_{tenantId}\` | JSON array of audit events (limit 200, module=payroll) |
| \`payroll_audit_last_loaded_{tenantId}\` | Epoch ms of last successful API load |

In-memory mirror per session for fast reads. TTL = **5 minutes** (\`AUDIT_CACHE_TTL_MS\`).

Action filters apply **client-side** against cached full list — no extra API on filter change.

## Before vs After (network)

| Scenario | Before | After |
| -------- | ------ | ----- |
| A — First open Audit Log | \`GET /audit/events?module=payroll&limit=200\` | Same (once) + cache write |
| B — Leave & return < 5 min | **New GET every visit** | **No GET** — \`[PAYROLL_AUDIT] cache_hit\` |
| C — Return after TTL | New GET blocks UI | Cached rows instant + \`background_refresh\` |
| Change action filter | New GET with \`action=\` param | Client filter only |

## Manual validation (DevTools)

1. Filter Network: \`/audit/events\`
2. Open Payroll → Audit Log → note **one** GET
3. Switch to another tab, return within 5 min → **zero** new GET
4. Console: \`[PAYROLL_AUDIT] cache_hit age=…\`
5. Click Refresh → one forced GET (\`force: true\`)

## Metrics

\`\`\`js
import { getPayrollAuditCacheMetrics } from './components/payroll/services/payrollAuditCache';
getPayrollAuditCacheMetrics();
// { auditCacheHits, auditCacheMisses, auditCacheStale, auditBackgroundRefreshes }
\`\`\`

## Unit tests

\`\`\`powershell
npx tsx --test tests/payrollAuditCache.test.ts
\`\`\`

## Success criteria

| Check | Expected |
| ----- | -------- |
| Scenario A | Single API on first load |
| Scenario B | Instant render, no API |
| Scenario C | Instant cached render + background API |
| Session reuse | Matches Payment History freshness pattern |
`;

mkdirSync(dirname(resolve(ROOT, out)), { recursive: true });
writeFileSync(resolve(ROOT, out), body);
console.log('Wrote', out);

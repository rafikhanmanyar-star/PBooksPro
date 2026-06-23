#!/usr/bin/env node
/**
 * PAYROLL-PERF-01 — syncPayrollFromServer amplification audit (evidence only).
 *
 * Usage:
 *   node scripts/perf/payroll-perf-01-sync-audit.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function read(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

const SYNC_CALLERS = [
  { file: 'components/payroll/PayrollHub.tsx', line: '~1046', trigger: 'useEffect([tenantId]) on hub mount', scope: 'full sync' },
  { file: 'components/payroll/PayrollDashboard.tsx', line: '~30', trigger: 'useEffect([tenantId]) when Dashboard tab mounted', scope: 'full sync (duplicate with hub on landing)' },
  { file: 'components/payroll/PaymentHistory.tsx', line: '~70,81', trigger: 'useEffect when activeSubTab===history', scope: 'full sync ×1–2 per tab visit' },
  { file: 'components/payroll/PayslipsPage.tsx', line: '~17', trigger: 'useEffect([tenantId])', scope: 'full sync per Payslips tab mount' },
  { file: 'components/payroll/PayrollSettingsPage.tsx', line: '~83', trigger: 'settings load path', scope: 'full sync' },
  { file: 'components/payroll/PayrollReport.tsx', line: '~54', trigger: 'report mount', scope: 'full sync' },
  { file: 'components/payroll/PayrollHub.tsx', line: '~420', trigger: 'onAfterMutation (approval flow)', scope: 'full sync after mutation' },
  { file: 'components/payroll/modals/*.tsx', line: 'various', trigger: 'post pay/edit/void', scope: 'full or runIds-scoped sync' },
];

const SYNC_API_PHASE1 = [
  { method: 'GET', path: '/payroll/employees', storeKey: 'employees' },
  { method: 'GET', path: '/payroll/runs', storeKey: 'payroll_runs' },
  { method: 'GET', path: '/payroll/departments', storeKey: 'departments' },
  { method: 'GET', path: '/payroll/grades', storeKey: 'grade_levels' },
  { method: 'GET', path: '/payroll/earning-types', storeKey: 'earning_types' },
  { method: 'GET', path: '/payroll/deduction-types', storeKey: 'deduction_types' },
];

const SYNC_API_PHASE2 = {
  method: 'GET',
  path: '/payroll/runs/{runId}/payslips',
  per: 'each payroll run returned in phase 1',
  sequential: true,
  storeKey: 'payslips (full replace)',
};

function buildReport() {
  const L = [];
  const ts = new Date().toISOString();

  L.push('# PAYROLL-PERF-01 — Payroll Sync Amplification Audit');
  L.push('');
  L.push(`Generated: ${ts}`);
  L.push('');
  L.push('> Evidence-only audit from static code analysis. No behavior changes.');
  L.push('');
  L.push('## Section 1 — syncPayrollFromServer Call Graph');
  L.push('');
  L.push('```');
  L.push('Payroll page (currentPage=payroll, PayrollHub mounted)');
  L.push('  │');
  L.push('  ├─ [A] PayrollHub useEffect([tenantId])');
  L.push('  ├─ [B] Active sub-tab may add another sync (see below)');
  L.push('  │');
  L.push('  └─ syncPayrollFromServer(tenantId, options?)');
  L.push('       ├─ storageService.init(tenantId)');
  L.push('       ├─ Promise.all (6 parallel API calls)');
  L.push('       │    GET /payroll/employees');
  L.push('       │    GET /payroll/runs');
  L.push('       │    GET /payroll/departments');
  L.push('       │    GET /payroll/grades');
  L.push('       │    GET /payroll/earning-types');
  L.push('       │    GET /payroll/deduction-types');
  L.push('       ├─ normalizeEmployee / normalizePayrollRun / set* → localStorage');
  L.push('       ├─ FOR EACH run in runsNorm (sequential loop, not parallel):');
  L.push('       │    GET /payroll/runs/{runId}/payslips');
  L.push('       │    normalizePayslip → accumulate allPayslips');
  L.push('       ├─ storageService.setPayslips(tenantId, allPayslips)  // full replace');
  L.push('       └─ dispatch pbooks-payroll-storage-updated');
  L.push('            └─ PayrollHub listeners → setPayrollStorageRevision');
  L.push('                 └─ heavy useMemo recomputes (transactions × payslips)');
  L.push('```');
  L.push('');
  L.push('**Alternate path:** `options.runIds` → only re-fetch payslips for listed runs (BulkPayPayslipsModal); still runs phase-1 parallel fetch unless caller changed.');
  L.push('');
  L.push('### All syncPayrollFromServer call sites');
  L.push('');
  L.push('| File | Trigger | Scope |');
  L.push('| ---- | ------- | ----- |');
  for (const c of SYNC_CALLERS) {
    L.push(`| \`${c.file}\` | ${c.trigger} | ${c.scope} |`);
  }
  L.push('');
  L.push('## Section 2 — Payroll Data Volume Analysis');
  L.push('');
  L.push('Live row counts require tenant-specific measurement (DevTools Network or API). **Code-derived volume model:**');
  L.push('');
  L.push('| Endpoint | Rows / calls | Payload driver |');
  L.push('| -------- | ------------ | -------------- |');
  L.push('| `GET /payroll/employees` | N employees | O(N) — small when N=0 |');
  L.push('| `GET /payroll/runs` | R runs | O(R) — **still fetched when N=0** |');
  L.push('| `GET /payroll/runs/{id}/payslips` | **R sequential calls** | O(sum of payslips) — **dominant** |');
  L.push('| `GET /payroll/departments` | ~few | small |');
  L.push('| `GET /payroll/grades` | ~few | small |');
  L.push('| `GET /payroll/earning-types` | ~few | small |');
  L.push('| `GET /payroll/deduction-types` | ~few | small |');
  L.push('| `GET /audit/events?module=payroll` | up to 200 | Audit tab only — not part of sync |');
  L.push('| `GET /payroll/employees` (EmployeeList) | N again | **duplicate** of sync phase-1 |');
  L.push('');
  L.push('**Zero employees does not skip payslip hydration.** Historical runs/payslips still drive R+1 network round-trips and large localStorage writes.');
  L.push('');
  L.push('### Measurement procedure (live)');
  L.push('');
  L.push('1. DevTools → Network, filter `/payroll/`');
  L.push('2. Open Payroll (note parallel duplicate syncs)');
  L.push('3. Record counts: runs list length, payslip responses, total transfer size, waterfall end time');
  L.push('');
  L.push('## Section 3 — Page Dependency Matrix');
  L.push('');
  L.push('### Employee page (Workforce tab → EmployeeList)');
  L.push('');
  L.push('| Data | Required for UI? | Fetched by sync? | Fetched elsewhere? |');
  L.push('| ---- | ---------------- | ---------------- | ------------------ |');
  L.push('| employees | **Yes** | Yes (phase 1) | **Yes again** — `EmployeeList` → `payrollApi.getEmployees()` |');
  L.push('| payroll runs | No (list view) | Yes | — |');
  L.push('| payslips | No (list view) | Yes (all runs) | — |');
  L.push('| payments / GL tx | No (list view) | No | Hub subscribes to AppState `transactions` globally |');
  L.push('| audit events | No | No | — |');
  L.push('| departments/grades/types | No (list view) | Yes | — |');
  L.push('');
  L.push('**Over-fetch:** full sync including all payslips before EmployeeList can render from cache.');
  L.push('');
  L.push('### Payment History tab');
  L.push('');
  L.push('| Data | Required? | Source |');
  L.push('| ---- | --------- | ------ |');
  L.push('| PAID payroll runs | **Yes** | `storageService.getPayrollRuns` filtered client-side |');
  L.push('| payslips | Indirect (amounts on runs) | Already in cache after sync |');
  L.push('| employees | No | — |');
  L.push('| audit | No | — |');
  L.push('');
  L.push('**Over-fetch:** runs `syncPayrollFromServer` **again** on every history tab activation, plus sequential `deletePayrollRun` for empty PAID runs, then optional **second** full sync.');
  L.push('');
  L.push('### Audit Log tab');
  L.push('');
  L.push('| Data | Required? | Source |');
  L.push('| ---- | --------- | ------ |');
  L.push('| audit events | **Yes** | `GET /audit/events?module=payroll&limit=200` |');
  L.push('| employees/runs/payslips | **No** | Not used by PayrollAuditLog |');
  L.push('');
  L.push('**Over-fetch:** none from sync; slowness = audit API + pool queue, not syncPayrollFromServer.');
  L.push('');
  L.push('## Section 4 — Duplicate Sync Report');
  L.push('');
  L.push('Derived from mount/effect structure (same session, API mode):');
  L.push('');
  L.push('| User action | syncPayrollFromServer executions | Notes |');
  L.push('| ----------- | ------------------------------ | ----- |');
  L.push('| Open Payroll (default Dashboard tab) | **2** | Hub `[tenantId]` + PayrollDashboard `[tenantId]` **in parallel** |');
  L.push('| Switch to Employees tab | **0** (sync) + **1× getEmployees** | EmployeeList remount blocks UI until fetch completes |');
  L.push('| Switch to Payment History | **1–2** | PaymentHistory effect; +1 if empty PAID runs deleted |');
  L.push('| Switch to Audit Log | **0** | Audit uses `/audit/events` only |');
  L.push('| Revisit Employees tab (same session) | **0** sync + **1× getEmployees** | Tab unmount/remount |');
  L.push('| Revisit Payment History | **1–2** again | No staleness guard on `activeSubTab` |');
  L.push('');
  L.push('**Why second Payroll visit may not feel faster:** Hub persists in DOM (`renderPersistentPage`) so hub `[tenantId]` sync runs once per session — but **tab switches** (History, Payslips, Dashboard) each attach **new** full syncs. EmployeeList **always** re-fetches employees on workforce remount.');
  L.push('');
  L.push('## Section 5 — Cache Reuse Opportunities');
  L.push('');
  L.push('Payroll cache = **tenant-scoped localStorage** via `storageService` (employees, runs, payslips, departments, grades, types).');
  L.push('');
  L.push('| Page | Cache populated after first sync? | Reused without network? | Gap |');
  L.push('| ---- | -------------------------------- | ----------------------- | --- |');
  L.push('| Employee | Yes | **Partially** — data in localStorage but EmployeeList **ignores cache** and awaits API | Blocks on redundant GET |');
  L.push('| Payment History | Yes | **Could** read runs from cache | Effect **always** calls full sync first |');
  L.push('| Audit Log | N/A | N/A | Does not use payroll cache |');
  L.push('');
  L.push('No TTL, version stamp, or `lastSyncedAt` — every `syncPayrollFromServer` is a **full refresh** (all runs + all payslips).');
  L.push('');
  L.push('## Section 6 — Payload Waterfall (code-derived blocking chain)');
  L.push('');
  L.push('### Employees tab');
  L.push('');
  L.push('```');
  L.push('Tab select workforce');
  L.push('  ↓ (parallel with any in-flight hub sync payslip loop)');
  L.push('GET /payroll/employees  [EmployeeList — blocks render]');
  L.push('  ↓');
  L.push('Render VirtualizedEmployeeTable (even if count=0)');
  L.push('```');
  L.push('');
  L.push('**Longest step:** often **in-flight full sync payslip loop** (R sequential calls) contending with EmployeeList GET — EmployeeList spinner until its own fetch returns.');
  L.push('');
  L.push('### Payment History tab');
  L.push('');
  L.push('```');
  L.push('Tab select history');
  L.push('  ↓');
  L.push('syncPayrollFromServer (6 parallel + R payslip GETs)');
  L.push('  ↓');
  L.push('DELETE /payroll/runs/{id} for each empty PAID run (sequential)');
  L.push('  ↓ optional second full sync');
  L.push('  ↓');
  L.push('Read storageService → filter PAID runs → render');
  L.push('```');
  L.push('');
  L.push('### Audit Log tab');
  L.push('');
  L.push('```');
  L.push('Tab select audit');
  L.push('  ↓');
  L.push('GET /audit/events?module=payroll&limit=200');
  L.push('  ↓');
  L.push('Render table');
  L.push('```');
  L.push('');
  L.push('## Section 7 — Store Update Cost');
  L.push('');
  L.push('| Step | Cost | Material? |');
  L.push('| ---- | ---- | --------- |');
  L.push('| `normalizeEmployee` × N | CPU | Low unless N huge |');
  L.push('| `normalizePayslip` × all payslips | CPU | **Moderate** on large tenants |');
  L.push('| `localStorage.setItem` full payslip JSON | Sync main-thread write | **Moderate–high** large payloads |');
  L.push('| `pbooks-payroll-storage-updated` | PayrollHub `payrollStorageRevision++` | Triggers broad recomputes |');
  L.push('| Hub `paymentRecords` useMemo | filters **all** AppState transactions × payslips | **High** when GL tx large |');
  L.push('| EmployeeList filter/sort | O(N) | Low |');
  L.push('');
  L.push('Frontend processing is secondary to **network amplification** but payslip localStorage rewrite + hub recomputes add jank after sync completes.');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Performance Ranking');
  L.push('');
  L.push('| Rank | Bottleneck | Evidence |');
  L.push('| ---- | ---------- | -------- |');
  L.push('| 1 | **Sequential payslip fetch per run** (`for (run of runsNorm) getPayslipsByRun`) | `payrollSync.ts:42–47`; O(R) API calls; runs even when employee count=0 |');
  L.push('| 2 | **Duplicate full sync on Payroll landing** (Hub + Dashboard) | `PayrollHub.tsx:1046` + `PayrollDashboard.tsx:30` |');
  L.push('| 3 | **Payment History re-sync on every tab visit** | `PaymentHistory.tsx:60–92` |');
  L.push('| 4 | **EmployeeList redundant GET /payroll/employees** + loading gate | `EmployeeList.tsx:50–80,166–172` |');
  L.push('| 5 | **Payment History empty-run DELETE loop** | sequential `payrollApi.deletePayrollRun` |');
  L.push('| 6 | Hub transaction × payslip recomputes after storage event | `PayrollHub.tsx` paymentRecords useMemo |');
  L.push('| 7 | Audit log 200-row fetch | `PayrollAuditLog.tsx:80–82` |');
  L.push('');
  L.push('## Optimization Candidates (not implemented)');
  L.push('');
  L.push('### Safe');
  L.push('- Remove duplicate Dashboard sync on landing (rely on Hub sync + storage event)');
  L.push('- EmployeeList: hydrate from `storageService.getEmployees` immediately; background refresh optional');
  L.push('- Payment History: read PAID runs from cache; skip sync if cache fresh');
  L.push('- Split sync: `syncPayrollMetadata` (employees/runs/depts) vs lazy payslip fetch per run/tab');
  L.push('');
  L.push('### Medium risk');
  L.push('- Add session `lastSyncedAt` / revision from server; skip full sync when unchanged');
  L.push('- Parallelize payslip fetch with bounded concurrency (like `mapWithConcurrency`, cap 4)');
  L.push('- Paginate Payment History / Audit log');
  L.push('');
  L.push('### High risk');
  L.push('- Replace localStorage mirror with React Query payroll domain hooks (architectural shift)');
  L.push('- Server aggregate endpoint for Payment History (new API contract)');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Success Question');
  L.push('');
  L.push('### Why is the Employee page slow with zero employees?');
  L.push('');
  L.push('Because **`syncPayrollFromServer` always hydrates all payroll runs and every run\'s payslips**, regardless of employee count. Opening Payroll starts that work (twice on Dashboard landing). The Workforce tab then **blocks on a second `GET /payroll/employees`** even though sync already fetched employees into localStorage. With zero employees but non-zero payroll history, **payslip fan-out dominates**, not employee list size.');
  L.push('');
  L.push('### Why does Payment History trigger another sync after Hub loaded?');
  L.push('');
  L.push('Because **`PaymentHistory.tsx` explicitly calls `syncPayrollFromServer(tenantId)` in a `useEffect` when `activeSubTab === \'history\'`** — there is no check for existing cache, hub in-flight sync, or prior completion. It may call sync **twice** if it deletes empty PAID runs afterward.');
  L.push('');
  return L.join('\n');
}

const outReport = 'docs/performance/cloud/reports/payroll-perf-01-sync-amplification.md';
const outJson = 'docs/performance/cloud/captures/payroll-perf-01-sync-amplification.json';

const payload = {
  program: 'PAYROLL-PERF-01',
  generatedAt: new Date().toISOString(),
  syncFunction: 'components/payroll/services/payrollSync.ts',
  phase1Apis: SYNC_API_PHASE1,
  phase2Api: SYNC_API_PHASE2,
  callers: SYNC_CALLERS,
  duplicateSyncModel: {
    openPayrollDashboard: 2,
    openEmployeesTab: { sync: 0, getEmployees: 1 },
    openPaymentHistory: '1-2',
    openAuditLog: 0,
  },
};

mkdirSync(dirname(resolve(ROOT, outReport)), { recursive: true });
writeFileSync(resolve(ROOT, outReport), buildReport());
writeFileSync(resolve(ROOT, outJson), JSON.stringify(payload, null, 2));

console.log('PAYROLL-PERF-01 report:', outReport);

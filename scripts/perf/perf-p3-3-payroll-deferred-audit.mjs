#!/usr/bin/env node
/**
 * PERF-P3.3 — Payroll deferred bundle dependency audit (evidence only).
 *
 * Usage:
 *   node scripts/perf/perf-p3-3-payroll-deferred-audit.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function read(rel) {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

const PAGE_GROUPS = {
  PAYROLL: ['payroll'],
  PERSONAL_TRANSACTIONS: ['personalTransactions'],
};

/** From hooks/usePageGroupDeferredBootstrap.ts PAGE_GROUP_DEFERRED_ENTITIES */
const PAGE_GROUP_DEFERRED_ENTITIES = {
  PAYROLL: ['contacts'],
  PERSONAL_TRANSACTIONS: ['personalTransactions'],
};

const payrollSubTabs = {
  workforce: { label: 'Employees (EmployeeList)', file: 'components/payroll/PayrollHub.tsx activeSubTab=workforce' },
  history: { label: 'Payment History (PaymentHistory)', file: 'components/payroll/PayrollHub.tsx activeSubTab=history' },
  audit: { label: 'Audit Log (PayrollAuditLog)', file: 'components/payroll/PayrollHub.tsx activeSubTab=audit' },
};

function buildReport() {
  const L = [];
  const ts = new Date().toISOString();

  L.push('# PERF-P3.3 — Payroll Deferred Bundle Dependency Audit');
  L.push('');
  L.push(`Generated: ${ts}`);
  L.push('');
  L.push('> Evidence-only audit. No application behavior changes.');
  L.push('');
  L.push('## Investigation 1 — Page-group mappings');
  L.push('');
  L.push('Payroll sub-pages (Employees, Payment History, Audit Log) all live under **`currentPage: payroll`** → page group **`PAYROLL`**. They do **not** have separate App page groups.');
  L.push('');
  L.push('| UI page | App `Page` | Page group | Deferred entities (PERF-P3.2) |');
  L.push('| ------- | ------------ | ---------- | ----------------------------- |');
  L.push('| Employees (Workforce tab) | `payroll` | `PAYROLL` | `contacts` only |');
  L.push('| Payment History tab | `payroll` | `PAYROLL` | `contacts` only |');
  L.push('| Audit Log tab | `payroll` | `PAYROLL` | `contacts` only |');
  L.push('| Personal Transactions (separate sidebar item) | `personalTransactions` | `PERSONAL_TRANSACTIONS` | `personalTransactions` |');
  L.push('');
  L.push('**Key finding:** `GET /state/bulk?entities=personalTransactions` is **not** emitted by the Payroll page group mapping. It is emitted only when **`activeGroup === PERSONAL_TRANSACTIONS`** (user on the Personal Transactions screen).');
  L.push('');
  L.push('## Investigation 2 — personalTransactions dependency trace');
  L.push('');
  L.push('| Source file | Reason |');
  L.push('| ----------- | ------ |');
  L.push('| `hooks/usePageGroupDeferredBootstrap.ts` | `PERSONAL_TRANSACTIONS: [\'personalTransactions\']` — sole deferred-bootstrap mapping for this entity |');
  L.push('| `App.tsx` `PAGE_GROUPS` | `PERSONAL_TRANSACTIONS: [\'personalTransactions\']` — separate top-level page, not payroll sub-tab |');
  L.push('| `backend/.../appStateBulkService.ts` | `BULK_DEFERRED_ENTITIES` includes `personalTransactions` — excluded from primary chunked bootstrap |');
  L.push('| `components/personalTransactions/*` | Personal finance UI reads `personalTransactions` AppState slice (unrelated to PayrollHub) |');
  L.push('| `components/payroll/*` | **No references** to `personalTransactions` or `usePersonalTransactions()` |');
  L.push('');
  L.push('Payroll **`PAYROLL`** deferred mapping requests **`contacts`** (`GET /state/bulk?entities=contacts`), not personalTransactions. If DevTools shows `personalTransactions` during a payroll session, likely causes are: (a) user visited **Personal Transactions** page in same session, (b) **pool contention** from that request slowing unrelated payroll APIs, or (c) Network tab timeline mixing requests from prior navigation.');
  L.push('');
  L.push('## Investigation 3 — Page render blocking (dependency chain)');
  L.push('');
  L.push('### Employees tab (`workforce`)');
  L.push('');
  L.push('```');
  L.push('Login / auth ready');
  L.push('  → isInitialDataLoading false');
  L.push('  → First visit to PAYROLL group: isPageGroupMounting → PageDataLoadingOverlay (until group visited)');
  L.push('  → usePageGroupDeferredBootstrap(PAYROLL): optional GET /state/bulk?entities=contacts');
  L.push('      (NOT personalTransactions; does NOT block PayrollHub render directly)');
  L.push('  → Suspense: lazy PayrollHub chunk download');
  L.push('  → PayrollHub mount: syncPayrollFromServer(tenantId)  [6+ parallel payroll APIs + payslips per run]');
  L.push('  → EmployeeList mount: payrollApi.getEmployees()  [duplicate employee fetch]');
  L.push('  → isLoading spinner until getEmployees completes');
  L.push('  → Employee profile (if selected): payrollApi.getEmployeeLedger paginated');
  L.push('```');
  L.push('');
  L.push('**PayrollHub does not wait on `personalTransactions` or deferred bundle completion** before rendering shell. Slowness with zero employees is dominated by **`syncPayrollFromServer` + `getEmployees`**, not personalTransactions bulk.');
  L.push('');
  L.push('### Payment History tab (`history`)');
  L.push('');
  L.push('```');
  L.push('PayrollHub already mounted (syncPayrollFromServer may have run on hub mount)');
  L.push('  → User switches to history tab');
  L.push('  → PaymentHistory useEffect (activeSubTab === history):');
  L.push('      syncPayrollFromServer(tenantId)  [FULL sync again]');
  L.push('      deletePayrollRun for empty PAID runs (sequential API)');
  L.push('      syncPayrollFromServer again if deletions occurred');
  L.push('  → isLoading until complete');
  L.push('```');
  L.push('');
  L.push('Uses **`payrollApi` / localStorage cache** — not `personalTransactions` AppState.');
  L.push('');
  L.push('### Audit Log tab (`audit`)');
  L.push('');
  L.push('```');
  L.push('PayrollHub mounted');
  L.push('  → PayrollAuditLog mount');
  L.push('  → GET /audit/events?module=payroll&limit=200');
  L.push('  → loading spinner until response');
  L.push('```');
  L.push('');
  L.push('No deferred bootstrap dependency. Slow = audit API latency / pool queue behind other traffic.');
  L.push('');
  L.push('## Investigation 4 — Loaded slice lifecycle (`personalTransactions`)');
  L.push('');
  L.push('| Stage | `loadedSlices` (P3.2) | Behavior |');
  L.push('| ----- | ----------------------- | -------- |');
  L.push('| After primary bootstrap | **Not marked** — `personalTransactions` is in `BULK_DEFERRED_ENTITIES`, not static offset=0 chunk | Slice stays `[]` in AppState |');
  L.push('| First Personal Transactions page visit | Miss → `GET /state/bulk?entities=personalTransactions` | On **success**: `markDeferredBundleLoadSuccess` marks slice + session bundle |');
  L.push('| Tenant with 0 personal tx rows | Success returns `[]` | P3.2 marks loaded → **no repeat** on later visits |');
  L.push('| 503 / failed load | `catch {}` — **not marked loaded** | Retries on next PERSONAL_TRANSACTIONS navigation (not payroll tab) |');
  L.push('| Tenant switch | `resetDeferredBundleSession()` | Clears loadedSlices + loadedBundles |');
  L.push('');
  L.push('Failed loads do **not** mark slice loaded (by design), so intermittent 503 on Personal Transactions page can repeat until success.');
  L.push('');
  L.push('## Investigation 5 — Network timeline (expected, Employee tab)');
  L.push('');
  L.push('Representative sequence from code paths (measure live with DevTools + optional `deferred-bundle-probe.browser.js`):');
  L.push('');
  L.push('| Step | Event | Typical blocker? |');
  L.push('| ---- | ----- | ---------------- |');
  L.push('| 1 | Navigate to Payroll | `isPageGroupMounting` overlay (first visit only) |');
  L.push('| 2 | Deferred bootstrap | `GET /state/bulk?entities=contacts` (if contacts slice not loaded) | Pool only; not personalTransactions |');
  L.push('| 3 | Lazy chunk | PayrollHub JS download | Suspense fallback |');
  L.push('| 4 | Hub mount | `syncPayrollFromServer` — employees, runs, departments, grades, types, **all payslips** | **Primary payroll slowness** |');
  L.push('| 5 | Employees tab | `payrollApi.getEmployees()` | Duplicate fetch + spinner |');
  L.push('| 6 | UI usable | EmployeeList renders (even if 0 employees) | After step 5 |');
  L.push('');
  L.push('**personalTransactions bulk** would appear only if step 0 included visiting `personalTransactions` page (different `activeGroup`).');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Deliverable answers');
  L.push('');
  L.push('### 1. Why is the Employee page slow with zero employees?');
  L.push('');
  L.push('Not because of `personalTransactions`. Causes: (1) **`syncPayrollFromServer` on every PayrollHub mount** fetches all payroll runs and all payslips per run regardless of employee count; (2) **`EmployeeList` repeats `getEmployees()`**; (3) first-visit **page-group overlay** + **lazy chunk**; (4) optional deferred **`contacts`** bulk; (5) pool saturation from **other** bulk loads (including personalTransactions from a different page) can delay payroll APIs.');
  L.push('');
  L.push('### 2. Why is Payment History slow?');
  L.push('');
  L.push('**`PaymentHistory` runs a full `syncPayrollFromServer` again** when the history tab activates, plus sequential **`deletePayrollRun`** for empty paid runs and a possible second sync. No personalTransactions involvement.');
  L.push('');
  L.push('### 3. Why is Audit Log slow?');
  L.push('');
  L.push('**Synchronous load of up to 200 audit events** via `GET /audit/events?module=payroll`. Competes for pool/API with concurrent bulk/deferred traffic. No personalTransactions dependency.');
  L.push('');
  L.push('### 4. Should personalTransactions be part of Payroll deferred loading?');
  L.push('');
  L.push('**No.** Payroll code uses **`payrollApi`**, **`storageService`**, and GL **`transactions`** — not the **`personalTransactions`** AppState slice. Adding it to Payroll deferred loading would increase pool load without serving Payroll UI. Current **`PAYROLL: [\'contacts\']`** mapping appears **unused by payroll components** (synthetic `Contact` objects built from employee records); that contacts bulk may itself be unnecessary overhead.');
  L.push('');
  L.push('### 5. Recommended fix (investigation only — not implemented)');
  L.push('');
  L.push('| Priority | Recommendation | Rationale |');
  L.push('| -------- | -------------- | --------- |');
  L.push('| P0 | **Do not add personalTransactions to Payroll deferred bootstrap** | No code dependency; would worsen 503 pressure |');
  L.push('| P1 | **Deduplicate / lazy `syncPayrollFromServer`** — run once per hub session; avoid re-sync on Payment History tab; paginate payslip fetch | Dominates payroll tab latency even at zero employees |');
  L.push('| P1 | **Remove or justify `PAYROLL: [\'contacts\']`** deferred mapping | Payroll does not read AppState contacts |');
  L.push('| P2 | **Keep personalTransactions deferred on PERSONAL_TRANSACTIONS page only**; P3.2 empty-slice tracking already stops zero-row reload loops after first success | Correct scope for `/state/bulk?entities=personalTransactions` |');
  L.push('| P2 | **Investigate pool timeline correlation** — log whether personalTransactions 503 coincides with payroll navigation vs Personal Transactions page | Clarifies user-observed Network tab |');
  L.push('| P3 | Audit log: pagination / lazy load instead of 200 rows upfront | Reduces audit tab time |');
  L.push('');
  return L.join('\n');
}

const outReport = 'docs/performance/cloud/reports/perf-p3-3-payroll-deferred-audit.md';
const outJson = 'docs/performance/cloud/captures/perf-p3-3-payroll-deferred-audit.json';

const payload = {
  program: 'PERF-P3.3',
  generatedAt: new Date().toISOString(),
  pageGroupMappings: {
    payrollSubTabs,
    PAGE_GROUPS,
    PAGE_GROUP_DEFERRED_ENTITIES,
  },
  finding: 'personalTransactions deferred bulk is NOT triggered by PAYROLL page group; payroll slowness is primarily syncPayrollFromServer + duplicate getEmployees',
};

mkdirSync(dirname(resolve(ROOT, outReport)), { recursive: true });
writeFileSync(resolve(ROOT, outReport), buildReport());
writeFileSync(resolve(ROOT, outJson), JSON.stringify(payload, null, 2));

console.log('PERF-P3.3 audit report written:', outReport);

# PERF-P3.3 — Payroll Deferred Bundle Dependency Audit

Generated: 2026-06-23T04:09:51.106Z

> Evidence-only audit. No application behavior changes.

## Investigation 1 — Page-group mappings

Payroll sub-pages (Employees, Payment History, Audit Log) all live under **`currentPage: payroll`** → page group **`PAYROLL`**. They do **not** have separate App page groups.

| UI page | App `Page` | Page group | Deferred entities (PERF-P3.2) |
| ------- | ------------ | ---------- | ----------------------------- |
| Employees (Workforce tab) | `payroll` | `PAYROLL` | `contacts` only |
| Payment History tab | `payroll` | `PAYROLL` | `contacts` only |
| Audit Log tab | `payroll` | `PAYROLL` | `contacts` only |
| Personal Transactions (separate sidebar item) | `personalTransactions` | `PERSONAL_TRANSACTIONS` | `personalTransactions` |

**Key finding:** `GET /state/bulk?entities=personalTransactions` is **not** emitted by the Payroll page group mapping. It is emitted only when **`activeGroup === PERSONAL_TRANSACTIONS`** (user on the Personal Transactions screen).

## Investigation 2 — personalTransactions dependency trace

| Source file | Reason |
| ----------- | ------ |
| `hooks/usePageGroupDeferredBootstrap.ts` | `PERSONAL_TRANSACTIONS: ['personalTransactions']` — sole deferred-bootstrap mapping for this entity |
| `App.tsx` `PAGE_GROUPS` | `PERSONAL_TRANSACTIONS: ['personalTransactions']` — separate top-level page, not payroll sub-tab |
| `backend/.../appStateBulkService.ts` | `BULK_DEFERRED_ENTITIES` includes `personalTransactions` — excluded from primary chunked bootstrap |
| `components/personalTransactions/*` | Personal finance UI reads `personalTransactions` AppState slice (unrelated to PayrollHub) |
| `components/payroll/*` | **No references** to `personalTransactions` or `usePersonalTransactions()` |

Payroll **`PAYROLL`** deferred mapping requests **`contacts`** (`GET /state/bulk?entities=contacts`), not personalTransactions. If DevTools shows `personalTransactions` during a payroll session, likely causes are: (a) user visited **Personal Transactions** page in same session, (b) **pool contention** from that request slowing unrelated payroll APIs, or (c) Network tab timeline mixing requests from prior navigation.

## Investigation 3 — Page render blocking (dependency chain)

### Employees tab (`workforce`)

```
Login / auth ready
  → isInitialDataLoading false
  → First visit to PAYROLL group: isPageGroupMounting → PageDataLoadingOverlay (until group visited)
  → usePageGroupDeferredBootstrap(PAYROLL): optional GET /state/bulk?entities=contacts
      (NOT personalTransactions; does NOT block PayrollHub render directly)
  → Suspense: lazy PayrollHub chunk download
  → PayrollHub mount: syncPayrollFromServer(tenantId)  [6+ parallel payroll APIs + payslips per run]
  → EmployeeList mount: payrollApi.getEmployees()  [duplicate employee fetch]
  → isLoading spinner until getEmployees completes
  → Employee profile (if selected): payrollApi.getEmployeeLedger paginated
```

**PayrollHub does not wait on `personalTransactions` or deferred bundle completion** before rendering shell. Slowness with zero employees is dominated by **`syncPayrollFromServer` + `getEmployees`**, not personalTransactions bulk.

### Payment History tab (`history`)

```
PayrollHub already mounted (syncPayrollFromServer may have run on hub mount)
  → User switches to history tab
  → PaymentHistory useEffect (activeSubTab === history):
      syncPayrollFromServer(tenantId)  [FULL sync again]
      deletePayrollRun for empty PAID runs (sequential API)
      syncPayrollFromServer again if deletions occurred
  → isLoading until complete
```

Uses **`payrollApi` / localStorage cache** — not `personalTransactions` AppState.

### Audit Log tab (`audit`)

```
PayrollHub mounted
  → PayrollAuditLog mount
  → GET /audit/events?module=payroll&limit=200
  → loading spinner until response
```

No deferred bootstrap dependency. Slow = audit API latency / pool queue behind other traffic.

## Investigation 4 — Loaded slice lifecycle (`personalTransactions`)

| Stage | `loadedSlices` (P3.2) | Behavior |
| ----- | ----------------------- | -------- |
| After primary bootstrap | **Not marked** — `personalTransactions` is in `BULK_DEFERRED_ENTITIES`, not static offset=0 chunk | Slice stays `[]` in AppState |
| First Personal Transactions page visit | Miss → `GET /state/bulk?entities=personalTransactions` | On **success**: `markDeferredBundleLoadSuccess` marks slice + session bundle |
| Tenant with 0 personal tx rows | Success returns `[]` | P3.2 marks loaded → **no repeat** on later visits |
| 503 / failed load | `catch {}` — **not marked loaded** | Retries on next PERSONAL_TRANSACTIONS navigation (not payroll tab) |
| Tenant switch | `resetDeferredBundleSession()` | Clears loadedSlices + loadedBundles |

Failed loads do **not** mark slice loaded (by design), so intermittent 503 on Personal Transactions page can repeat until success.

## Investigation 5 — Network timeline (expected, Employee tab)

Representative sequence from code paths (measure live with DevTools + optional `deferred-bundle-probe.browser.js`):

| Step | Event | Typical blocker? |
| ---- | ----- | ---------------- |
| 1 | Navigate to Payroll | `isPageGroupMounting` overlay (first visit only) |
| 2 | Deferred bootstrap | `GET /state/bulk?entities=contacts` (if contacts slice not loaded) | Pool only; not personalTransactions |
| 3 | Lazy chunk | PayrollHub JS download | Suspense fallback |
| 4 | Hub mount | `syncPayrollFromServer` — employees, runs, departments, grades, types, **all payslips** | **Primary payroll slowness** |
| 5 | Employees tab | `payrollApi.getEmployees()` | Duplicate fetch + spinner |
| 6 | UI usable | EmployeeList renders (even if 0 employees) | After step 5 |

**personalTransactions bulk** would appear only if step 0 included visiting `personalTransactions` page (different `activeGroup`).

---

## Deliverable answers

### 1. Why is the Employee page slow with zero employees?

Not because of `personalTransactions`. Causes: (1) **`syncPayrollFromServer` on every PayrollHub mount** fetches all payroll runs and all payslips per run regardless of employee count; (2) **`EmployeeList` repeats `getEmployees()`**; (3) first-visit **page-group overlay** + **lazy chunk**; (4) optional deferred **`contacts`** bulk; (5) pool saturation from **other** bulk loads (including personalTransactions from a different page) can delay payroll APIs.

### 2. Why is Payment History slow?

**`PaymentHistory` runs a full `syncPayrollFromServer` again** when the history tab activates, plus sequential **`deletePayrollRun`** for empty paid runs and a possible second sync. No personalTransactions involvement.

### 3. Why is Audit Log slow?

**Synchronous load of up to 200 audit events** via `GET /audit/events?module=payroll`. Competes for pool/API with concurrent bulk/deferred traffic. No personalTransactions dependency.

### 4. Should personalTransactions be part of Payroll deferred loading?

**No.** Payroll code uses **`payrollApi`**, **`storageService`**, and GL **`transactions`** — not the **`personalTransactions`** AppState slice. Adding it to Payroll deferred loading would increase pool load without serving Payroll UI. Current **`PAYROLL: ['contacts']`** mapping appears **unused by payroll components** (synthetic `Contact` objects built from employee records); that contacts bulk may itself be unnecessary overhead.

### 5. Recommended fix (investigation only — not implemented)

| Priority | Recommendation | Rationale |
| -------- | -------------- | --------- |
| P0 | **Do not add personalTransactions to Payroll deferred bootstrap** | No code dependency; would worsen 503 pressure |
| P1 | **Deduplicate / lazy `syncPayrollFromServer`** — run once per hub session; avoid re-sync on Payment History tab; paginate payslip fetch | Dominates payroll tab latency even at zero employees |
| P1 | **Remove or justify `PAYROLL: ['contacts']`** deferred mapping | Payroll does not read AppState contacts |
| P2 | **Keep personalTransactions deferred on PERSONAL_TRANSACTIONS page only**; P3.2 empty-slice tracking already stops zero-row reload loops after first success | Correct scope for `/state/bulk?entities=personalTransactions` |
| P2 | **Investigate pool timeline correlation** — log whether personalTransactions 503 coincides with payroll navigation vs Personal Transactions page | Clarifies user-observed Network tab |
| P3 | Audit log: pagination / lazy load instead of 200 rows upfront | Reduces audit tab time |

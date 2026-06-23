# PAYROLL-PERF-01 — Payroll Sync Amplification Audit

Generated: 2026-06-23T04:12:37.936Z

> Evidence-only audit from static code analysis. No behavior changes.

## Section 1 — syncPayrollFromServer Call Graph

```
Payroll page (currentPage=payroll, PayrollHub mounted)
  │
  ├─ [A] PayrollHub useEffect([tenantId])
  ├─ [B] Active sub-tab may add another sync (see below)
  │
  └─ syncPayrollFromServer(tenantId, options?)
       ├─ storageService.init(tenantId)
       ├─ Promise.all (6 parallel API calls)
       │    GET /payroll/employees
       │    GET /payroll/runs
       │    GET /payroll/departments
       │    GET /payroll/grades
       │    GET /payroll/earning-types
       │    GET /payroll/deduction-types
       ├─ normalizeEmployee / normalizePayrollRun / set* → localStorage
       ├─ FOR EACH run in runsNorm (sequential loop, not parallel):
       │    GET /payroll/runs/{runId}/payslips
       │    normalizePayslip → accumulate allPayslips
       ├─ storageService.setPayslips(tenantId, allPayslips)  // full replace
       └─ dispatch pbooks-payroll-storage-updated
            └─ PayrollHub listeners → setPayrollStorageRevision
                 └─ heavy useMemo recomputes (transactions × payslips)
```

**Alternate path:** `options.runIds` → only re-fetch payslips for listed runs (BulkPayPayslipsModal); still runs phase-1 parallel fetch unless caller changed.

### All syncPayrollFromServer call sites

| File | Trigger | Scope |
| ---- | ------- | ----- |
| `components/payroll/PayrollHub.tsx` | useEffect([tenantId]) on hub mount | full sync |
| `components/payroll/PayrollDashboard.tsx` | useEffect([tenantId]) when Dashboard tab mounted | full sync (duplicate with hub on landing) |
| `components/payroll/PaymentHistory.tsx` | useEffect when activeSubTab===history | full sync ×1–2 per tab visit |
| `components/payroll/PayslipsPage.tsx` | useEffect([tenantId]) | full sync per Payslips tab mount |
| `components/payroll/PayrollSettingsPage.tsx` | settings load path | full sync |
| `components/payroll/PayrollReport.tsx` | report mount | full sync |
| `components/payroll/PayrollHub.tsx` | onAfterMutation (approval flow) | full sync after mutation |
| `components/payroll/modals/*.tsx` | post pay/edit/void | full or runIds-scoped sync |

## Section 2 — Payroll Data Volume Analysis

Live row counts require tenant-specific measurement (DevTools Network or API). **Code-derived volume model:**

| Endpoint | Rows / calls | Payload driver |
| -------- | ------------ | -------------- |
| `GET /payroll/employees` | N employees | O(N) — small when N=0 |
| `GET /payroll/runs` | R runs | O(R) — **still fetched when N=0** |
| `GET /payroll/runs/{id}/payslips` | **R sequential calls** | O(sum of payslips) — **dominant** |
| `GET /payroll/departments` | ~few | small |
| `GET /payroll/grades` | ~few | small |
| `GET /payroll/earning-types` | ~few | small |
| `GET /payroll/deduction-types` | ~few | small |
| `GET /audit/events?module=payroll` | up to 200 | Audit tab only — not part of sync |
| `GET /payroll/employees` (EmployeeList) | N again | **duplicate** of sync phase-1 |

**Zero employees does not skip payslip hydration.** Historical runs/payslips still drive R+1 network round-trips and large localStorage writes.

### Measurement procedure (live)

1. DevTools → Network, filter `/payroll/`
2. Open Payroll (note parallel duplicate syncs)
3. Record counts: runs list length, payslip responses, total transfer size, waterfall end time

## Section 3 — Page Dependency Matrix

### Employee page (Workforce tab → EmployeeList)

| Data | Required for UI? | Fetched by sync? | Fetched elsewhere? |
| ---- | ---------------- | ---------------- | ------------------ |
| employees | **Yes** | Yes (phase 1) | **Yes again** — `EmployeeList` → `payrollApi.getEmployees()` |
| payroll runs | No (list view) | Yes | — |
| payslips | No (list view) | Yes (all runs) | — |
| payments / GL tx | No (list view) | No | Hub subscribes to AppState `transactions` globally |
| audit events | No | No | — |
| departments/grades/types | No (list view) | Yes | — |

**Over-fetch:** full sync including all payslips before EmployeeList can render from cache.

### Payment History tab

| Data | Required? | Source |
| ---- | --------- | ------ |
| PAID payroll runs | **Yes** | `storageService.getPayrollRuns` filtered client-side |
| payslips | Indirect (amounts on runs) | Already in cache after sync |
| employees | No | — |
| audit | No | — |

**Over-fetch:** runs `syncPayrollFromServer` **again** on every history tab activation, plus sequential `deletePayrollRun` for empty PAID runs, then optional **second** full sync.

### Audit Log tab

| Data | Required? | Source |
| ---- | --------- | ------ |
| audit events | **Yes** | `GET /audit/events?module=payroll&limit=200` |
| employees/runs/payslips | **No** | Not used by PayrollAuditLog |

**Over-fetch:** none from sync; slowness = audit API + pool queue, not syncPayrollFromServer.

## Section 4 — Duplicate Sync Report

Derived from mount/effect structure (same session, API mode):

| User action | syncPayrollFromServer executions | Notes |
| ----------- | ------------------------------ | ----- |
| Open Payroll (default Dashboard tab) | **2** | Hub `[tenantId]` + PayrollDashboard `[tenantId]` **in parallel** |
| Switch to Employees tab | **0** (sync) + **1× getEmployees** | EmployeeList remount blocks UI until fetch completes |
| Switch to Payment History | **1–2** | PaymentHistory effect; +1 if empty PAID runs deleted |
| Switch to Audit Log | **0** | Audit uses `/audit/events` only |
| Revisit Employees tab (same session) | **0** sync + **1× getEmployees** | Tab unmount/remount |
| Revisit Payment History | **1–2** again | No staleness guard on `activeSubTab` |

**Why second Payroll visit may not feel faster:** Hub persists in DOM (`renderPersistentPage`) so hub `[tenantId]` sync runs once per session — but **tab switches** (History, Payslips, Dashboard) each attach **new** full syncs. EmployeeList **always** re-fetches employees on workforce remount.

## Section 5 — Cache Reuse Opportunities

Payroll cache = **tenant-scoped localStorage** via `storageService` (employees, runs, payslips, departments, grades, types).

| Page | Cache populated after first sync? | Reused without network? | Gap |
| ---- | -------------------------------- | ----------------------- | --- |
| Employee | Yes | **Partially** — data in localStorage but EmployeeList **ignores cache** and awaits API | Blocks on redundant GET |
| Payment History | Yes | **Could** read runs from cache | Effect **always** calls full sync first |
| Audit Log | N/A | N/A | Does not use payroll cache |

No TTL, version stamp, or `lastSyncedAt` — every `syncPayrollFromServer` is a **full refresh** (all runs + all payslips).

## Section 6 — Payload Waterfall (code-derived blocking chain)

### Employees tab

```
Tab select workforce
  ↓ (parallel with any in-flight hub sync payslip loop)
GET /payroll/employees  [EmployeeList — blocks render]
  ↓
Render VirtualizedEmployeeTable (even if count=0)
```

**Longest step:** often **in-flight full sync payslip loop** (R sequential calls) contending with EmployeeList GET — EmployeeList spinner until its own fetch returns.

### Payment History tab

```
Tab select history
  ↓
syncPayrollFromServer (6 parallel + R payslip GETs)
  ↓
DELETE /payroll/runs/{id} for each empty PAID run (sequential)
  ↓ optional second full sync
  ↓
Read storageService → filter PAID runs → render
```

### Audit Log tab

```
Tab select audit
  ↓
GET /audit/events?module=payroll&limit=200
  ↓
Render table
```

## Section 7 — Store Update Cost

| Step | Cost | Material? |
| ---- | ---- | --------- |
| `normalizeEmployee` × N | CPU | Low unless N huge |
| `normalizePayslip` × all payslips | CPU | **Moderate** on large tenants |
| `localStorage.setItem` full payslip JSON | Sync main-thread write | **Moderate–high** large payloads |
| `pbooks-payroll-storage-updated` | PayrollHub `payrollStorageRevision++` | Triggers broad recomputes |
| Hub `paymentRecords` useMemo | filters **all** AppState transactions × payslips | **High** when GL tx large |
| EmployeeList filter/sort | O(N) | Low |

Frontend processing is secondary to **network amplification** but payslip localStorage rewrite + hub recomputes add jank after sync completes.

---

## Performance Ranking

| Rank | Bottleneck | Evidence |
| ---- | ---------- | -------- |
| 1 | **Sequential payslip fetch per run** (`for (run of runsNorm) getPayslipsByRun`) | `payrollSync.ts:42–47`; O(R) API calls; runs even when employee count=0 |
| 2 | **Duplicate full sync on Payroll landing** (Hub + Dashboard) | `PayrollHub.tsx:1046` + `PayrollDashboard.tsx:30` |
| 3 | **Payment History re-sync on every tab visit** | `PaymentHistory.tsx:60–92` |
| 4 | **EmployeeList redundant GET /payroll/employees** + loading gate | `EmployeeList.tsx:50–80,166–172` |
| 5 | **Payment History empty-run DELETE loop** | sequential `payrollApi.deletePayrollRun` |
| 6 | Hub transaction × payslip recomputes after storage event | `PayrollHub.tsx` paymentRecords useMemo |
| 7 | Audit log 200-row fetch | `PayrollAuditLog.tsx:80–82` |

## Optimization Candidates (not implemented)

### Safe
- Remove duplicate Dashboard sync on landing (rely on Hub sync + storage event)
- EmployeeList: hydrate from `storageService.getEmployees` immediately; background refresh optional
- Payment History: read PAID runs from cache; skip sync if cache fresh
- Split sync: `syncPayrollMetadata` (employees/runs/depts) vs lazy payslip fetch per run/tab

### Medium risk
- Add session `lastSyncedAt` / revision from server; skip full sync when unchanged
- Parallelize payslip fetch with bounded concurrency (like `mapWithConcurrency`, cap 4)
- Paginate Payment History / Audit log

### High risk
- Replace localStorage mirror with React Query payroll domain hooks (architectural shift)
- Server aggregate endpoint for Payment History (new API contract)

---

## Success Question

### Why is the Employee page slow with zero employees?

Because **`syncPayrollFromServer` always hydrates all payroll runs and every run's payslips**, regardless of employee count. Opening Payroll starts that work (twice on Dashboard landing). The Workforce tab then **blocks on a second `GET /payroll/employees`** even though sync already fetched employees into localStorage. With zero employees but non-zero payroll history, **payslip fan-out dominates**, not employee list size.

### Why does Payment History trigger another sync after Hub loaded?

Because **`PaymentHistory.tsx` explicitly calls `syncPayrollFromServer(tenantId)` in a `useEffect` when `activeSubTab === 'history'`** — there is no check for existing cache, hub in-flight sync, or prior completion. It may call sync **twice** if it deletes empty PAID runs afterward.

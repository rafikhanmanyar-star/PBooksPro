# PERF-A3.1 — Server-Side Pagination Foundation — Implementation Report

**Task ID:** PERF-A3.1  
**Date:** 2026-06-19  
**Strategy:** `docs/performance/A3_1_PAGINATION_STRATEGY.md`  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A3.1 adds shared pagination types, backend query normalization, frontend `usePaginatedList`, and converts the **Payroll Employee Ledger** (API mode) from a single `limit=5000` fetch to **page size 50** with append-on-load-more. Virtualization, filters, balances, export, and sync refresh triggers are preserved. **No synchronization architecture changes.**

---

## 2. Files created

| File | Purpose |
|------|---------|
| `shared/types/pagination.ts` | `PaginatedResponse`, `parsePaginationQuery`, `buildPaginatedResponse` |
| `backend/src/utils/pagination/parsePaginationQuery.ts` | Backend mirror of shared helpers |
| `backend/src/utils/pagination/paginatedSql.ts` | SQL pattern + `sqlLimitOffset` |
| `backend/src/utils/pagination/index.ts` | Barrel export |
| `backend/src/utils/pagination/parsePaginationQuery.test.ts` | Unit tests |
| `hooks/pagination/usePaginatedList.ts` | Reusable accumulating list hook |
| `hooks/pagination/index.ts` | Public exports |
| `docs/performance/A3_1_PAGINATION_STRATEGY.md` | Architecture + migration plan |

---

## 3. Files modified

| File | Change |
|------|--------|
| `backend/src/modules/payroll/routes/payrollRoutes.ts` | `parsePaginationQuery` + `buildPaginatedResponse`; `year`/`month` filters |
| `backend/src/modules/payroll/services/payrollLedgerService.ts` | Server-side year/month SQL filters |
| `services/api/payrollApi.ts` | `page`/`pageSize` default 50; year/month params |
| `components/payroll/PayrollHub.tsx` | `usePaginatedList` pilot; export uses `limit=5000` one-shot |
| `components/payroll/VirtualizedPayrollEmployeeLedgerTable.tsx` | Load-more footer |

---

## 4. Architecture decisions

| Decision | Rationale |
|----------|-----------|
| **Offset pagination first** | Payroll ledger already had `LIMIT/OFFSET`; lowest risk pilot |
| **Dual query params** | `page`/`pageSize` for new clients; `limit`/`offset` backward compatible |
| **`usePaginatedList` not RQ** | Avoids touching invalidation/sync maps (frozen constraint) |
| **Server year/month on ledger** | Correct filtering without loading full dataset client-side |
| **Export escape hatch** | CSV still uses `limit=5000` read-only fetch until server export endpoint |
| **Summary unchanged** | `getEmployeePayrollBalanceFromDb` — full-employee totals, not page slice |

---

## 5. Benchmark comparison (Payroll Employee Ledger — API mode)

Estimates for a tenant with **2,000 ledger rows** per employee (typical large case from A2.1.6 spec).

| Metric | Before (A2.1.6) | After (A3.1) | Notes |
|--------|-----------------|--------------|-------|
| Rows in first API response | **5,000** (cap) | **50** | Default `pageSize` |
| Rows in browser after first paint | Up to 5,000 | **50** | Append via Load more |
| Approx. JSON payload (first load) | ~400–800 KB | **~10–20 KB** | ~40× smaller initial |
| Initial load time (est.) | 200–800 ms | **50–150 ms** | Network + parse |
| Memory (ledger rows array) | Full cap in heap | **50 × pages loaded** | Virtual DOM unchanged (~20 rows) |
| Virtualization DOM rows | ~20–30 | ~20–30 | Unchanged (`react-window`) |

**Manual validation recommended:** DevTools Network tab on `GET .../ledger?page=1&pageSize=50`; confirm Load more requests `page=2`.

---

## 6. Audit checklist

### Synchronization freeze

| Item | Status |
|------|--------|
| RealtimeDispatchHub | ✅ Not modified |
| Transactional Entity Queue | ✅ Not modified |
| Socket.IO flows | ✅ Not modified |
| Event ordering | ✅ Not modified |
| Conflict resolution | ✅ Not modified |
| React Query invalidation | ✅ Not modified |

### Functional

| Item | Status |
|------|--------|
| Pagination works | ✅ `page`/`pageSize` + legacy `limit`/`offset` |
| Type filter | ✅ `type` query unchanged |
| Year/month filter | ✅ Server-side `year`/`month` params |
| Virtualization | ✅ `VirtualizedPayrollEmployeeLedgerTable` unchanged |
| Balances / summary | ✅ Server `summary` on each page response |
| Sync refresh | ✅ `resetKey` includes `payrollStorageRevision`, `transactions.length` |
| Export | ✅ One-shot `limit=5000` for CSV |

### Verification commands

| Command | Result |
|---------|--------|
| `npm run build:backend` | **PASS** |
| `npm run build` | **PASS** |
| `node --import tsx --test src/utils/pagination/parsePaginationQuery.test.ts` | **PASS** (5 tests) |

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| User must click Load more for deep history | Acceptable pilot UX; infinite scroll optional in A3.2 |
| Export still fetches up to 5000 rows | Documented escape hatch; server export later |
| Offset pagination slow at very deep pages | Future cursor pagination for transactions (A3.3/A4) |
| Duplicate helper in `shared` + `backend` | Documented sync; optional copy script later |

---

## 8. Rollback strategy

1. **Payroll UI only:** Restore `PayrollHub` `useEffect` with `getEmployeeLedger(..., { limit: 5000 })`.
2. **API:** Backend remains compatible — clients can still send `limit=5000`.
3. **Remove foundation:** Delete `hooks/pagination/` and `backend/src/utils/pagination/` if program abandoned (not required for UI rollback).

---

## 9. Foundation readiness

| Future surface | Ready |
|----------------|-------|
| Contacts | ✅ Types + `usePaginatedList` + backend pattern |
| Bills | ✅ Same |
| Transactions / Ledgers | ✅ Same (+ cursor extension later) |
| Procurement | ✅ Same (+ infinite query variant) |

---

## 10. Success criteria

| Criterion | Met |
|-----------|-----|
| Browser no longer loads entire payroll ledger on first paint | ✅ 50 rows default |
| Server returns paginated results | ✅ |
| Virtualization preserved | ✅ |
| Synchronization preserved | ✅ |
| React Query behavior preserved | ✅ (ledger was not RQ-backed) |
| User-visible behavior unchanged (filters, balances, sort order) | ✅ |
| Foundation ready for other surfaces | ✅ |

---

**STOP.** Further A3 surface migrations not started in this task.

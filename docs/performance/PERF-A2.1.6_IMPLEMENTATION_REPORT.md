# PERF-A2.1.6 — PayrollHub Employee Ledger Virtualization — Implementation Report

**Task ID:** PERF-A2.1.6  
**Date:** 2026-06-19  
**Spec:** `docs/performance/A2.1_VIRTUALIZATION_IMPLEMENTATION_SPEC.md` (Task PERF-A2.1.6)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.1.6 virtualizes the **employee ledger tab** in `PayrollHub` using `**react-window` `List`** with a memoized row component and `ResizeObserver`-driven list height. API fetch (`limit: 5000`), year/month/type filters, CSV export, payment recording, and summary strip are unchanged.

**Key change:** Replaced `employeeLedgerSortedRows.map(...)` `<tbody>` (up to 5000 DOM rows) with a windowed virtual list rendering ~20–30 rows at any scroll position.

---

## 2. Files Modified


| File                                                           | Action                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `components/payroll/VirtualizedPayrollEmployeeLedgerTable.tsx` | **Created** — sticky header + `List` + `PayrollLedgerTableRow`                                      |
| `components/payroll/PayrollHub.tsx`                            | Ledger `<table>` replaced with virtual table; ledger container uses `flex flex-col overflow-hidden` |


**Not modified:** `payrollApi`, `payrollLedgerCore`, `storageService`, payslip/payment tables, sync/socket paths.

---

## 3. Virtualization Strategy Used


| Parameter     | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Library       | `react-window` `List` only                                             |
| Row height    | **52px** (OwnerLedger / BrokerLedger pattern)                          |
| List height   | **ResizeObserver** on flex parent (fallback 320px)                     |
| Overscan      | **6** rows                                                             |
| Row component | Memoized `PayrollLedgerTableRow` via `rowComponent` + `rowProps`       |
| Data window   | Full `employeeLedgerSortedRows[]` in memory (API limit 5000 unchanged) |


---

## 4. Preserved UX


| Feature                                        | Status                   |
| ---------------------------------------------- | ------------------------ |
| `getEmployeeLedger(id, { limit: 5000 })` fetch | Unchanged                |
| Year / month / ledger row type filters         | Unchanged                |
| Balance summary strip (payable / advance)      | Unchanged                |
| CSV export from `employeeLedgerSortedRows`     | Unchanged                |
| Payment recording + sync refresh               | Unchanged                |
| Striped rows, type badges, balance coloring    | Preserved in virtual row |
| Loading / empty states                         | Preserved                |


---

## 5. Verification


| Check                 | Result                |
| --------------------- | --------------------- |
| `npm run build`       | **Pass** (2026-06-19) |
| Linter (edited files) | **No errors**         |


### Manual QA (recommended per spec)


| ID          | Scenario                                | Expected                       |
| ----------- | --------------------------------------- | ------------------------------ |
| T-A2.1.6-01 | Employee with 500+ ledger rows — scroll | ≤~30 DOM rows; smooth scroll   |
| T-A2.1.6-02 | Year / month / type filters             | Virtual set updates            |
| T-A2.1.6-03 | CSV export row count                    | Matches full filtered dataset  |
| T-A2.1.6-04 | Payment recording sync                  | New row appears after mutation |


---

## 6. Success Criteria (spec)

- [x] 5000-row fetch still works; DOM windowed to ~20–30 rows.
- [x] Build passes.
- [ ] Scroll FPS ≥55 (Profiler spot-check — manual).

---

## 7. Estimated Gain

Per spec: **80–90%** paint improvement (5000 → ~20 DOM rows).

---

## 8. Architecture Compliance


| Gate                     | Status      |
| ------------------------ | ----------- |
| Sync / emit / sockets    | Not touched |
| React Query config       | Not touched |
| Backend / API            | Not touched |
| Render-only optimization | Yes         |


---

## 9. Follow-up (out of scope)

- **A3:** Reduce API page size (100–200) with cursor/load-more on scroll.
- Payslip/payment tables in same hub remain non-virtualized (paginated at 10 rows).

## Known Limitation

Virtualization reduces rendering cost only.

The ledger API still retrieves up to 5000 rows into memory.

Future A3 ledger scalability work should implement:

- Server-side pagination

- Cursor pagination

- Incremental loading

without changing the virtualization layer.


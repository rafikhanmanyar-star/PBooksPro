# PERF-A2.1.2 — BillsPage Virtualization — Implementation Report

**Task ID:** PERF-A2.1.2  
**Date:** 2026-06-19  
**Spec:** `docs/performance/A2.1_VIRTUALIZATION_IMPLEMENTATION_SPEC.md` (Task PERF-A2.1.2)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.1.2 virtualizes the BillsPage main data grid using **`react-window` `List`**, following the approved **A2.1.1 (`VirtualizedContactsTable`) / `OwnerLedger`** pattern. Filter, sort, tree sidebar, bulk payment selection, and all modal flows remain in `BillsPage`; only the row render path is windowed.

**Key change:** Replaced `filteredRows.slice(0, displayLimit).map(...)` (A2.5.5 cap of 50 + load-more) with a virtual list that renders **~15–25 DOM rows** regardless of dataset size. Heterogeneous row kinds (bill, payment, vendor settlement, advance) are rendered from a **unified flat list** with a `type` discriminator — no variable row height.

**Out of scope (unchanged):** sync/socket/React Query, backend, business logic, tree sidebar virtualization, export/print hooks.

---

## 2. Pre-Implementation Analysis

### Current render flow (before)

```
BillsPage
├── useStateSelector(s => s) — unchanged
├── useMemo → tableRows, filteredRows (filter + sort + tree)
├── displayLimit state (50 initial, +200 load-more)     ← A2.5.5 interim
└── <table>
      <thead> sticky sort headers (9 data columns + checkbox + actions)
      <tbody>
        filteredRows.slice(0, displayLimit).map → bill | payment | settlement | advance rows
        optional "Load more" row
```

### Row kinds (heterogeneous, flattened in place)

| `type` | Stable `id` prefix | UX preserved |
|--------|-------------------|--------------|
| `bill` | `bill-{billId}` | Checkbox bulk pay, edit, Pay, WhatsApp, document |
| `payment` | `payment-{txId}` | Click → edit transaction |
| `vendor_settlement` | `vset-{journalEntryId}-{billId}` | Click → settlement modal |
| `advance` | `advance-{advanceId}` | Read-only prepaid row (vendor sidebar) |

### Pattern comparison

| Reference | Fit for BillsPage | Decision |
|-----------|-------------------|----------|
| **SmartTable** | Would duplicate page-level filters/sort; column renderers complex for 4 row layouts | **Rejected** |
| **VirtualizedLedgerTable** | Flatten pattern for heterogeneous rows | **Referenced** (unified list concept) |
| **VirtualizedContactsTable** (A2.1.1) | Sticky header + `ResizeObserver` + `List` + memo row | **Adopted** (layout pattern) |
| **OwnerLedger** | `rowComponent` + `rowProps` | **Adopted** (row API) |

---

## 3. Files Modified

| File | Action |
|------|--------|
| `components/bills/billsTableTypes.ts` | **Created** — shared `BillsTableRow`, `BillsSortKey` |
| `components/bills/VirtualizedBillsTable.tsx` | **Created** — virtual header + `List` body + 4 row renderers |
| `components/bills/BillsPage.tsx` | Replaced inline `<table>`; removed `displayLimit` / load-more |

**Not modified:** sync, socket, React Query, reducers, APIs, tree sidebar, footer summary totals.

---

## 4. Virtualization Strategy Used

| Parameter | Value |
|-----------|-------|
| Library | `react-window` `List` only |
| Row height | **52px** fixed (settlement/advance sub-lines truncated with `overflow-hidden`) |
| Overscan | **6** rows |
| Height | `ResizeObserver` on list container (fills flex parent) |
| Row component | Memoized `BillsTableRowView` via `rowComponent` + `rowProps` |
| Data window | Full `filteredRows[]` in memory; DOM windowed only |
| Flattening | Existing `filteredRows` array already unified; no extra flatten step required |

**Load-more removed:** All filtered rows reachable by scrolling.

**Advance description:** Truncated to one line with `title` tooltip (fixed row height trade-off per spec).

---

## 5. Reference Implementation Reused

| Source | Reused element |
|--------|----------------|
| `VirtualizedContactsTable.tsx` | Header + body split, `ResizeObserver`, `List` props |
| `OwnerLedger.tsx` | `rowComponent` + memo row + `rowProps` |
| `VirtualizedLedgerTable.tsx` | Unified flat list for heterogeneous row kinds |
| `BillsPage.tsx` (pre-refactor) | Row cell markup and interaction handlers (moved verbatim) |

---

## 6. BillsPage Integration

### Removed

- `displayLimit` state and load-more footer row
- Inline `<table>` / `<tbody>` render loop (~290 lines)
- Unused `formatDate` import, `billStatusBadgeClass`, `SortIcon`, `getStatusBadge`

### Preserved in parent

- `tableRows` / `filteredRows` `useMemo` pipelines
- `selectedBillIds` + bulk pay toolbar
- Tree sidebar, date range, type filter, search
- All modals (create/edit bill, payment, bulk pay, settlement, advance)
- Footer summary totals (Bills Total, Payments, Prepaid, Outstanding)

### Callbacks passed to virtual table

| Callback | Purpose |
|----------|---------|
| `onToggleBillSelection` | Bulk pay checkbox |
| `onEditBill` | Bill row click |
| `onRecordPayment` | Pay button |
| `onSendWhatsApp` | WhatsApp on paid bills |
| `onEditPayment` | Payment row click |
| `onEditSettlement` | Settlement row click |

---

## 7. Architecture Compliance

| Gate | Status |
|------|--------|
| Sync / socket / React Query | **Not touched** |
| PostgreSQL / API | **Not touched** |
| Business logic | **Unchanged** — render-only |
| Real-time updates | **Unchanged** — AppState → `filteredRows` recompute → virtual list |

---

## 8. Verification

| Check | Result |
|-------|--------|
| `npm run build` | **Pass** (2026-06-19) |
| Linter (edited files) | **No errors** |
| `displayLimit` grep in `components/bills/` | **None** |

### Manual QA (recommended per spec)

| ID | Scenario | Expected |
|----|----------|----------|
| T-A2.1.2-01 | 500+ rows — scroll | ≤30 DOM rows visible; smooth scroll |
| T-A2.1.2-02 | Bulk payment flow | Checkbox selection + Record Payment unchanged |
| T-A2.1.2-03 | Tree + date filter | Correct filtered virtual set |
| T-A2.1.2-04 | Sort all columns | Order preserved |
| T-A2.1.2-05 | Socket bill update | Row updates without F5 |
| T-A2.1.2-06 | Export / print | Unchanged (not in render path) |

---

## 9. Success Criteria (spec)

- [x] Flattened virtual rows render all row kinds correctly (bill, payment, settlement, advance).
- [x] Bulk payment checkbox + selection state unchanged in parent.
- [x] No `displayLimit` / load-more pattern.
- [x] Build passes.

---

## 10. Estimated Gain

Per spec: **55–70%** DOM + paint time reduction at 200+ bills. DOM row count capped at ~`visibleRows + 2 × overscan` (~18–25) vs prior full slice render.

---

## 11. Follow-ups (out of scope)

- PERF-A2.5.2: stabilize `useStateSelector(s => s)` on BillsPage (full-state subscription)
- Variable row height for advance descriptions (only if truncation UX is insufficient)

# PERF-A2.1.4 — VendorLedger Virtualization — Implementation Report

**Task ID:** PERF-A2.1.4  
**Date:** 2026-06-19  
**Spec:** `docs/performance/A2.1_VIRTUALIZATION_IMPLEMENTATION_SPEC.md` (Task PERF-A2.1.4)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.1.4 virtualizes the vendor directory **VendorLedger** (expandable bill/batch/advance rows) using `**react-window` `List`** with a **flattened row model** — the same approach as `VirtualizedLedgerTable`. Ledger computation, expand/collapse, prepaid rows, click handlers, and Excel export remain in `VendorLedger`; only the render path is windowed.

**Key change:** Replaced full `<tbody>` map (parent rows + inline expanded children) with `flattenVendorLedgerRows()` → virtual list (~15–25 DOM rows at any scroll position).

**Out of scope (unchanged):** `VendorLedgerReport` (report module), sync/socket/API, backend.

---

## 2. Pre-Implementation Analysis

### Current render flow (before)

```
VendorLedger
├── useMemo → ledgerItems (bills, prepaid apply, payments, batches, advances + sort + balance)
├── expandedIds state
└── <table>
      ledgerItems.map → parent <tr>
        if expanded → children.map → child <tr>
```

### Flatten strategy


| Row kind                                                                             | In flat list when            | `depth` / indent                  |
| ------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------- |
| Parent (`bill`, `transaction`, `batch_payment`, `prepaid_apply`, `supplier_advance`) | Always                       | Chevron + `pl-5` when no children |
| Child (batch payment line items)                                                     | Parent `id` in `expandedIds` | `pl-9` date column                |


Expand/collapse toggles **inclusion** in `flatRows` via `flattenVendorLedgerRows(ledgerItems, expandedIds)` — same semantics as pre-refactor conditional child `<tr>` blocks.

---

## 3. Files Modified


| File                                                  | Action                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `components/vendors/vendorLedgerTypes.ts`             | **Created** — `LedgerItem`, `FlatVendorLedgerRow`, `flattenVendorLedgerRows()` |
| `components/vendors/VirtualizedVendorLedgerTable.tsx` | **Created** — sticky header + `List` + parent/child row renderers              |
| `components/vendors/VendorLedger.tsx`                 | Computation unchanged; table replaced with virtual table                       |


**Not modified:** `VendorLedgerReport.tsx`, export math source (`ledgerItems`), `VendorDirectoryPage` integration.

---

## 4. Virtualization Strategy Used


| Parameter                  | Value                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| Library                    | `react-window` `List` only                                           |
| Row height                 | **40px** fixed (compact `text-xs` ledger)                            |
| Overscan                   | **6** rows                                                           |
| Height                     | `ResizeObserver` on list container (fills flex parent in vendor tab) |
| Row component              | Memoized `VendorLedgerTableRow` via `rowComponent` + `rowProps`      |
| Particulars / advance text | `truncate` + `title` tooltip                                         |


**Export unchanged:** `handleExport` still maps full `ledgerItems[]` (parent rows only, no expanded children) — same as pre-refactor.

---

## 5. Preserved UX


| Feature                                                        | Status                                   |
| -------------------------------------------------------------- | ---------------------------------------- |
| Sort columns (date, particulars, credit, debit, balance)       | Unchanged                                |
| Expand/collapse bulk payment batches                           | Unchanged (`TreeExpandCollapseControls`) |
| Click bill / prepaid apply → `onItemClick(..., 'bill')`        | Unchanged                                |
| Click payment / child line → `onItemClick(..., 'transaction')` | Unchanged                                |
| Supplier advance rows (non-clickable, highlight)               | Unchanged                                |
| Prepaid apply row styling                                      | Unchanged                                |
| Running balance on parent rows                                 | Unchanged                                |
| Supplier advance API refresh event                             | Unchanged                                |
| Excel export totals                                            | From `ledgerItems` (not DOM)             |


---

## 6. Architecture Compliance


| Gate                        | Status                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| Sync / socket / React Query | **Not touched**                                                                  |
| PostgreSQL / API            | **Not touched** (client-side ledger from AppState + `contractorApi.getAdvances`) |
| Business logic              | **Unchanged** — render-only                                                      |


---

## 7. Verification


| Check                 | Result                |
| --------------------- | --------------------- |
| `npm run build`       | **Pass** (2026-06-19) |
| Linter (edited files) | **No errors**         |


### Manual QA (recommended per spec)


| ID          | Scenario                           | Expected                                    |
| ----------- | ---------------------------------- | ------------------------------------------- |
| T-A2.1.4-01 | Expand/collapse bulk payment batch | Child rows appear/disappear in virtual list |
| T-A2.1.4-02 | Prepaid apply rows                 | Highlight + debit correct                   |
| T-A2.1.4-03 | Click bill vs payment vs child     | Correct modal opens                         |
| T-A2.1.4-04 | Excel export                       | Totals match pre-refactor                   |
| T-A2.1.4-05 | 300+ items scroll                  | ≤~30 DOM rows; smooth scroll                |


---

## 8. Success Criteria (spec)

- [x] Flattened virtual list preserves expand/collapse semantics.
- [x] Export totals computed from source `ledgerItems` (unchanged).
- [x] Build passes.

---

## 9. Estimated Gain

Per spec: **65–80%** DOM reduction for 300+ ledger items.



## Known Limitations



## Known Limitations

### Flattened Virtualization Structure

Virtualization operates on a flattened ledger structure.

Expanded batch children are converted into flat virtual rows prior to rendering.

This is intentional and required for efficient virtualization with react-window.

Future developers should preserve flattenVendorLedgerRows() when modifying batch-payment behavior.

Changing this structure may break:

- Expand/collapse behavior

- Virtual row indexing

- Scroll position calculations

- Large dataset performance
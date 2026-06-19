# PERF-A2.1.3 — BrokerLedger Virtualization — Implementation Report

**Task ID:** PERF-A2.1.3  
**Date:** 2026-06-19  
**Spec:** `docs/performance/A2.1_VIRTUALIZATION_IMPLEMENTATION_SPEC.md` (Task PERF-A2.1.3)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.1.3 virtualizes `BrokerLedger` by cloning the in-repo **`OwnerLedger`** pattern: `react-window` `List` with a memoized row component. Ledger computation (`useMemo` from transactions + agreements), sort, running balance, scope filters, and WhatsApp export are **unchanged** — only the render loop was replaced.

**Key change:** Replaced `ledgerItems.map(...)` full `<tbody>` with a virtual list capped at **520px** height, rendering **~10–15 DOM rows** at any scroll position for large ledgers.

**Out of scope (unchanged):** sync/socket/React Query, backend, business logic.

---

## 2. Pre-Implementation Analysis

### Current render flow (before)

```
BrokerLedger
├── ~7 slice hooks (transactions, properties, categories, …)
├── useMemo → ledgerItems (fees + payments, sort, running balance)
└── <table>
      <thead> sortable columns
      <tbody>
        ledgerItems.map → full DOM row per line
```

### Reference: OwnerLedger (same module)

| Element | OwnerLedger | Applied to BrokerLedger |
|---------|-------------|---------------------------|
| `List` from `react-window` | Yes | Yes |
| `LEDGER_ROW_HEIGHT = 52` | Yes | Yes |
| `LEDGER_LIST_MAX_H = 520` | Yes | Yes |
| Memo `*LedgerRow` via `rowComponent` | Yes | `BrokerLedgerRow` |
| Flex header + flex rows | Yes | Yes (app theme classes) |
| `overscanCount` | Not set | **6** (per spec) |

---

## 3. Files Modified

| File | Action |
|------|--------|
| `components/payouts/BrokerLedger.tsx` | Replace `<table>` body with `List`; extract `BrokerLedgerRow` |

**Not modified:** parent pages, payout modals, sync, APIs.

---

## 4. Virtualization Strategy Used

| Parameter | Value |
|-----------|-------|
| Library | `react-window` `List` only |
| Row height | **52px** fixed |
| List max height | **520px** (`Math.min(520, rows × 52)`) |
| Overscan | **6** rows |
| Row component | Memoized `BrokerLedgerRow` via `rowComponent` + stable `rowProps` |
| Particulars column | `truncate` + `title` tooltip (fixed height trade-off) |

**Ledger logic preserved:**

- Rental / Project context filters
- Building / property scope for rental
- Sort + running balance computed in same `useMemo` (balance follows display sort — pre-existing behavior)
- WhatsApp totals from full `ledgerItems` array (not windowed)

---

## 5. Reference Implementation Reused

| Source | Reused element |
|--------|----------------|
| `OwnerLedger.tsx` | `List` layout, row height, list max height, flex column widths, header buttons |
| `BrokerLedger.tsx` (pre-refactor) | Cell styling (`text-app-*`, `text-ds-*`), column labels, WhatsApp footer |

---

## 6. Architecture Compliance

| Gate | Status |
|------|--------|
| Sync / socket / React Query | **Not touched** |
| PostgreSQL / API | **Not touched** |
| Business logic | **Unchanged** — render-only |
| Real-time updates | **Unchanged** — AppState → `ledgerItems` recompute |

---

## 7. Verification

| Check | Result |
|-------|--------|
| `npm run build` | **Pass** (2026-06-19) |
| Linter (`BrokerLedger.tsx`) | **No errors** |
| Full `.map()` in tbody | **Removed** |

### Manual QA (recommended per spec)

| ID | Scenario | Expected |
|----|----------|----------|
| T-A2.1.3-01 | 500+ ledger lines — scroll | Smooth; ≤~15 visible rows |
| T-A2.1.3-02 | Sort columns | Order + running balance unchanged |
| T-A2.1.3-03 | Rental / Project / building scope | Filtered virtual set |
| T-A2.1.3-04 | Send Ledger via WhatsApp | Totals match visible ledger |
| T-A2.1.3-05 | Compare running balance | Match pre-refactor for same sort |

---

## 8. Success Criteria (spec)

- [x] `List` replaces full `.map()`.
- [x] Ledger computation unchanged (totals should match golden comparison).
- [x] Build passes.

---

## 9. Estimated Gain

Per spec: **70–85%** DOM reduction for 500+ ledger lines.

---

## 10. Follow-ups (out of scope)

- Align `OwnerLedger` with `overscanCount={6}` for consistency
- Chronological running balance (OwnerLedger pattern) — only if product requests sort-independent balance on BrokerLedger

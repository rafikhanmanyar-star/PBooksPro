# PERF-A2.3 — Hidden Page Subscription Gate — Implementation Plan

**Task ID:** PERF-A2.3  
**Date:** 2026-06-19  
**Authority:** `docs/performance/PERFORMANCE_AUDIT_V1.md` (C6), `docs/performance/PERFORMANCE_IMPLEMENTATION_PLAN_V1.md` (§ A2.3)  
**Status:** Approved architecture — **implementation complete**

---

## 1. Executive Summary

Persistent page groups in `App.tsx` stay mounted (hidden via CSS) to preserve UI state. Inactive groups continued to run **Zustand subscriptions**, **React Query polling**, and expensive memos — causing 20–40% wasted background work.

**Solution:** `PageActiveProvider` + `PageActiveScope` + gated `useStateSelector` + `usePageQueryEnabled` for polling queries.

**Rollback:** `VITE_PAGE_ACTIVE_GATE=false` disables all gating.

---

## 2. Phase 1 — Analysis

### 2.1 Current architecture (before)

```
App.tsx
├── MAX_PERSISTENT_PAGES = 3 (LRU) + RENTAL pinned
├── activeGroup derived from currentPage + PAGE_GROUPS
└── renderPersistentPage(groupKey)
    ├── CSS hide when inactive (opacity-0, pointer-events-none)
    └── Full React tree + hooks remain live
```

**Problem:** Up to **4** concurrent page group trees with live subscriptions.

### 2.2 Affected page groups

| Group | Key pages | Hot background work |
|-------|-----------|---------------------|
| `DASHBOARD` | DashboardPage | Metrics polling 120s |
| `TRANSACTIONS` | EnhancedLedgerPage | transactions, lookup maps |
| `RENTAL` | RentalManagement | invoices, rollup 12k query, analytics |
| `PROJECT` | ProjectManagement, Bills | bills, selling analytics |
| `VENDORS` | VendorDirectory | vendor analytics, PO/GRN |
| `PAYROLL` | PayrollHub | payroll state + API |
| `ACCOUNTING` | AccountingPage | accounting/banking analytics |

**Exempt:** Header, Sidebar (outside `PageActiveScope`).

### 2.3 Render triggers (before)

| Trigger | Inactive page effect |
|---------|---------------------|
| Any AppState slice mutation | All mounted page hooks rerender |
| Dashboard 120s poll | Continues on hidden Dashboard |
| Rental rollup query | Continues when RENTAL pinned but user on PROJECT |
| Analytics 120s polls | Continue per module |

---

## 3. Proposed architecture (approved)

```
PageActiveProvider (activeGroup from App)
└── Header (no scope — always live)
└── main
    └── PageActiveScope(pageGroup) per persistent page
        └── Page content
            ├── useStateSelector → gated when inactive
            └── useQuery → enabled via usePageQueryEnabled()
```

**On re-activate:** `invalidatePageGroupQueries(pageGroup)` refreshes RQ caches.

---

## 4. New files

| File | Purpose |
|------|---------|
| `context/PageActiveContext.tsx` | Provider, Scope, `usePageActive` |
| `hooks/usePageActive.ts` | Re-export |
| `hooks/useGatedSubscription.ts` | `useGatedStateSelector` |
| `hooks/usePageQueryEnabled.ts` | RQ enable helper |
| `hooks/pageActiveInvalidation.ts` | Targeted invalidation on activate |

---

## 5. Modified files

| File | Change |
|------|--------|
| `hooks/useSelectiveState.ts` | `useStateSelector` → `useGatedStateSelector` |
| `App.tsx` | `PageActiveProvider` + `PageActiveScope` per page |
| `hooks/useDashboardMetrics.ts` | Gate polling |
| `modules/*/hooks/use*Analytics.ts` (7) | Gate polling |
| `components/payouts/OwnerPayoutsPage.tsx` | Gate rollup query |
| `components/reports/PropertyLayoutReport.tsx` | Gate rollup query |

---

## 6. Strict rules compliance

| Rule | Status |
|------|--------|
| No sync/socket/invalidation behavior change | ✅ Only additive invalidation on activate |
| No business logic change | ✅ |
| UI state preserved (no unmount) | ✅ |
| Header always active | ✅ Outside scope |

---

## 7. Verification plan

1. Navigate Dashboard → Ledger → Invoices → Vendors; Profiler shows inactive groups not rerendering on unrelated mutations.
2. Socket patch while on Dashboard; switch to Ledger — data current after activate invalidation.
3. RENTAL pin: navigate away and back — filters/scroll preserved.
4. `npm run build` PASS.

---

## 8. Rollback

Set `VITE_PAGE_ACTIVE_GATE=false` in env or revert A2.3 commits.

---

## 9. Stop condition

After implementation + report: **STOP**. Do not start A2.4, A3, A4.

# PERF-A2.3 — Hidden Page Subscription Gate — Implementation Report

**Task ID:** PERF-A2.3  
**Date:** 2026-06-19  
**Plan:** `docs/performance/PERF-A2.3_IMPLEMENTATION_PLAN.md`  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.3 suspends **AppState subscriptions** and **React Query polling** inside hidden persistent page groups while preserving mounted UI state (filters, scroll, expansion). Active page behavior is unchanged.

**Core mechanism:** `useGatedStateSelector` unsubscribes from `_subscribeAppState` when the enclosing `PageActiveScope` is inactive and returns the last snapshot.

**Rollback:** `VITE_PAGE_ACTIVE_GATE=false`.

---

## 2. Current Architecture (before)

- Up to 4 persistent page groups mounted simultaneously (LRU + RENTAL pin).
- Inactive pages hidden via CSS only.
- Every `useStateSelector` in hidden trees remained subscribed.
- Dashboard/analytics queries polled every 120s regardless of visibility.

---

## 3. New Architecture (after)

```
App
├── PageActiveProvider(activeGroup)
│   ├── Header (live)
│   └── main
│       └── PageActiveScope × N
│           └── Page (gated hooks)
└── KPIPanel (outside provider — unchanged)
```


| Layer                            | Inactive behavior                   |
| -------------------------------- | ----------------------------------- |
| `useStateSelector` / slice hooks | Frozen snapshot, no subscription    |
| `usePageQueryEnabled()`          | Returns `false`                     |
| React Query `refetchInterval`    | `false` when inactive               |
| Local `useState`                 | Preserved                           |
| On activate                      | `invalidatePageGroupQueries(group)` |


---

## 4. Files Modified


| File                                               | Action                   |
| -------------------------------------------------- | ------------------------ |
| `context/PageActiveContext.tsx`                    | **Created**              |
| `hooks/usePageActive.ts`                           | **Created**              |
| `hooks/useGatedSubscription.ts`                    | **Created**              |
| `hooks/usePageQueryEnabled.ts`                     | **Created**              |
| `hooks/pageActiveInvalidation.ts`                  | **Created**              |
| `hooks/useSelectiveState.ts`                       | Gated `useStateSelector` |
| `App.tsx`                                          | Provider + Scope wiring  |
| `hooks/useDashboardMetrics.ts`                     | Polling gate             |
| 7× `modules/*/hooks/use*Analytics.ts`              | Polling gate             |
| `OwnerPayoutsPage.tsx`, `PropertyLayoutReport.tsx` | Rollup query gate        |


**Not modified:** `AppContext` socket handlers, `RealtimeDispatchHub`, reducers, backend.

---

## 5. Subscription Reduction


| Scenario                              | Before                                   | After                               |
| ------------------------------------- | ---------------------------------------- | ----------------------------------- |
| Hidden RENTAL group (user on PROJECT) | All RENTAL `useStateSelector` hooks live | **Unsubscribed** — frozen snapshots |
| Hidden Dashboard                      | 120s metrics poll + slice subs           | **Poll off** + subs frozen          |
| Header while navigating               | Live (unchanged)                         | Live (outside scope)                |


**Estimated:** 20–40% reduction in background subscription/poll work with 3–4 persistent groups (per plan).

---

## 6. Lookup Reduction

Indirect — inactive pages no longer rerun `useMemo` chains driven by slice updates (e.g. `useLookupMaps` rebuild fan-out stops when gated).

---

## 7. Memoization Improvements

Inactive pages skip rerender entirely from AppState notifications (conditional `useSyncExternalStore` subscribe noop).

---

## 8. Functional Verification


| Check              | Result                                        |
| ------------------ | --------------------------------------------- |
| `npm run build`    | **PASS** (2026-06-19)                         |
| Lint               | **PASS**                                      |
| Pages stay mounted | ✅ CSS hide unchanged                          |
| Feature flag       | ✅ `VITE_PAGE_ACTIVE_GATE=false` bypasses gate |


**Manual QA recommended:**

- Multi-page navigation with RENTAL pin — state preserved on return.
- Socket update while inactive → activate page → data refreshes via invalidation.
- Dashboard metrics load when dashboard active.

---

## 9. Synchronization Safety Verification


| System                               | Changed?                           |
| ------------------------------------ | ---------------------------------- |
| `emitEntityEvent` / socket ingress   | ❌ No                               |
| `RealtimeDispatchHub`                | ❌ No                               |
| AppContext patch pipeline            | ❌ No                               |
| React Query invalidation on activate | ✅ Additive only (page-scoped keys) |


AppState still receives patches globally; inactive pages simply do not rerender until activated.

---

## 10. Performance Comparison


| Metric                                      | Before (4 hidden groups) | After                          |
| ------------------------------------------- | ------------------------ | ------------------------------ |
| AppState subscriptions in inactive groups   | Full                     | **0 (frozen)**                 |
| Background RQ polls (dashboard + analytics) | Up to 4 groups           | **1 active group**             |
| Rerenders on unrelated slice change         | All mounted groups       | **Active group + chrome only** |


---

## 11. Risk Assessment


| Risk                        | Level  | Mitigation                               |
| --------------------------- | ------ | ---------------------------------------- |
| Stale data on return        | Medium | `invalidatePageGroupQueries` on activate |
| Missed live UI while hidden | Low    | Expected — refresh on activate           |
| Header regression           | Low    | Outside `PageActiveScope`                |
| Rollback                    | Low    | Env flag                                 |


---

## 12. Rollback Procedure

1. Set `VITE_PAGE_ACTIVE_GATE=false` and rebuild, **or**
2. `git revert` A2.3 commits

No database/API changes.

---

## Mandatory Questions


| #   | Question                              | Answer                                                     |
| --- | ------------------------------------- | ---------------------------------------------------------- |
| 1   | Subscriptions before (inactive page)? | **Full live Zustand + context subs**                       |
| 2   | Subscriptions after (inactive page)?  | **0 AppState subs** (frozen snapshot)                      |
| 3   | Lookups before?                       | Rebuilt on every slice change in hidden trees              |
| 4   | Lookups after?                        | **Skipped** until page reactivated                         |
| 5   | Container/View introduced?            | **N/A** — context scope pattern (not A2.2 split)           |
| 6   | Synchronization affected?             | **No** (ingress unchanged; activate invalidation additive) |
| 7   | React Query affected?                 | **Yes — polling gated**; invalidation on activate only     |
| 8   | Expected performance gain?            | **20–40%** background work reduction (per plan)            |


---

## Stop Condition

**STOP.** A2.4, A3, A4 not started. Awaiting review and approval.





## Known Limitation

Inactive pages intentionally operate on a frozen state snapshot.

Realtime updates received while a page is inactive may not be reflected until the page becomes active again.

This is expected behavior.

When a page becomes active:

- Page-scoped React Query caches are invalidated

- Fresh data is requested

- UI is synchronized

This tradeoff is intentional and significantly reduces unnecessary background processing.
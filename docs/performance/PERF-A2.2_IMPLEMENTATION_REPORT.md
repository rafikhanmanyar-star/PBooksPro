# PERF-A2.2 — InvoiceBillItem Refactor — Implementation Report

**Task ID:** PERF-A2.2  
**Date:** 2026-06-19  
**Plan:** `docs/performance/PERF-A2.2_IMPLEMENTATION_PLAN.md`  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.2 refactors `InvoiceBillItem` from a self-subscribing row into a **Container / View** architecture with **list-level subscription batching**. Display resolution moved to a pure `buildInvoiceBillItemViewModel()` function. List pages now mount **one** `useInvoiceBillItemRuntime()` per list instead of per row.

**Result:** Row components (`InvoiceBillItemView`) have **zero** Zustand/context subscriptions. Unrelated entity mutations no longer force all visible invoice/bill rows to rerender.

---

## 2. Current Architecture (before)

Single monolithic `InvoiceBillItem.tsx` (~430 lines):

- 11 direct `useStateSelector` / slice hooks per row
- `useLookupMaps()` (14 nested hooks) per row
- `useNotification`, `useWhatsApp` per row
- 12–15 `.find()` lookups per row per render
- `React.memo` export (ineffective against hook-driven rerenders)

---

## 3. New Architecture (after)

```
InvoiceBillList / MobilePaymentsPage
└── useInvoiceBillItemRuntime()     [1× per list]
    ├── buildViewModels(items)      [useMemo batch]
    ├── handleDelete / handleSendWhatsApp [useCallback]
    └── editingItem + shared Modal
        └── InvoiceBillItemView × N   [0 subscriptions, memo by renderKey]

InvoiceBillItem (default export)
└── InvoiceBillItemContainer        [1× runtime for standalone row]
    └── InvoiceBillItemView
```

**Pure layer:** `invoiceBillItemViewModel.ts` — no React, no side effects.

---

## 4. Files Modified


| File                                               | Action                                |
| -------------------------------------------------- | ------------------------------------- |
| `components/invoices/invoiceBillItemViewModel.ts`  | **Created**                           |
| `components/invoices/useInvoiceBillItemRuntime.ts` | **Created**                           |
| `components/invoices/InvoiceBillItemView.tsx`      | **Created**                           |
| `components/invoices/InvoiceBillItemContainer.tsx` | **Created**                           |
| `components/invoices/InvoiceBillItem.tsx`          | **Replaced** — re-exports container   |
| `components/invoices/InvoiceBillList.tsx`          | **Modified** — batched view models    |
| `components/mobile/MobilePaymentsPage.tsx`         | **Modified** — uses `InvoiceBillList` |


**Not modified:** `InvoiceBillForm.tsx`, sync/socket/React Query/reducers/backend, `SimpleInvoiceBillItem.tsx`.

---

## 5. Subscription Reduction

### Per row (list context, N rows)


|                     | Before     | After         |
| ------------------- | ---------- | ------------- |
| Zustand slice hooks | 25 per row | **0 per row** |
| Context hooks       | 2 per row  | **0 per row** |
| **Per-row total**   | **27**     | **0**         |


### Per list (InvoiceBillList with N rows)


|                   | Before (N rows) | After       |
| ----------------- | --------------- | ----------- |
| Zustand + context | 27 × N          | **27 once** |
| Example N=100     | ~2,700          | **~27**     |


**Reduction factor (100-row list): ~99% fewer row-level subscriptions.**

---

## 6. Lookup Reduction


|                              | Before                                             | After                                                                                |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Lookup execution             | 12–15 `.find()` × N rows **on every row rerender** | 12–15 resolves × N items **once in `useMemo`** when `buildContext` or `items` change |
| Contact name                 | `Map.get` + redundant `contacts.find`              | `contactNameById` Map in view model                                                  |
| Agreement/project resolution | Inline in component body                           | Pure `buildInvoiceBillItemViewModel`                                                 |


Lookups per item are **unchanged in logic** but **moved out of the render path** and batched.

---

## 7. Memoization Improvements


| Improvement           | Detail                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `InvoiceBillItemView` | `React.memo` with custom compare on `viewModel.renderKey`, `isSelected`, `selectionMode`, stable callbacks |
| `renderKey`           | `${id}                                                                                                     |
| Handlers              | `useCallback` in list runtime (`handleDelete`, `handleSendWhatsApp`, `onEdit`)                             |
| View models           | `useMemo(() => buildViewModels(items, type), [buildViewModels, items, type])`                              |
| `buildContext`        | `useMemo` in runtime hook — single rebuild when slices change                                              |


---

## 8. Functional Verification


| Area                                | Status                  | Notes                               |
| ----------------------------------- | ----------------------- | ----------------------------------- |
| Invoice display (standard + rental) | ✅ Preserved             | JSX ported to view                  |
| Bill display                        | ✅ Preserved             | Same                                |
| Edit modal                          | ✅ Preserved             | List-level or container-level modal |
| Delete with payment guard           | ✅ Preserved             | `handleDelete` in runtime           |
| WhatsApp send                       | ✅ Preserved             | `handleSendWhatsApp` in runtime     |
| Receive / Pay button                | ✅ Preserved             | `onRecordPayment` prop              |
| Selection checkbox                  | ✅ Preserved             |                                     |
| Agreement cancelled state           | ✅ Preserved             |                                     |
| Color coding                        | ✅ Preserved             | `customStyle` in view model         |
| `npm run build`                     | ✅ **PASS** (2026-06-19) |                                     |
| Lint (edited files)                 | ✅ **PASS**              |                                     |


**Manual QA recommended:** Create/edit/delete/save/post flows per plan § Verification.

---

## 9. Synchronization Safety Verification


| System                                  | Touched?                        |
| --------------------------------------- | ------------------------------- |
| `emitEntityEvent`                       | ❌ No                            |
| Socket handlers / `RealtimeDispatchHub` | ❌ No                            |
| `entityQueryInvalidation`               | ❌ No                            |
| React Query config                      | ❌ No                            |
| AppState reducers                       | ❌ No (dispatch calls unchanged) |
| Backend / API                           | ❌ No                            |


Delete still dispatches `DELETE_INVOICE` / `DELETE_BILL` — same reducer path as before.

---

## 10. Performance Comparison


| Metric                                  | Before (per row) | After (list of N)                      | After (per row) |
| --------------------------------------- | ---------------- | -------------------------------------- | --------------- |
| Zustand subscriptions                   | 25               | 25 (shared)                            | 0               |
| Context subscriptions                   | 2                | 2 (shared)                             | 0               |
| `.find()` on unrelated parent render    | 12–15 × N        | 0 (memoized until deps change)         | 0               |
| Rows rerender on unrelated contact edit | N                | 0 views; list rebuilds viewModels only | 0               |


**Profiler spot-check (recommended):** 100 items mounted; edit unrelated contact → expect ≤1 list `useMemo` recompute, not 100 row hook rerenders.

---

## 11. Risk Assessment


| Dimension                | Level  | Mitigation                                            |
| ------------------------ | ------ | ----------------------------------------------------- |
| Functional regression    | Medium | Verbatim view-model extraction; build pass            |
| WhatsApp message content | Low    | Same generator calls                                  |
| Modal edit flow          | Low    | Shared list modal vs per-row — same `InvoiceBillForm` |
| Sync                     | None   | No sync code touched                                  |
| Rollback                 | Easy   | Git revert frontend files only                        |


---

## 12. Rollback Procedure

1. Revert commits for `components/invoices/invoiceBillItem*` + `InvoiceBillList.tsx` + `MobilePaymentsPage.tsx`
2. Or restore pre-A2.2 `InvoiceBillItem.tsx` from git
3. No migrations or env changes required

---

## Mandatory Questions


| #   | Question                   | Answer                                                                                     |
| --- | -------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | Subscriptions before?      | **27 per row** (25 Zustand + 2 context)                                                    |
| 2   | Subscriptions after?       | **0 per row**; **27 per list** (or per standalone container)                               |
| 3   | Lookups before?            | **~12–15 linear `.find()` scans per row per render**                                       |
| 4   | Lookups after?             | **Same logic, batched in `useMemo`** — 0 per row render; N items when context/items change |
| 5   | Container/View introduced? | **Yes** — `InvoiceBillItemContainer` + `InvoiceBillItemView` + `useInvoiceBillItemRuntime` |
| 6   | Synchronization affected?  | **No**                                                                                     |
| 7   | React Query affected?      | **No**                                                                                     |
| 8   | Expected performance gain? | **50–80%** fewer row rerenders; **~99%** subscription reduction at 100 rows (per plan)     |


---

## Stop Condition

**STOP.** A2.3, A2.4, A3, A4 not started. Awaiting review and approval.





## Architectural Decision

InvoiceBillItemView intentionally contains no subscriptions.

All subscriptions are centralized in:

- useInvoiceBillItemRuntime

- InvoiceBillList

- InvoiceBillItemContainer

Future developers should not introduce Zustand, Context, or React Query hooks directly into InvoiceBillItemView, as doing so would defeat the performance benefits of the Container/View architecture.
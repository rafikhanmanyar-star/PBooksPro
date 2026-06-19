# PERF-A2.2 — InvoiceBillItem Refactor — Implementation Plan

**Task ID:** PERF-A2.2  
**Date:** 2026-06-19  
**Authority:** `docs/performance/PERFORMANCE_AUDIT_V1.md` (C4), `docs/performance/PERFORMANCE_IMPLEMENTATION_PLAN_V1.md` (§ A2.2)  
**Status:** Approved architecture — **implementation complete**

---

## 1. Executive Summary

`InvoiceBillItem` was a **CRITICAL** render hotspot: every list row mounted **25 Zustand slice subscriptions** plus **2 React contexts**, defeating `React.memo`. The approved fix is a **Container / View split** with **list-level subscription batching** via `useInvoiceBillItemRuntime`.

**Architecture verdict:** ✅ Approved per `PERFORMANCE_IMPLEMENTATION_PLAN_V1.md` § A2.2. Implementation proceeded.

---

## 2. Phase 1 — Analysis

### 2.1 Current Component Tree (before)

```
InvoiceBillList / MobilePaymentsPage
└── InvoiceBillItem (React.memo — ineffective)
    ├── 11× useStateSelector slice hooks
    ├── useLookupMaps() → 14× nested slice hooks
    ├── useDispatchOnly
    ├── useNotification (context)
    ├── useWhatsApp (context)
    ├── useState(isEditModalOpen)
    ├── Inline .find() lookups (×12–15 per render)
    ├── useMemo(customStyle)
    ├── Card / rental compact JSX
    └── Modal → InvoiceBillForm
```

**Children rendered:** Card UI, action buttons, optional checkbox, edit Modal.

**Consumers:**

| File | Pattern |
|------|---------|
| `components/invoices/InvoiceBillList.tsx` | N × `InvoiceBillItem` |
| `components/mobile/MobilePaymentsPage.tsx` | N × `InvoiceBillItem` |
| `components/dashboard/SimpleInvoiceBillItem.tsx` | Separate simplified row (out of scope) |

### 2.2 Subscription Inventory (before — per row)

| Source | Hooks / subscriptions |
|--------|----------------------|
| Direct slice hooks | `useContacts`, `useProjectAgreements`, `useRentalAgreements`, `useUnits`, `useProperties`, `useBuildings`, `useProjects`, `useWhatsAppMode`, `useWhatsAppTemplates`, `useInvoices`, `useStateSelector(selectEnableColorCoding)` → **11** |
| `useLookupMaps()` | `useAccounts`, `useCategories`, `useContacts`, `useVendors`, `useProjects`, `useBuildings`, `useProperties`, `useInvoices`, `useBills`, `useUnits`, `useContracts`, `useRentalAgreements`, `useProjectAgreements`, `useUsers` → **14** |
| Context | `useNotification`, `useWhatsApp` → **2** |
| React Query | **None** |
| **Total per row** | **27 reactive subscriptions** (25 Zustand + 2 context) |

For a list of **100 rows**: **~2,700** reactive subscriptions.

### 2.3 Lookup Inventory (before — per row per render)

| Lookup type | Mechanism | Count per row |
|-------------|-----------|---------------|
| Contact name | `lookups.contacts.get` + `contacts.find` | 2 |
| Project agreement | `projectAgreements.find` | 2 |
| Rental agreement | `rentalAgreements.find` | 1 |
| Unit | `units.find` | 2 |
| Property | `properties.find` | 1 |
| Building | `buildings.find` | 2 |
| Project | `projects.find` | 2 (+2 in `customStyle` useMemo) |
| Staff contact | `contacts.find` | 1 |
| **Total linear scans** | `.find()` on arrays | **~12–15** |

Maps from `useLookupMaps` were available but **underused** — most resolution still used `.find()`.

### 2.4 Render Triggers (before)

| Trigger | Effect |
|---------|--------|
| Any subscribed slice mutation (contacts, invoices, bills, projects, …) | **All N rows** rerender |
| `useLookupMaps` rebuild | **All N rows** rerender |
| Parent prop change (`onRecordPayment` inline) | Row rerender if reference unstable |
| `React.memo` on item | **Does not help** — hooks inside component always rerun |
| Local `isEditModalOpen` | Single row only |

**Root cause:** Self-subscribing row anti-pattern (audit C4).

---

## 3. Proposed Architecture (approved)

### 3.1 Target flow

```
InvoiceBillList (list container)
├── useInvoiceBillItemRuntime()          ← subscriptions ONCE per list
│   ├── 11 slice hooks + useLookupMaps (14)
│   ├── useNotification, useWhatsApp
│   └── stable useCallback handlers
├── useMemo → buildInvoiceBillItemViewModels(items)
├── useState(editingItem) → single shared Modal
└── map → InvoiceBillItemView (pure, memo + renderKey compare)

InvoiceBillItemContainer (single-row fallback)
├── useInvoiceBillItemRuntime()
├── useMemo → buildInvoiceBillItemViewModel(item)
└── InvoiceBillItemView + local Modal

invoiceBillItemViewModel.ts (pure)
└── buildInvoiceBillItemViewModel(item, type, ctx) → ViewModel
```

### 3.2 Expected benefits

| Metric | Before (100 rows) | After (100 rows) |
|--------|-------------------|------------------|
| Zustand subscriptions | ~2,500 | **~25** (once per list) |
| Context subscriptions | ~200 | **~2** |
| Row rerender on unrelated slice change | ~100 rows | **0 rows** (view has no hooks) |
| Row rerender on own item change | 1 row | **1 row** (`renderKey` compare) |
| Lookup work | 12–15 × N per parent render | **N in one `useMemo` batch** |

**Estimated gain:** 50–80% fewer row rerenders (per implementation plan).

---

## 4. Implementation Scope

### 4.1 Files

| File | Action |
|------|--------|
| `components/invoices/invoiceBillItemViewModel.ts` | **Create** — pure view-model builder |
| `components/invoices/useInvoiceBillItemRuntime.ts` | **Create** — shared subscriptions + handlers |
| `components/invoices/InvoiceBillItemView.tsx` | **Create** — pure presentational row |
| `components/invoices/InvoiceBillItemContainer.tsx` | **Create** — single-row container |
| `components/invoices/InvoiceBillItem.tsx` | **Replace** — re-export container |
| `components/invoices/InvoiceBillList.tsx` | **Modify** — batch view models + shared modal |
| `components/mobile/MobilePaymentsPage.tsx` | **Modify** — use `InvoiceBillList` |

### 4.2 Out of scope (unchanged)

- `InvoiceBillForm.tsx` (create/edit/save/post logic)
- `SimpleInvoiceBillItem.tsx`
- Sync, sockets, React Query, reducers, backend
- Tax / ledger / calculation logic

### 4.3 Strict rules compliance

| Rule | Status |
|------|--------|
| No business logic changes | ✅ Display resolution extracted verbatim |
| No sync changes | ✅ No emit/socket/invalidation touched |
| No React Query changes | ✅ None in this component |
| No backend changes | ✅ Frontend-only |

---

## 5. Migration Steps (executed)

1. ✅ `buildInvoiceBillItemViewModel()` pure function
2. ✅ `InvoiceBillItemView` — JSX copied; hooks replaced with props
3. ✅ `useInvoiceBillItemRuntime` — consolidated subscriptions + handlers
4. ✅ `InvoiceBillList` — batch view models; list-level edit modal
5. ✅ `MobilePaymentsPage` — switched to `InvoiceBillList`
6. ✅ `InvoiceBillItem.tsx` — backward-compatible re-export

---

## 6. Verification Plan

| Check | Method |
|-------|--------|
| Build | `npm run build` |
| Lint | IDE diagnostics on edited files |
| Functional | Create/edit/delete/save/post invoices & bills; WhatsApp; payment |
| Accounting | Totals/tax unchanged (no calculation code touched) |
| Sync | No sync files modified — manual multi-user smoke |
| Performance | Subscription count comparison (documented in report) |

---

## 7. Rollback Procedure

1. `git revert` commits touching `components/invoices/InvoiceBillItem*` and `InvoiceBillList.tsx`, `MobilePaymentsPage.tsx`
2. Restore monolithic `InvoiceBillItem.tsx` from git history
3. No database/API/env changes — rollback < 30 minutes

---

## 8. Stop Condition

After implementation + report: **STOP**. Do not start A2.3, A2.4, A3, or A4.

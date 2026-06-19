# PERF-A2.5.4 — Dead Query Path Cleanup — Implementation Report

**Task ID:** PERF-A2.5.4  
**Date:** 2026-06-19  
**Spec:** `docs/performance/A2.5_IMPLEMENTATION_SPEC.md` (Task PERF-A2.5.4)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.5.4 removes two exported React Query hooks with **zero runtime consumers**, plus their orphan query key definitions. This is code hygiene only — no fetch behavior, sync paths, or active rollup queries were changed.

**Removed:** `useInvoicesApiListQuery` (entire file) and `useMonthlyRentalSummaryRangeQuery` (export + supporting key helper).

**Retained:** All protected hooks and keys including `usePaginatedTransactions`, `queryKeys.ledger.*`, and `useAllOwnerBalancesRollupQuery`.

**Blocked path:** Not triggered — both candidates passed fresh verification with 0 consumers.

---

## 2. Candidates Reviewed

| Candidate | File | Spec assessment |
|-----------|------|-----------------|
| `useInvoicesApiListQuery` | `hooks/queries/useInvoicesApiListQuery.ts` | Dead — 0 consumers |
| `useMonthlyRentalSummaryRangeQuery` | `hooks/queries/useRentalRollupQueries.ts` | Dead — 0 consumers |

---

## 3. Verification Results

### `useInvoicesApiListQuery`

| Check | Result |
|-------|--------|
| **File path** | `hooks/queries/useInvoicesApiListQuery.ts` |
| **Global search** (`useInvoicesApiListQuery`) | 1 definition + docs only |
| **Import search** (`from '...useInvoicesApiListQuery'`) | **0** |
| **Export search** | 1 export in deleted file only |
| **Dynamic import** | **None** |
| **Test dependency** | **None** |
| **Consumer count** | **0** |
| **Safe removal** | **Yes** |

**Note:** `InvoicesApiRepository` is still used directly (e.g. `ProjectAgreementForm.tsx`, `MarketingPage.tsx` via dynamic import) — that is **not** the React Query hook and was not removed.

### `useMonthlyRentalSummaryRangeQuery`

| Check | Result |
|-------|--------|
| **File path** | `hooks/queries/useRentalRollupQueries.ts` (export only) |
| **Global search** | 1 definition + docs only |
| **Import search** (`from '...useRentalRollupQueries'`) | 2 files — both import `useAllOwnerBalancesRollupQuery` only |
| **Dynamic import** | `AppContext.tsx` imports module for `rentalRollupQueryKeys` only (invalidation) — **does not use monthly hook** |
| **Test dependency** | **None** |
| **Consumer count** | **0** |
| **Safe removal** | **Yes** |

### Protected items (verified untouched)

| Item | Consumer | Action |
|------|----------|--------|
| `usePaginatedTransactions` | `EnhancedLedgerPage.tsx`, `useNativeTransactions.ts` | **Retained** |
| `queryKeys.ledger.paginated` / `count` | A4 placeholder | **Retained** |
| `useAllOwnerBalancesRollupQuery` | `OwnerPayoutsPage.tsx`, `PropertyLayoutReport.tsx` | **Retained** |
| `rentalRollupQueryKeys.root` | `AppContext.tsx` invalidation | **Retained** |
| `queryKeys.rental.invoicesList()` | Rental warm cache | **Retained** |

---

## 4. Files Removed

| File | Action |
|------|--------|
| `hooks/queries/useInvoicesApiListQuery.ts` | **Deleted** |

---

## 5. Exports Removed

| Export | Former location |
|--------|-----------------|
| `useInvoicesApiListQuery` | `hooks/queries/useInvoicesApiListQuery.ts` |
| `useMonthlyRentalSummaryRangeQuery` | `hooks/queries/useRentalRollupQueries.ts` |

**Also removed (dead helpers tied to monthly hook only):**

- `rentalRollupQueryKeys.monthlyRange()`
- `monthKey()` private helper

---

## 6. Query Keys Removed

| Key | Former definition | Reason |
|-----|-------------------|--------|
| `['invoices', 'api', filtersKey]` | `queryKeys.invoices.apiList()` | Only used by deleted `useInvoicesApiListQuery` |
| `['rentalRollup', 'monthly', start, end]` | `rentalRollupQueryKeys.monthlyRange()` | Only used by deleted monthly hook |

**Retained keys:**

- `queryKeys.invoices.all` — entity invalidation / warm paths
- `rentalRollupQueryKeys.ownerBalancesAll()` — active rollup consumers
- `rentalRollupQueryKeys.root` — broad invalidation in `AppContext`

---

## 7. Build Verification

| Check | Command | Result |
|-------|---------|--------|
| Production build | `npm run build` | **PASS** (~25s) |
| IDE lint (modified files) | Cursor diagnostics | **PASS** |
| Post-removal symbol grep (`.ts`/`.tsx`) | `useInvoicesApiListQuery`, `useMonthlyRentalSummaryRangeQuery`, `apiList`, `monthlyRange` | **0 matches** |

---

## 8. Runtime Verification

| Area | Before | After |
|------|--------|-------|
| Broken imports | N/A | **None** — build passes |
| Owner Payouts rollup | `useAllOwnerBalancesRollupQuery` | **Unchanged** |
| Property Layout rollup | `useAllOwnerBalancesRollupQuery` | **Unchanged** |
| Rental invoices warm cache | `queryKeys.rental.invoicesList()` | **Unchanged** |
| Enhanced Ledger | `usePaginatedTransactions` | **Unchanged** |
| Reports / dashboards | No dependency on removed hooks | **Unchanged** |

---

## 9. Synchronization Safety Verification

| System | Changed? |
|--------|----------|
| Socket.IO handlers | **No** |
| `RealtimeDispatchHub` | **No** |
| `entityQueryInvalidation.ts` | **No** |
| AppContext rollup invalidation (`rentalRollupQueryKeys.root`) | **No** — still imports same module |
| React Query staleTime / gcTime | **No** |
| Entity queue / AppState | **No** |

**Conclusion:** Real-time synchronization and invalidation behavior are unchanged. Removed code was never subscribed at runtime.

---

## 10. Risk Assessment

| Dimension | Level | Notes |
|-----------|-------|-------|
| Breaking imports | **None** | Grep + build confirm 0 consumers |
| Active feature regression | **None** | Dead paths only |
| Sync regression | **None** | Invalidation paths untouched |
| Future feature impact | **Low** | See mandatory Q4 below |

---

## 11. Rollback Procedure

1. Restore `hooks/queries/useInvoicesApiListQuery.ts` from git history.
2. Restore `apiList` in `hooks/queries/queryKeys.ts`.
3. Restore `useMonthlyRentalSummaryRangeQuery`, `monthlyRange`, and `monthKey` in `useRentalRollupQueries.ts`.
4. **Estimated time:** < 10 minutes (per spec).

---

## 12. Remaining Dead Code Opportunities

Deferred — **not in A2.5.4 scope:**

| Item | Notes |
|------|-------|
| `usePaginatedTransactions` misleading name | Active consumer — A4 replacement |
| `queryKeys.ledger.paginated` / `count` | A4 placeholder — keep |
| `queryKeys.reports.orgUsers()` deprecated alias | Remove after one release (A2.5.3) |
| `doc/PERFORMANCE_OPTIMIZATION.md` | Still mentions removed `useInvoicesApiListQuery` — doc drift only |

---

## Consumer Verification Summary

| Hook | Before removal | After removal |
|------|----------------|---------------|
| `useInvoicesApiListQuery` | **0** | **N/A (deleted)** |
| `useMonthlyRentalSummaryRangeQuery` | **0** | **N/A (removed)** |
| `useAllOwnerBalancesRollupQuery` | **2** | **2** (unchanged) |
| `usePaginatedTransactions` | **2** (ledger + deprecated alias) | **2** (unchanged) |

---

## Mandatory Questions

### 1. Which hooks were removed?

- **`useInvoicesApiListQuery`** — entire file deleted.
- **`useMonthlyRentalSummaryRangeQuery`** — export removed from `useRentalRollupQueries.ts`.

### 2. Which hooks were retained?

- **`useAllOwnerBalancesRollupQuery`** — active rental rollup (Owner Payouts, Property Layout).
- **`useOrgUsersQuery`** — not in scope; unchanged.
- **`usePaginatedTransactions`** — protected; used by Enhanced Ledger.
- All other active query hooks in `hooks/queries/` unchanged.

### 3. Why were retained hooks kept?

- **`useAllOwnerBalancesRollupQuery`:** 2 live consumers + AppContext invalidation via `rentalRollupQueryKeys.root`.
- **`usePaginatedTransactions`:** Explicitly protected until A4 ledger pagination; used by `EnhancedLedgerPage`.
- **`queryKeys.ledger.*`:** A4 pagination infrastructure placeholder per spec.

### 4. Could any future feature depend on the removed hooks?

**Possibly, but intentionally deferred:**

- **`useInvoicesApiListQuery`** was designed for a cached full-list `GET /invoices` path that was never wired. A future API-mode invoice list screen would need a **new** hook (likely paginated per A3/A4), not resurrection of this dead full-fetch helper.
- **`useMonthlyRentalSummaryRangeQuery`** was an unused monthly summary chart/KPI path. Rental analytics dashboards could reintroduce monthly rollup via a new implementation aligned with A3 pagination limits.

Removing dead exports **reduces risk** of accidentally wiring a full-list invoice fetch.

### 5. Was synchronization affected in any way?

**No.** Socket handlers, `RealtimeDispatchHub`, `entityQueryInvalidation`, and AppContext rollup invalidation were not modified. Removed hooks had zero subscribers and zero invalidation registrations.

---

**STOP:** A2.1, A2.2, A2.3, A2.4, A3, and A4 were not started. Awaiting review and approval.

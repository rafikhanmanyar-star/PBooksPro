# PERF-A2.5.3 — React Query Cleanup — Implementation Report

**Task ID:** PERF-A2.5.3  
**Date:** 2026-06-19  
**Spec:** `docs/performance/A2.5_IMPLEMENTATION_SPEC.md` (Task PERF-A2.5.3)  
**Status:** Implementation complete — **awaiting review**

---

## 1. Executive Summary

PERF-A2.5.3 consolidates duplicate React Query cache entries for `GET /users` into a single canonical key `['orgUsers']`. Previously, the Marketing Activity report (`useOrgUsersQuery`) and Report Share panel (`['orgUsersForShare']`) maintained separate caches for identical data, causing duplicate network fetches and leaving the share panel stale after contact/user invalidation.

**Changes:** Added `queryKeys.orgUsers()`, migrated consumers, aligned `entityQueryInvalidation.ts` in the same change set, and removed the dead `['orgUsersForShare']` key.

**Out of scope (unchanged):** staleTime/gcTime, pagination, infinite queries, workflow broad invalidation, PO/GRN keys, dead hook removal (A2.5.4), sync/socket/reducer logic.

---

## 2. Pre-Implementation Verification

### Duplicate query inventory (confirmed)

| Key (before) | Endpoint | Consumer | Same data? |
|--------------|----------|----------|------------|
| `['reports', 'orgUsers']` | `GET /users` | `hooks/queries/useOrgUsersQuery.ts` → `MarketingActivityReport.tsx` | Yes |
| `['orgUsersForShare']` | `GET /users` | `ReportSharePanel.tsx` inline `useQuery` | Yes |

**Assumption verified:** Both keys target `apiClient.get('/users')` with the same full-list response shape. **Confirmed** by code inspection.

### Invalidation gap (before)

| Entity event | Invalidated key | Share panel key invalidated? |
|--------------|-----------------|------------------------------|
| `contact` | `['contacts']`, `['reports', 'orgUsers']` | **No** — `['orgUsersForShare']` orphaned |
| `user` | `['reports', 'orgUsers']` | **No** — `['orgUsersForShare']` orphaned |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `hooks/queries/queryKeys.ts` | Added `queryKeys.orgUsers()`; deprecated alias `queryKeys.reports.orgUsers()`; canonical key documentation |
| `hooks/queries/useOrgUsersQuery.ts` | Uses `queryKeys.orgUsers()`; optional `{ enabled }` for conditional fetch |
| `modules/report-designer/components/ReportSharePanel.tsx` | Replaced inline duplicate query with `useOrgUsersQuery({ enabled })` |
| `services/realtime/entityQueryInvalidation.ts` | Contact/user paths use `queryKeys.orgUsers()` |
| `tests/entityQueryInvalidation.test.ts` | Added contact/user invalidation tests for canonical key |

**Not modified:** `MarketingActivityReport.tsx` (already uses `useOrgUsersQuery()` — inherits new key automatically).

---

## 4. Duplicate Query Keys Removed

| Removed key | Replaced by | Status |
|-------------|-------------|--------|
| `['orgUsersForShare']` | `queryKeys.orgUsers()` → `['orgUsers']` | **Removed** — zero remaining references |
| `['reports', 'orgUsers']` (primary) | `queryKeys.orgUsers()` → `['orgUsers']` | **Migrated** — deprecated alias retained one release |

**Before (2 cache entries for `/users`):**

```
['reports', 'orgUsers']     ← useOrgUsersQuery
['orgUsersForShare']        ← ReportSharePanel inline
```

**After (1 shared cache entry):**

```
['orgUsers']                ← useOrgUsersQuery + ReportSharePanel (via hook)
```

---

## 5. Canonical Query Keys

### New top-level key

```typescript
queryKeys.orgUsers()  // → ['orgUsers']  — GET /users
```

### Deprecated alias (one release)

```typescript
queryKeys.reports.orgUsers()  // → ['orgUsers']  (same function reference)
```

### Documentation added

`hooks/queries/queryKeys.ts` header comment lists canonical keys and **do-not-duplicate** endpoints per spec C2.

---

## 6. Invalidation Changes

**Mandatory safety rule:** Key rename and invalidation updated in the **same change set**.

| Entity | Before | After | Path |
|--------|--------|-------|------|
| `contact` | `[['contacts'], queryKeys.reports.orgUsers()]` | `[['contacts'], queryKeys.orgUsers()]` | `entityQueryInvalidation.ts` line ~190 |
| `user` | `[queryKeys.reports.orgUsers()]` | `[queryKeys.orgUsers()]` | `entityQueryInvalidation.ts` line ~242 |

**Effect:** Report Share panel user dropdown now participates in the same invalidation path as Marketing Activity report and any future `useOrgUsersQuery()` consumer.

### Unit test coverage

| Test | Assertion |
|------|-----------|
| `contact invalidates contacts and canonical orgUsers key` | `['orgUsers']` invalidated; legacy keys absent |
| `user invalidates canonical orgUsers key` | Only `['orgUsers']` invalidated |

---

## 7. Build Verification

| Check | Command | Result |
|-------|---------|--------|
| Production build | `npm run build` | **PASS** (~26s) |
| Invalidation tests | `npx tsx --test tests/entityQueryInvalidation.test.ts` | **PASS** (7/7) |
| IDE lint (modified files) | Cursor diagnostics | **PASS** — no new errors |

**Note:** No standalone `npm run lint` script exists; TypeScript validated via Vite build.

---

## 8. Functional Verification

Static/structural verification (manual smoke recommended for reviewer):

| Area | Verification |
|------|--------------|
| **orgUsers load** | `useOrgUsersQuery()` uses `queryKeys.orgUsers()` + `GET /users` — unchanged fetch |
| **Marketing Activity report** | Still calls `useOrgUsersQuery()` with default `enabled: true` |
| **Report Share panel** | `useOrgUsersQuery({ enabled: definitionId && canManage && shareMode === 'user' })` — same conditional fetch, shared cache |
| **User lookup** | Dropdown maps `usersQuery.data` — unchanged render path |
| **Cache dedup** | Opening report then share panel (or vice versa) reuses `['orgUsers']` cache entry |

**Recommended manual tests (spec T-A2.5.3-01 through -04):** Marketing report users, share panel dropdown, network tab single `/users` fetch, contact/user update refresh.

---

## 9. Synchronization Safety Verification

| System | Changed? | Verification |
|--------|----------|--------------|
| Socket.IO handlers | **No** | Not touched |
| `RealtimeDispatchHub` | **No** | Not touched |
| Entity queue / AppState reducer | **No** | Not touched |
| React Query staleTime / gcTime | **No** | Defaults unchanged |
| Invalidation **semantics** | **Improved** | Same events fire; share panel now included |
| Broad `['workflow']` invalidation | **No** | Per spec — not changed |

**Conclusion:** Real-time entity events still route through `invalidateQueriesForEntityEvent`. Contact/user updates now correctly refresh the unified org-users cache used by both report and share UI.

---

## 10. Risk Assessment

| Dimension | Level | Notes |
|-----------|-------|-------|
| Functional regression | **Low** | Same endpoint, same response type |
| Stale share panel users | **Fixed** | Was a pre-existing gap (D4 in spec) |
| Sync regression | **Low** | Invalidation aligned atomically with key rename |
| Cache miss on deploy | **Low** | One extra fetch acceptable; alias preserves backward compat for any legacy `reports.orgUsers()` callers |

---

## 11. Rollback Procedure

1. Revert the 5 modified files in a single commit (key + invalidation must stay paired).
2. Old keys `['reports', 'orgUsers']` and `['orgUsersForShare']` will resume as separate caches.
3. No database, API, or env changes to undo.
4. **Estimated rollback time:** ~15 minutes (per spec).

---

## 12. Expected Performance Gain

| Metric | Estimate (per spec) |
|--------|---------------------|
| Network requests | **−1 duplicate** `GET /users` when report + share opened in same session |
| Memory | **~10–50 KB** (one cache entry vs two) |
| Invalidation correctness | Share panel no longer holds stale user list after contact/user events |
| User-perceived impact | Minor; hygiene improvement enabling future A3 work |

---

## 13. Remaining React Query Cleanup Opportunities

Deferred per spec — **not implemented in A2.5.3:**

| Item | Task | Notes |
|------|------|-------|
| `useInvoicesApiListQuery` | **A2.5.4** | Zero consumers — dead hook removal |
| `useMonthlyRentalSummaryRangeQuery` | **A2.5.4** | Zero consumers |
| `queryKeys.invoices.apiList` | **A2.5.4** | Orphan if dead hook removed |
| PO/GRN pagination | **A3** | Out of scope |
| Owner balances limit | **A3** | Out of scope |
| Broad `['workflow']` invalidation | Sync-adjacent | Do not change without sync review |
| `usePaginatedTransactions` misleading name | Document only | Active consumer — not dead |
| Remove `queryKeys.reports.orgUsers()` alias | Post one release | After grep confirms zero direct usage |

---

## Cache Verification Summary

### Before

| Query key | Endpoint | Invalidated on contact/user? |
|-----------|----------|------------------------------|
| `['reports', 'orgUsers']` | `GET /users` | Yes |
| `['orgUsersForShare']` | `GET /users` | **No** |

### After

| Query key | Endpoint | Invalidated on contact/user? |
|-----------|----------|------------------------------|
| `['orgUsers']` | `GET /users` | **Yes** (both events) |

**Duplicate removal:** 2 keys → 1 canonical key for `GET /users`.

---

**STOP:** PERF-A2.5.4, A2.1, A2.2, A2.3, A2.4, and A3 were not started. Awaiting review and approval.

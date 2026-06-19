# A3.1 — Server-Side Pagination Strategy

**Task ID:** PERF-A3.1  
**Date:** 2026-06-19  
**Status:** Foundation implemented — payroll employee ledger pilot

---

## 1. Purpose

Establish reusable **read-path** pagination for large PostgreSQL-backed lists. A3.1 is infrastructure only; additional surfaces (transactions, contacts, bills, ledgers, procurement) migrate in later A3 tasks.

**Synchronization is unchanged.** Pagination does not modify RealtimeDispatchHub, socket flows, entity queues, conflict resolution, or React Query invalidation patterns.

---

## 2. Architecture

```
Browser (usePaginatedList)
    → apiClient GET /api/v1/...?page=1&pageSize=50&filters...
        → parsePaginationQuery(req.query)
        → Repository COUNT(*) + SELECT ... LIMIT/OFFSET
        → buildPaginatedResponse(data, totalCount, page, pageSize)
    ← { data, totalCount, page, pageSize, totalPages, ...legacy }
```

### Shared types

| File | Role |
|------|------|
| `shared/types/pagination.ts` | `PaginatedResponse<T>`, `PaginationParams`, `parsePaginationQuery`, `buildPaginatedResponse` |

### Backend helpers

| File | Role |
|------|------|
| `backend/src/utils/pagination/parsePaginationQuery.ts` | Query normalization (page/pageSize **or** limit/offset) |
| `backend/src/utils/pagination/paginatedSql.ts` | SQL pattern documentation + `sqlLimitOffset` helper |
| `backend/src/utils/pagination/index.ts` | Public exports |

### Frontend helpers

| File | Role |
|------|------|
| `hooks/pagination/usePaginatedList.ts` | Accumulating page fetch + `loadMore` + `refresh` |
| `hooks/pagination/index.ts` | Re-exports + `DEFAULT_LIST_PAGE_SIZE` (50) |

---

## 3. Request / response contract

### Preferred query params (new)

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `page` | int | 1 | — |
| `pageSize` | int | 50 | endpoint-specific |

### Legacy (supported)

| Param | Notes |
|-------|-------|
| `limit` | Used when `page`/`pageSize` absent |
| `offset` | Paired with `limit` |

### Standard response fields

```json
{
  "data": [],
  "totalCount": 1200,
  "page": 1,
  "pageSize": 50,
  "totalPages": 24,
  "pagination": { "limit": 50, "offset": 0, "total": 1200 }
}
```

Domain-specific keys (e.g. payroll `transactions`, `summary`) remain during migration.

---

## 4. SQL pattern (repositories)

```sql
-- 1) Total (same WHERE as list)
SELECT COUNT(*)::int AS c
FROM <table>
WHERE tenant_id = $1 AND ...filters;

-- 2) Page
SELECT <columns>
FROM <table>
WHERE tenant_id = $1 AND ...filters
ORDER BY <stable sort>
LIMIT $n OFFSET $m;
```

Filters, search, and sort are built once in the repository; pagination helpers only normalize limit/offset.

---

## 5. Frontend `usePaginatedList`

| State | Description |
|-------|-------------|
| `items` | Accumulated rows (append on `loadMore`) |
| `totalCount` | Server total |
| `hasMore` | `page * pageSize < totalCount` |
| `loading` / `loadingMore` | First page vs append |
| `meta` | Optional per-endpoint metadata (e.g. payroll summary) |
| `resetKey` | Changing value resets to page 1 |

**Not React Query** — intentional for A3.1 pilot to avoid touching global invalidation. Future list migrations may wrap `useInfiniteQuery` using the same API contract.

---

## 6. Pilot: Payroll Employee Ledger

| Area | Before | After |
|------|--------|-------|
| API default fetch | `limit=5000` single request | `page=1&pageSize=50` |
| UI | Virtualized 5000 rows in memory | Virtualized 50+ rows; **Load more** appends pages |
| Filters | Type + client year/month on full payload | Type + **server** `year`/`month` query params |
| Summary | Server `summary` (unchanged) | Still full-employee balance from DB |
| Export | All visible rows | One-off `limit=5000` read for CSV (export escape hatch) |
| Sync | `payrollStorageRevision` / `transactions.length` triggers refresh | Same triggers — **no socket/RQ changes** |

**Endpoint:** `GET /api/v1/payroll/employees/:employeeId/ledger`

---

## 7. Migration strategy (future A3 tasks)

| Phase | Surfaces | Notes |
|-------|----------|-------|
| A3.1 ✅ | Payroll employee ledger | Foundation + pilot |
| A3.2 | Contacts, Bills | List pages + virtual tables |
| A3.3 | Transactions, Enhanced Ledger | Cursor option for 100k+ rows |
| A3.4 | Owner / Vendor / Broker ledgers | Server rollups + paginated lines |
| A3.5 | Procurement (PO, GRN) | `useInfiniteQuery` pattern |

### Checklist per surface

1. Add `COUNT` + `LIMIT/OFFSET` (or cursor) to repository.
2. Extend route with `parsePaginationQuery`.
3. Return `PaginatedResponse` + legacy fields if needed.
4. Replace client full-list fetch with `usePaginatedList` or `useInfiniteQuery`.
5. Keep virtualization; wire `loadMore` or infinite scroll.
6. Verify sync still refreshes list via existing triggers only.

---

## 8. Rollback

- Revert `PayrollHub` to single `limit: 5000` fetch.
- Backend remains backward compatible (`limit`/`offset` still work).
- Delete `hooks/pagination/` and `shared/types/pagination.ts` if abandoning program (not required for payroll-only rollback).

---

## 9. Constraints (frozen)

- RealtimeDispatchHub
- Transactional Entity Queue
- Socket.IO event ordering
- Conflict resolution / LWW
- React Query invalidation maps

Pagination is **read-only** and safe to roll forward independently.

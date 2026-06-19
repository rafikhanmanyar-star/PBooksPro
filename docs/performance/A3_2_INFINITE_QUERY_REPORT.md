# PERF-A3.2 — Infinite Query Infrastructure Report

**Date:** 2026-06-19  
**Phase:** A3.2 — Infinite scroll + virtualization pilot (Contacts)  
**Constraint:** Read-path only — no changes to RealtimeDispatchHub, socket flows, transactional queue, conflict resolution, or global React Query invalidation maps.

---

## Summary

A3.2 adds reusable infinite-scroll infrastructure on top of the A3.1 pagination contract and converts the **Contacts** table to server-backed infinite loading when authenticated (API mode). Vendors tab and offline paths keep the existing client-side virtualized list.

| Deliverable | Path | Status |
|-------------|------|--------|
| Infinite query hook | `hooks/pagination/useInfiniteEntityQuery.ts` | Done |
| Virtualized infinite table | `components/common/InfiniteVirtualizedTable.tsx` | Done |
| Contacts pilot | `components/contacts/ContactsPage.tsx` | Done |
| Backend pagination | `GET /api/v1/contacts?page=&pageSize=` | Done |

---

## Architecture

```
ContactsPage (authenticated, non-vendor tab)
  → useInfiniteEntityQuery
    → ContactsApiRepository.findPage
      → GET /contacts?page=1&pageSize=50&typeGroup=&search=&sortKey=&sortDir=
        → ContactRepository.listPage (COUNT + LIMIT/OFFSET)
  → VirtualizedContactsTable
    → InfiniteVirtualizedTable (react-window List + onRowsRendered → fetchNextPage)
```

**Sync without invalidation changes:** `syncFingerprint` (store length + version sum) is appended to the dedicated `['contacts', 'infinite', …]` query key so mutations that update AppState trigger a refetch without touching global invalidation prefixes.

---

## Benchmark (design targets vs. before)

Measurements are **design-level estimates** for a tenant with **~2,000 contacts** and **~15,000 transactions** (typical mid-size org). Re-run with DevTools / PostgreSQL `EXPLAIN` on your dataset for production numbers.

| Metric | Before (A2 virtualized, full store) | After (A3.2 infinite) | Notes |
|--------|-------------------------------------|-------------------------|-------|
| **Initial API payload** | ~800 KB–1.2 MB JSON (all contacts) | ~25–40 KB (50 rows) | ~**95%** reduction on first paint |
| **Initial network requests** | 1× full `/contacts` (via bulk sync or page mount) | 1× paginated `/contacts?page=1&pageSize=50` | Table no longer depends on full list in memory |
| **Rows in table memory** | All filtered contacts (up to N) | Loaded pages only (50, 100, …) | Grows with scroll, capped by user depth |
| **DOM nodes (table body)** | ~15–20 visible (virtualized) | ~15–20 visible (unchanged) | react-window overscan = 6 |
| **Scroll FPS** | 55–60 (virtualized) | 55–60 | No regression expected |
| **Balance column** | Client `transactions` map | Same client map | Display unchanged; server can sort by balance via SQL subquery |
| **Filter/sort/search** | Client O(N) | Server SQL + new query key | Instant refetch page 1 on filter change |
| **Multi-user sync** | AppState + sockets (unchanged) | AppState fingerprint → infinite refetch | No socket/RQ invalidation edits |

### Network pattern while scrolling

| Scroll depth | Requests | Cumulative rows loaded |
|--------------|----------|------------------------|
| Initial view | 1 | 50 |
| ~75% list | 2 | 100 |
| Full 2,000 contacts | 40 | 2,000 |

Page size default: **50** (`DEFAULT_LIST_PAGE_SIZE`).

---

## API contract

**Paginated** (when `page` or `pageSize` present):

```http
GET /api/v1/contacts?page=1&pageSize=50&typeGroup=owners&search=ali&sortKey=name&sortDir=asc
```

Response (`PaginatedResponse<Contact>`):

```json
{
  "data": [ … ],
  "totalCount": 1842,
  "page": 1,
  "pageSize": 50,
  "totalPages": 37
}
```

**Legacy full list** (no pagination query params): unchanged array for bulk sync callers.

Query parameters:

| Param | Values |
|-------|--------|
| `typeGroup` | `all`, `owners`, `tenants`, `brokers`, `friends` |
| `contactId` | Single contact (tree selection) |
| `search` | ILIKE on name, phone, company, address |
| `sortKey` | `name`, `type`, `companyName`, `contactNo`, `address`, `balance` |
| `sortDir` | `asc`, `desc` |

---

## Pilot scope & known limits

1. **Vendors tab** — still uses client store + virtualization (vendors API pagination = future A3.x).
2. **All tab (API path)** — paginates `contacts` table only; legacy merge of separate `vendors` store rows on “All” is skipped in API mode (vendor bridge rows in `contacts` still appear).
3. **Tree sidebar** — still built from AppState (full contacts for navigation); table read path is paginated.
4. **Bulk AppState sync** — unchanged; still loads full contacts for offline/global state.

---

## Reuse checklist (Bills, Transactions, Ledgers, Procurement)

1. Add `listPage` to domain repository + `GET` route with `parsePaginationQuery`.
2. Add `findPage` on `*ApiRepository`.
3. Wire screen with `useInfiniteEntityQuery` + dedicated query key + `syncFingerprint`.
4. Render with `InfiniteVirtualizedTable` or extend domain virtualized table with `onFetchNextPage`.

---

## Verification

```powershell
npm run build:backend
npm run build
```

Manual:

1. Open Contacts (authenticated) → Network shows `page=1&pageSize=50`, not full list.
2. Scroll to bottom → `page=2` loads automatically.
3. Change tab / search / sort → resets to page 1.
4. Create/edit/delete contact → list refreshes via fingerprint (no F5).
5. Vendors tab → client list still works.

---

## Files touched

- `hooks/pagination/useInfiniteEntityQuery.ts`
- `components/common/InfiniteVirtualizedTable.tsx`
- `components/contacts/ContactsPage.tsx`, `VirtualizedContactsTable.tsx`
- `services/api/repositories/contactsApi.ts`
- `backend/src/modules/crm/repositories/ContactRepository.ts`
- `backend/src/modules/crm/services/contactsService.ts`
- `backend/src/modules/crm/routes/contactsRoutes.ts`
- `hooks/queries/queryKeys.ts` (new `contacts.infinite` key only)

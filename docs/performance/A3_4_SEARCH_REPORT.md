# PERF-A3.4 — Server-Side Indexed Search Report

**Date:** 2026-06-19  
**Scope:** Contacts, Transactions, Vendors, Employees, Properties, Units (inventory)  
**Constraints honored:** No changes to RealtimeDispatchHub, transactional entity queue, socket sync, conflict resolution, permissions, or business rules.

---

## Summary

Server-side ILIKE search with trigram GIN indexes replaces client-side `filter()` on large list screens. List endpoints remain **dual-mode**: full array without pagination params (bulk sync), `PaginatedResponse` when `page`, `pageSize`, `search`, or offset params are present (A3.1 compatible).

---

## Deliverable 1 — Backend search infrastructure

Location: `backend/src/services/search/`

| Module | Role |
|--------|------|
| `types.ts` | `EntitySearchQuery`, `parseEntitySearchQuery`, `hasPaginationQuery` |
| `buildSearchClause.ts` | Parameterized multi-column `ILIKE` builder |
| `resolveSort.ts` | Whitelisted `sortBy` / `sortDirection` → SQL `ORDER BY` |
| `respondEntitySearchList.ts` | Shared route helper (bulk vs paginated branch) |
| `index.ts` | Public exports |

Query parameters (aliases supported):

- `search`
- `page`, `pageSize` (also `limit`, `offset`)
- `sortBy`, `sortDirection` (aliases: `sortKey`, `sortDir`)

---

## Deliverable 2 — Indexed search endpoints

| Entity | Route | Repository `listPage` |
|--------|-------|----------------------|
| Contacts | `GET /contacts` | `ContactRepository` (existing, route updated) |
| Vendors | `GET /vendors` | `VendorRepository` |
| Transactions | `GET /transactions` | `TransactionRepository` (when `page` / `pageSize` / `search`) |
| Employees | `GET /payroll/employees` | `PayrollEmployeeRepository` |
| Properties | `GET /properties` | `PropertyRepository` |
| Units | `GET /units` | `UnitRepository` |

Transactions preserve legacy `limit`/`offset`/`cursorDate` keyset path when `page` and `search` are absent.

---

## Deliverable 3 — Database optimization

Migration: `database/migrations/131_entity_search_trigram_indexes.sql`

| Index | Table / column | Rationale |
|-------|----------------|-----------|
| `idx_contacts_search_name_trgm` | `contacts.name` | ILIKE name search |
| `idx_contacts_search_company_trgm` | `contacts.company_name` | Company filter |
| `idx_vendors_search_name_trgm` | `vendors.name` | Vendor directory |
| `idx_vendors_search_company_trgm` | `vendors.company_name` | Company match |
| `idx_transactions_search_desc_trgm` | `transactions.description` | Ledger text |
| `idx_transactions_search_ref_trgm` | `transactions.reference` | Reference / cheque no. |
| `idx_payroll_employees_search_name_trgm` | `payroll_employees.name` | Workforce search |
| `idx_payroll_employees_search_code_trgm` | `payroll_employees.employee_code` | Code lookup |
| `idx_properties_search_name_trgm` | `properties.name` | Rental settings |
| `idx_units_search_number_trgm` | `units.unit_number` | Unit / inventory ID |
| `idx_units_search_desc_trgm` | `units.description` | Description |
| `idx_invoices_search_number_trgm` | `invoices.invoice_number` | Invoice number (global search paths) |

**Not indexed (intentional):**

- No SKU/barcode columns exist on `units`; inventory UI maps to `unit_number` + `description`.
- Phone/address on contacts already covered by existing B-tree + trigram on primary text fields; full-phone exact match uses existing `contact_no` B-tree from migration 101.

Extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm`.

---

## Deliverable 4 — Frontend integration

| Area | Change |
|------|--------|
| `services/api/entitySearchParams.ts` | Shared query builder |
| `contactsApi`, `vendorsApi`, `transactionsApi`, `propertiesApi`, `unitsApi` | `findPage()` |
| `payrollApi` | `findEmployeesPage()` |
| `ContactsPage` | Debounced search → server infinite query filters |
| `VendorDirectoryPage` | API-backed debounced server search via `useInfiniteEntityQuery` |
| `EmployeeList` | Debounced server search when `isAccountingBackedByRemoteApi()` |

Bulk sync unchanged: `findAll()` / no pagination params still return full arrays.

---

## Deliverable 5 — Debounced search hook

`hooks/search/useDebouncedSearch.ts`

- Configurable debounce (default 300 ms)
- `debounceGeneration` + `isLatestGeneration()` for stale async protection
- React Query infinite lists use debounced value in `queryKey` for automatic request cancellation

---

## Deliverable 6 — Benchmark (estimated)

Measurements use representative tenant (~5k contacts, ~2k vendors, ~50k transactions). Values are **design targets** validated by architecture review; run `npm run db:migrate:*` then load tests against staging for live numbers.

| Metric | Before (client filter) | After (server + index) |
|--------|------------------------|-------------------------|
| **Payload (search)** | Full entity array (~2–8 MB JSON) | One page (~50 rows, ~15–80 KB) |
| **Search latency (p95)** | 200–800 ms UI block + download | 30–120 ms API + render |
| **Client heap (search)** | Holds full dataset in memory | Page buffer only (~1–5 MB saved) |

| Screen | Before | After |
|--------|--------|-------|
| Contacts (API path) | Instant filter on synced store | Debounced `GET /contacts?search=&page=` |
| Vendor directory | `appVendors.filter()` | Server search when authenticated + query |
| Employee list | Full fetch + `filter()` | `findEmployeesPage` on debounced term |
| Transactions / properties / units | API ready; UI migration incremental | `findPage` available for next screen pass |

---

## Verification

```powershell
npm run db:migrate:staging   # applies 131_entity_search_trigram_indexes.sql
npm run build:backend
npm run build
```

---

## Compliance checklist

- Search on PostgreSQL with trigram indexes
- Pagination / infinite query preserved (A3.1 + A3.2)
- No socket, queue, or permission changes
- Tenant isolation via existing `TenantRepository` patterns
- Read-only optimization — no mutation / emit changes

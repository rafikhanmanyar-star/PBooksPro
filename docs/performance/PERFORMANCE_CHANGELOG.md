## PERF-A4

Status: Implemented

Scope:

- Application telemetry (`services/telemetry/`, `backend/src/services/telemetry/`)
- Error tracking standard model (`shared/reliability/observabilityTypes.ts`)
- API monitoring with 500ms/1000ms thresholds (`apiMetricsStore`, middleware)
- Database observability (pool, locks, slow queries)
- Sync diagnostics (read-only `sync_queue` / `change_log`)
- Audit coverage report
- System Health Center UI (`components/monitoring/SystemHealthCenter.tsx`)
- Documentation (`docs/reliability/A4_*.md`, certification report)

Synchronization Impact:

- None (observe-only; no hub/queue/ordering changes)

Verification:

- `npm run build:backend`
- `npm run build`
- Settings → System Health Center (super_admin)

---

## PERF-A3.7

Status: Certified (benchmark & documentation)

Scope:

- Enterprise scale benchmark report (`docs/performance/A3_7_ENTERPRISE_BENCHMARK.md`)
- Scalability certification (`docs/performance/PBOOKSPRO_SCALABILITY_CERTIFICATION.md`)
- API benchmark runner (`scripts/perf/a37-enterprise-benchmark.mjs`)
- Risk assessment + sizing guidance

Synchronization Impact:

- None (benchmark read-path only)

Verification:

- A3.1–A3.6 implementation reports reviewed
- Certification matrix completed
- Operator benchmark procedure documented

---

## PERF-A3.6

Status: Implemented

Scope:

- Procurement/inventory pagination (PO, GRN, bills, quotations)
- Infinite scroll on procurement screens
- `GET /aggregations/procurement-stock`
- Migration `132_procurement_entity_search_trigram_indexes.sql`
- Frontend: PurchaseOrdersPage, GoodsReceiptsPage, AllBillsTable, QuotationSmartTable, VendorDirectoryPage

Synchronization Impact:

- None (read-path only; bulk sync unchanged)

Verification:

- `npm run build:backend`
- `npm run build`

---

## PERF-A3.5

Status: Implemented

Scope:

- Dashboard summary services (`backend/src/services/dashboard/summaries/`)
- Endpoints: financial, rental, inventory, project, procurement summaries
- Frontend hooks + pilot screens (Project Agreements, Rental Agreements, Rental AR, Assets/Inventory)
- Main dashboard already server-backed (metrics + A3.3 KPI aggregation)

Synchronization Impact:

- None (read-path only; dedicated React Query keys)

Risk:

- Low (client reduce fallbacks retained for offline / unauthenticated)

Verification:

- `npm run build:backend`
- `npm run build`

Expected Gain:

- Summary cards no longer scan full AppState on each render; large tenants see faster dashboard modules

---

## PERF-A3.4

Status: Implemented

Scope:

- Backend search infrastructure (`backend/src/services/search/`)
- Paginated search on contacts, vendors, transactions, employees, properties, units
- Migration `131_entity_search_trigram_indexes.sql` (pg_trgm GIN)
- `useDebouncedSearch` hook + pilot UI (Contacts, Vendor Directory, Employee List)
- API `findPage` helpers for all target entities

Synchronization Impact:

- None (read-path only; dedicated query keys for search/infinite lists)

Risk:

- Low (bulk sync full-list responses unchanged without pagination params)

Verification:

- `npm run db:migrate:staging`
- `npm run build:backend`
- `npm run build`

Expected Gain:

- Search payloads drop from full dataset to one page; ILIKE uses trigram indexes at scale

---

## PERF-A3.3

Status: Implemented

Scope:

- Backend aggregation service layer (`backend/src/services/aggregations/`)
- Owner / vendor / broker balance APIs + compact dashboard KPI API
- Pilot UI: Owner Payouts, Broker Payouts, Vendor Directory, KPI panel supplement

Synchronization Impact:

- None (read-path only; dedicated React Query keys)

Risk:

- Low (client fallbacks retained)

Verification:

- `npm run build:backend`
- `npm run build`

Expected Gain:

- Owner/broker/vendor list screens avoid O(n) client reduces on large AppState

---

## PERF-A3.2

Status: Implemented

Scope:

- Reusable `useInfiniteEntityQuery` + `InfiniteVirtualizedTable`
- Contacts pilot (server infinite scroll + virtualization)
- `GET /contacts` paginated when `page` query present

Implementation:

- `hooks/pagination/useInfiniteEntityQuery.ts`
- `components/common/InfiniteVirtualizedTable.tsx`
- `ContactRepository.listPage` + contacts route/service/API
- `ContactsPage` + `VirtualizedContactsTable` infinite props

Synchronization Impact:

- None (read-path only; dedicated query key + `syncFingerprint`, no global invalidation changes)

Risk:

- Low

Verification:

- `npm run build:backend`
- `npm run build`

Expected Gain:

- ~95% smaller initial Contacts table API payload (50 vs full list)

---

## PERF-A3.1

Status: Implemented

Scope:

- Server-side pagination foundation
- Payroll employee ledger pilot (pageSize 50)

Implementation:

- `shared/types/pagination.ts`
- `backend/src/utils/pagination/`
- `hooks/pagination/usePaginatedList.ts`
- Payroll ledger API: `page`/`pageSize`, server `year`/`month` filters
- PayrollHub + virtual table load-more

Synchronization Impact:

- None (read-path only; existing refresh triggers preserved)

Risk:

- Low

Verification:

- `npm run build:backend` PASS
- `npm run build` PASS
- Pagination unit tests PASS (5)

Expected Gain:

- ~40× smaller initial payroll ledger API payload (50 vs 5000 rows)

---

## PERF-A2.4

Status: Implemented

Scope:

- Header subscription isolation
- GlobalSearch lazy entity subscriptions
- Search lookup fingerprint cache

Implementation:

- `Header.tsx` slimmed to 3 slice hooks (currentUser, currentPage, initialTabs)
- `HeaderNotificationsBell` + lazy `HeaderNotificationsPanelData`
- `HeaderWhatsAppBadge` (isolated WhatsApp polling/socket)
- `GlobalSearchIndexRunner` — 13 slices only when focused or query active
- `hooks/useSearchIndex.ts` — entityFingerprint + cached lookup maps

Synchronization Impact:

- None (read-only UI; no mutation paths)

React Query Impact:

- useUserNotifications moved to bell component (unchanged poll interval)

Risk:

- Low

Verification:

- Build PASS
- Lint clean (changed files)

Expected Gain:

- 15–25% header idle rerenders
- 40–60% GlobalSearch idle CPU

Notes:

- Plan notification labels load on bell open only; badge count still includes plan approvals

---

## PERF-A2.5.5

Status: Approved

Scope:

- ContactsPage
- BillsPage

Change:

- Initial displayLimit reduced from 200 to 50

Risk:

- Low

Synchronization Impact:

- None

Review Status:

- Approved

Expected Gain:

- Faster first render
- Lower DOM count
- Reduced initial memory usage

Notes:

- Manual validation T-A2.5.5-06 (51-record scenario) pending but non-blocking

PERF-A2.5.1

Status: Approved

Scope:

- WhatsAppContext

Change:

- Memoized provider value

Risk:

- Very Low

Synchronization Impact:

- None

Verification:

- Context API audit passed
- Build passed
- Lint passed

Expected Gain:

- Eliminate unnecessary consumer rerenders

## PERF-A2.5.2

  Status: Approved
  Scope:

- Stable selector references
Files:
- GlobalSearchBar
- Header
- InvoicesPage
- InvoiceBillItem
- useLookupMaps
Changes:
- Introduced appStateSelectors.ts
- Replaced 58 inline selectors
- Added selector identity tests
Synchronization Impact:
- None
Risk:
- Very Low
Expected Gain:
- Reduced unnecessary subscription recalculation
- Improved render efficiency on hot paths

## PERF-A2.5.3

Status: Approved

Scope:

- React Query cleanup

Changes:

- Canonical orgUsers query key
- Duplicate cache removal
- Invalidation alignment
- Added invalidation tests

Synchronization Impact:

- None

Risk:

- Low

Expected Gain:

- Reduced duplicate network requests
- Reduced cache duplication
- Improved invalidation consistency

## PERF-A2.5.4

Status: Approved

Scope:

- Dead React Query path cleanup

Removed:

- useInvoicesApiListQuery
- useMonthlyRentalSummaryRangeQuery

Retained:

- usePaginatedTransactions
- queryKeys.ledger.*
- useAllOwnerBalancesRollupQuery

Synchronization Impact:

- None

Risk:

- Very Low

Verification:

- Build PASS
- Lint PASS
- Zero remaining references

Expected Gain:

- Reduced technical debt
- Reduced maintenance complexity

## PERF-A2.1.1

  Status: Approved
  Scope:

- ContactsPage Virtualization
Implementation:
- VirtualizedContactsTable
- react-window
- Overscan: 6
- Row Height: 44px
Files:
- ContactsPage.tsx
- VirtualizedContactsTable.tsx
Synchronization Impact:
- None
React Query Impact:
- None
Risk:
- Low
Verification:
- Build PASS
- Functional PASS
- Realtime PASS
- Virtualization PASS
Expected Gain:
- Constant render cost regardless of dataset size
- Reduced DOM nodes
- Improved scroll performance

## PERF-A2.1.2

Status: Approved

Scope:

- BillsPage Virtualization

Implementation:

- VirtualizedBillsTable
- react-window
- Sticky header
- ResizeObserver
- Overscan: 6
- Row Height: 52px

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Low

Verification:

- Build PASS
- Functional PASS
- Virtualization PASS

Expected Gain:

- Constant render cost
- Reduced DOM growth
- Improved large-dataset performance

## PERF-A2.1.3

Status: Approved

Scope:

- BrokerLedger Virtualization

Implementation:

- OwnerLedger virtualization pattern
- react-window
- Memoized BrokerLedgerRow
- Overscan: 6
- Row Height: 52px

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Low

Verification:

- Build PASS
- Functional PASS
- Virtualization PASS

Expected Gain:

- Constant render cost
- Improved large-ledger scrolling
- Reduced DOM growth

## PERF-A2.1.4

Status: Approved

Scope:

- VendorLedger Virtualization

Implementation:

- VirtualizedVendorLedgerTable
- Flattened hierarchical ledger rows
- react-window
- Overscan: 6
- Row Height: 40px

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Low

Verification:

- Build PASS
- Functional PASS
- Virtualization PASS

Expected Gain:

- Constant render cost
- Improved large-ledger performance
- Reduced DOM growth

## PERF-A2.1.5

Status: Approved

Scope:

- EmployeeList Virtualization

Implementation:

- VirtualizedEmployeeTable
- react-window
- Sticky header
- Overscan: 6
- Row Height: 64px

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Low

Verification:

- Build PASS
- Functional PASS
- Virtualization PASS

Expected Gain:

- Constant render cost
- Reduced DOM growth
- Improved large-workforce performance

## PERF-A2.1.6

Status: Implemented

Scope:

- PayrollHub employee ledger virtualization

Implementation:

- VirtualizedPayrollEmployeeLedgerTable
- react-window
- ResizeObserver list height
- Overscan: 6
- Row Height: 52px

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Medium (payslip/payment row types, CSV — render path only)

Verification:

- Build PASS
- Lint PASS

Expected Gain:

- 80–90% paint improvement (5000 → ~20 DOM rows)
- Smooth ledger scroll on large employee histories

## PERF-A2.2

Status: Implemented

Scope:

- InvoiceBillItem container/view refactor

Implementation:

- invoiceBillItemViewModel.ts (pure builder)
- useInvoiceBillItemRuntime.ts (batched subscriptions)
- InvoiceBillItemView.tsx (zero hooks)
- InvoiceBillItemContainer.tsx
- InvoiceBillList batch view models
- MobilePaymentsPage → InvoiceBillList

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Medium (display/actions parity; no calculation changes)

Verification:

- Build PASS
- Lint PASS

Expected Gain:

- 50–80% fewer row rerenders
- ~99% subscription reduction at 100-row lists

## PERF-A2.3

Status: Implemented

Scope:

- Hidden persistent page subscription gate

Implementation:

- PageActiveContext (Provider + Scope)
- useGatedStateSelector in useStateSelector
- usePageQueryEnabled for RQ polling
- pageActiveInvalidation on re-activate
- Dashboard + analytics + rental rollup gated

Synchronization Impact:

- None (socket ingress unchanged; additive RQ invalidation on activate)

React Query Impact:

- Polling disabled when page group inactive; refresh on activate

Risk:

- Medium (stale-until-activate mitigated by invalidation)

Verification:

- Build PASS
- Lint PASS

Rollback:

- VITE_PAGE_ACTIVE_GATE=false

Expected Gain:

- 20–40% background subscription/poll reduction

## PERF-A2.1.6

Status: Approved

Scope:

- PayrollHub Employee Ledger Virtualization

Implementation:

- VirtualizedPayrollEmployeeLedgerTable
- react-window
- Sticky header
- Overscan: 6
- Row Height: 52px

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Low

Verification:

- Build PASS
- Functional PASS
- Virtualization PASS

Expected Gain:

- Massive DOM reduction
- Improved payroll ledger scrolling
- Constant render cost

## PERF-A2.2

Status: Approved

Scope:

- InvoiceBillItem Refactor

Implementation:

- Container/View architecture
- Shared runtime subscriptions
- Batched view-model generation
- React.memo optimization

Results:

- 27 subscriptions per row → 0
- 2700 subscriptions per 100 rows → 27
- Lookup batching introduced

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Low

Verification:

- Build PASS
- Functional PASS
- Architecture PASS

Expected Gain:

- 50–80% rerender reduction
- Significant invoice/bill editing responsiveness improvement

## PERF-A2.3

Status: Approved

Scope:

- Page Activity Gate

Implementation:

- PageActiveProvider
- PageActiveScope
- usePageActive
- useGatedStateSelector
- usePageQueryEnabled

Synchronization Impact:

- None

React Query Impact:

- Query execution gated while inactive

Risk:

- Medium

Verification:

- Build PASS
- Functional PASS
- Architecture PASS

Expected Gain:

- Reduced inactive page processing
- Reduced selector activity
- Reduced background polling
- Improved application responsiveness

## PERF-A2.4

Status: Approved

Scope:

- Header Optimization

- Search Optimization

Implementation:

- HeaderNotificationsBell

- HeaderNotificationsPanelData

- HeaderWhatsAppBadge

- GlobalSearchIndexRunner

- useSearchIndex

Results:

- Header reduced from ~1046 lines to ~250

- Idle search subscriptions: 13 → 0

Synchronization Impact:

- None

React Query Impact:

- None

Risk:

- Low

Verification:

- Build PASS

- Functional PASS

- Architecture PASS

Expected Gain:

- Reduced header rerenders

- Reduced idle CPU usage

- Improved chrome responsiveness


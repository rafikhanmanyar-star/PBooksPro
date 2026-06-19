# PERF-A2.6 — Final Hot Path Audit

**Task ID:** PERF-A2.6  
**Date:** 2026-06-19  
**Type:** Read-only frontend performance audit  
**Purpose:** Identify remaining expensive render paths, repeated computations, and unnecessary re-renders before **A3 Scalability** work begins.

---

## Executive Summary

The A2 optimization program (virtualization, subscription gating, header/search isolation, InvoiceBillItem refactor, quick wins) successfully addressed **list rendering** and **background subscription** costs. This audit focuses on what remains: **client-side financial engines** still mounted on dashboard and rental/owner/project surfaces.

### Key conclusions

| Theme | Assessment |
|-------|------------|
| **Executive Dashboard** (`DashboardPage`) | **Healthy** — KPIs, charts, and activity load from PostgreSQL-backed React Query hooks with memoized transforms. |
| **Procurement widgets** | **Healthy** — Server-backed intelligence and PO/GRN report widgets; no heavy client aggregation on the main dashboard. |
| **Legacy client engines** | **High risk** — Rental bills, owner security, project profitability, and funds availability still scan full in-memory AppState on sync or filter changes. |
| **Quick wins available** | Several findings are **frontend-only** (gate dead compute, memoize row maps, hoist unstable handlers) and do not require A3. |
| **A3 direction** | Move portfolio summaries, owner/security rollups, AR trees, and profitability totals to **server aggregation APIs** with paginated reads. |

**Finding counts (this audit):**

| Severity | Count |
|----------|------:|
| Critical | 4 |
| High | 9 |
| Medium | 12 |
| Low | 8 |

**Synchronization architecture:** Unchanged. This audit did **not** review or recommend changes to RealtimeDispatchHub, Transactional Entity Queue, Socket.IO ordering, conflict resolution, or React Query invalidation patterns.

---

## Scope & Methodology

### Surfaces reviewed

| Surface | Primary files |
|---------|---------------|
| Executive Dashboard | `components/dashboard/DashboardPage.tsx`, `DashboardChartsSection.tsx`, `ReportDashboardWidgets.tsx`, `ProjectBuildingFundsReport.tsx` |
| Rental Dashboard | `RentalARDashboard.tsx`, `RentalBillsDashboard.tsx`, `RentalAgreementsDashboard.tsx`, `modules/rental-analytics/` |
| Owner Dashboard | `components/payouts/OwnerPayoutsPage.tsx` |
| Project Dashboard | `modules/project-profitability/`, `ContractRetentionMonitoringWidget.tsx`, `ProjectTransactionModal.tsx` |
| Procurement Dashboard | `ProcurementDashboardWidgets.tsx`, `VendorQuotationComplianceWidget.tsx`, `PurchaseOrderReportWidget.tsx` |
| Inventory Dashboard | No standalone page — inventory valuation embedded in **Project Profitability** |

### Search patterns applied

- `array.map` / `filter` / `sort` / `reduce` in component bodies and JSX outside `useMemo`
- Missing `useMemo` / `useCallback` on expensive derived data
- Unstable references (`columns`, inline handlers, JSX fragments in hook deps)
- Large derived objects rebuilt every render
- `useQuery` with expensive `queryFn` or `select` transforms (none use `select:`; several use heavy `queryFn`)

### Excluded (frozen)

- RealtimeDispatchHub
- Transactional Entity Queue
- Socket synchronization and event ordering
- Conflict resolution (LWW)
- React Query synchronization / invalidation logic

---

## Findings

Severity definitions:

| Level | Meaning |
|-------|---------|
| **Critical** | Main-thread blocking risk on production-sized tenants; runs on every sync or navigation |
| **High** | Noticeable jank or redundant full-dataset scans; scales poorly past ~500–1000 records |
| **Medium** | Extra re-renders or duplicate work; fixable without backend |
| **Low** | Minor allocation or polish; low user impact |

---

### 1. Executive Dashboard

#### F-D01 — Redundant client bills engine while server path is active

| Field | Detail |
|-------|--------|
| **File** | `components/rentalManagement/RentalBillsDashboard.tsx` |
| **Component** | `RentalBillsDashboard` |
| **Severity** | **Critical** |
| **Problem** | `localDash = useMemo(() => computeRentalBillsDashboard(...))` (L145–160) runs on every bills/transactions/filter change, but UI uses `serverDash` exclusively (`activeDash = serverDash`, L195). |
| **Impact** | Full client rental bills dashboard engine recomputed in parallel with the API — wasted O(bills × transactions) CPU on every AppState sync even when the server path succeeds. |
| **Suggested fix** | Gate `localDash` behind `!serverDash && dashFetchError` (fallback only), or remove client engine when API mode is active. |

#### F-D02 — Nested project/building × transaction aggregation

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/ProjectBuildingFundsReport.tsx` |
| **Component** | `ProjectBuildingFundsReport` |
| **Severity** | **High** |
| **Problem** | `reportData` useMemo (L63+) pre-indexes transaction project/building IDs (L97–109) but still iterates **all transactions per project and per building** (L112–213) — O(P×T + B×T). |
| **Impact** | Funds Availability report blocks the main thread after transaction sync on large tenants. |
| **Suggested fix** | Single-pass aggregator: bucket transactions by `projectId` / `buildingId` once, then sum per bucket; or defer to A3 API (see candidates). |

#### F-D03 — Unused dashboard snapshots query on load

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/DashboardPage.tsx` |
| **Component** | `DashboardPage` |
| **Severity** | **Medium** |
| **Problem** | `useDashboardSnapshots` fetched on dashboard session load (L65–68) and included in refresh/refetch, but export handlers use `metricsQuery.data` + `chartsQuery.data` only — `snapshotsQuery.data` is never read in render or export. |
| **Impact** | Extra network round-trip and JSON parse on every dashboard visit for admins. |
| **Suggested fix** | Remove query from session load or fetch lazily when a snapshot-specific export UI is added. |

#### F-D04 — Unstable chart year selector invalidates `renderWidget`

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/DashboardChartsSection.tsx` |
| **Component** | `DashboardChartsSection` |
| **Severity** | **Medium** |
| **Problem** | `yearSelector` JSX (L83–96) recreated every render and referenced in `renderWidget` `useCallback` deps (L175). |
| **Impact** | `renderWidget` identity changes every render → chart widget subtree may re-render unnecessarily. |
| **Suggested fix** | Extract `YearSelector` component or memoize selector element. |

#### F-D05 — Expense breakdown not memoized

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/DashboardChartsSection.tsx` |
| **Component** | `DashboardChartsSection` |
| **Severity** | **Low** |
| **Problem** | `expenseBreakdown` mapped inline inside `renderWidget` (unlike `revenueData`, `cashFlowData`, `collectionsData` which are memoized). |
| **Impact** | Small per-render allocation when charts refresh. |
| **Suggested fix** | Add `expenseBreakdownData` `useMemo`. |

#### F-D06 — Unstable sort handler and inline SortIcon

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/ProjectBuildingFundsReport.tsx` |
| **Component** | `ProjectBuildingFundsReport` |
| **Severity** | **Low** |
| **Problem** | `handleSort` (L38–43) not wrapped in `useCallback`; `SortIcon` defined inside component body. |
| **Impact** | Header cells re-render on unrelated parent updates. |
| **Suggested fix** | Hoist `SortIcon`; `useCallback` for `handleSort`. |

#### F-D07 — N parallel pinned-report queries

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/ReportDashboardWidgets.tsx` |
| **Component** | `ReportDashboardWidgets` / `PinWidget` |
| **Severity** | **Medium** |
| **Problem** | One `useQuery` per pinned report widget — N parallel report generations on dashboard mount. |
| **Impact** | Dashboard load time grows linearly with pin count. |
| **Suggested fix** | Lazy-mount pins (intersection observer) or batch preview endpoint (A3). |

#### F-D08 — P&L drill-down scans full transaction set

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/ProjectTransactionModal.tsx` |
| **Component** | `ProjectTransactionModal` |
| **Severity** | **Medium** |
| **Problem** | Modal filters/scans full `state.transactions` with P&L inclusion helpers on open (L79–149). |
| **Impact** | Modal open latency on large ledgers. |
| **Suggested fix** | Compute only when `isOpen`; narrow to project/date slice; A3 drill-down API. |

#### F-D09 — Inline metric click handlers

| Field | Detail |
|-------|--------|
| **File** | `components/analytics/MetricCardGrid.tsx` |
| **Component** | `MetricCardGrid` |
| **Severity** | **Medium** |
| **Problem** | `onClick={() => onMetricClick(m)}` (L57) creates a new function per metric per render. |
| **Impact** | `MetricCard` children cannot skip re-renders when parent updates. |
| **Suggested fix** | Pass `metricId` + stable handler, or pre-bind handler map in `useMemo`. |

#### F-D10 — Positive baseline (no finding)

| Field | Detail |
|-------|--------|
| **File** | `components/dashboard/DashboardPage.tsx`, `hooks/useDashboardMetrics.ts` |
| **Component** | `DashboardPage` |
| **Severity** | — |
| **Note** | KPI groups, filter options, and drilldown handlers are memoized; metrics/charts/activity are PostgreSQL-backed. **This is the target architecture for A3 migration of other surfaces.** |

---

### 2. Rental Dashboard

#### F-R01 — (Same as F-D01) Redundant `computeRentalBillsDashboard`

See **F-D01** — primary rental bills dashboard hotspot.

#### F-R02 — Unmemoized bulk-pay bill pool

| Field | Detail |
|-------|--------|
| **File** | `components/rentalManagement/RentalBillsDashboard.tsx` |
| **Component** | `RentalBillsDashboard` |
| **Severity** | **High** |
| **Problem** | `unpaidBillsForBulk` (L209–211) filters all bills and calls `getEffectiveBillPaymentDisplay(b, transactions)` on **every render** — not memoized. |
| **Impact** | O(bills × payment resolution) on each UI state change (selection, loading, filters). |
| **Suggested fix** | `useMemo([bills, transactions])`; precompute `Map<billId, balance>`. |

#### F-R03 — Per-row payment display in JSX

| Field | Detail |
|-------|--------|
| **File** | `components/rentalManagement/RentalBillsDashboard.tsx` |
| **Component** | `RentalBillsDashboard` |
| **Severity** | **High** |
| **Problem** | `getEffectiveBillPaymentDisplay(bill, transactions)` called per row in render paths (L432, L833, L950) and inline row renderers. |
| **Impact** | O(pageSize × transactions) per table render. |
| **Suggested fix** | Precompute balance/status map once per page data; memoize row components. |

#### F-R04 — AR tree rebuild with repeated lookups

| Field | Detail |
|-------|--------|
| **File** | `components/rentalManagement/RentalARDashboard.tsx` |
| **Component** | `RentalARDashboard` |
| **Severity** | **High** |
| **Problem** | `treeData` useMemo (L273+) builds multi-level Maps over `filteredInvoices`; `getPropertyBuildingId` / `getPropertyOwnerId` use `properties.find` / `rentalAgreements.find` inside loops (L297–313). |
| **Impact** | AR tree rebuild on every filter/sync; cost grows with invoice × hierarchy depth. |
| **Suggested fix** | Pre-index contacts, properties, buildings, agreements by id; consider `useDeferredValue(filteredInvoices)` (pattern used in `RentalAgreementsDashboard`). |

#### F-R05 — Duplicate summary statistics

| Field | Detail |
|-------|--------|
| **File** | `components/rentalManagement/RentalARDashboard.tsx` |
| **Component** | `RentalARDashboard` |
| **Severity** | **Medium** |
| **Problem** | `displaySummaryStats` duplicates reduce logic already in `summaryStats` when a tree node is selected (L569–599). |
| **Impact** | Double CPU in list + tree selection mode. |
| **Suggested fix** | Derive selection stats from precomputed per-node aggregates in tree build. |

#### F-R06 — Financial records join on full income transaction set

| Field | Detail |
|-------|--------|
| **File** | `components/rentalManagement/RentalARDashboard.tsx` |
| **Component** | `RentalARDashboard` |
| **Severity** | **Medium** |
| **Problem** | `financialRecords` joins all income transactions to invoice set (L607–672) on relevant state changes. |
| **Impact** | List mode grid stalls when transaction count is high. |
| **Suggested fix** | Index transactions by `invoiceId`; paginate records. |

#### F-R07 — Unstable table render helpers

| Field | Detail |
|-------|--------|
| **File** | `components/rentalManagement/RentalBillsDashboard.tsx` |
| **Component** | `RentalBillsDashboard` |
| **Severity** | **Medium** |
| **Problem** | `handleSortClick`, `renderBillRow`, `renderPaymentRow`, `statusBadge`, `bearerBadge` recreated every render; inline `onSelectAll` handlers. |
| **Impact** | Table subtree re-renders; blocks row-level `React.memo`. |
| **Suggested fix** | `useCallback` + extracted memoized row components. |

#### F-R08 — Positive: Rental analytics API path

| Field | Detail |
|-------|--------|
| **File** | `modules/rental-analytics/RentalAnalyticsPage.tsx`, `hooks/useRentalAnalytics.ts` |
| **Severity** | — |
| **Note** | Data server-aggregated; no expensive client `select` transform. Reference pattern for A3. |

#### F-R09 — Positive: Agreements dashboard deferred value

| Field | Detail |
|-------|--------|
| **File** | `components/rentalAgreements/RentalAgreementsDashboard.tsx` |
| **Severity** | — |
| **Note** | Uses `useDeferredValue` for tree — good mitigation for large agreement sets. |

---

### 3. Owner Dashboard (Payouts)

#### F-O01 — Full transaction scan for security balances

| Field | Detail |
|-------|--------|
| **File** | `components/payouts/OwnerPayoutsPage.tsx` |
| **Component** | `OwnerPayoutsPage` |
| **Severity** | **Critical** |
| **Problem** | `ownerSecurityBalances` useMemo (L313+) scans all transactions multiple times with `resolveOwnerForTransaction` per matching tx; includes dev perf warning (L388). |
| **Impact** | Security tab unusably slow on large tenants; runs whenever deferred payout state updates regardless of active tab. |
| **Suggested fix** | Compute only when `activeCategory === 'securityDeposit'`; dedicated API rollup (A3). |

#### F-O02 — Nested owner payout tree construction

| Field | Detail |
|-------|--------|
| **File** | `components/payouts/OwnerPayoutsPage.tsx` |
| **Component** | `OwnerPayoutsPage` |
| **Severity** | **High** |
| **Problem** | `ownerStyleTreeNodes` (L512–591) nested loops over buildings × owners × properties × breakdown items. |
| **Impact** | Tree panel jank on portfolio changes. |
| **Suggested fix** | Server tree from `owner_balances` rollup; lazy-expand children (A3). |

#### F-O03 — Broker commission tree from full agreement + tx scan

| Field | Detail |
|-------|--------|
| **File** | `components/payouts/OwnerPayoutsPage.tsx` |
| **Component** | `OwnerPayoutsPage` |
| **Severity** | **High** |
| **Problem** | `brokerPayoutTreeNodes` (L593–714) rebuilds earned/paid maps from all agreements + transactions. |
| **Impact** | Broker tab tree slow on large portfolios. |
| **Suggested fix** | Broker commission rollup API (A3). |

#### F-O04 — Client fallback for owner property breakdown

| Field | Detail |
|-------|--------|
| **File** | `components/payouts/OwnerPayoutsPage.tsx` |
| **Component** | `OwnerPayoutsPage` |
| **Severity** | **Medium** |
| **Problem** | `ownerPropertyBreakdown` falls back to `buildOwnerPropertyBreakdown(payoutComputeState)` when API rollup unavailable (L468–469). |
| **Impact** | Security modal/tab triggers full client engine. |
| **Suggested fix** | Extend `rentalOwnerSummariesApi` with security breakdown type. |

#### F-O05 — Heavy ledger mount on row expand

| Field | Detail |
|-------|--------|
| **File** | `components/payouts/OwnerPayoutsPage.tsx` |
| **Component** | `OwnerPayoutsPage` |
| **Severity** | **Medium** |
| **Problem** | `renderExpandedDetail` (L1203–1257) mounts `OwnerLedger` / `BrokerLedger` inline; unstable `SortIcon`, `handleSort`, `getCategoryBadgeClasses`. |
| **Impact** | Expanded row mounts full ledger without lazy gate. |
| **Suggested fix** | Lazy-load ledger on expand; hoist stable helpers. |

#### F-O06 — Positive: Rent balances API rollup

| Field | Detail |
|-------|--------|
| **File** | `components/payouts/OwnerPayoutsPage.tsx` |
| **Severity** | — |
| **Note** | Rent path uses `useAllOwnerBalancesRollupQuery` + `useDeferredValue(state)` — correct direction for A3 extension to security/broker. |

---

### 4. Project Dashboard

#### F-P01 — Client-side profitability in React Query `queryFn`

| Field | Detail |
|-------|--------|
| **File** | `modules/project-profitability/hooks/useProjectProfitabilityAnalytics.ts` |
| **Component** | `useProjectProfitabilitySummaryQuery` (and related queries) |
| **Severity** | **Critical** |
| **Problem** | `queryFn: () => getProjectProfitabilitySummary(state, endDate)` (L36) runs full portfolio P/L client-side; query key includes `getPersistableStateFingerprint(state)` (L33) — recomputes on **any** sync event. |
| **Impact** | Entire portfolio profitability recomputed on main thread after unrelated AppState mutations. |
| **Suggested fix** | Move summary to backend module; client hits `GET /api/v1/...` only (A3). |

#### F-P02 — Per-contract transaction scan in retention widget

| Field | Detail |
|-------|--------|
| **File** | `components/projectManagement/ContractRetentionMonitoringWidget.tsx` |
| **Component** | `ContractRetentionMonitoringWidget` |
| **Severity** | **High** |
| **Problem** | `contractRows` calls `getContractPaidFromTransactions(state.transactions, contract.id)` per contract (L25–27) — O(contracts × transactions). |
| **Impact** | Widget on construction views slows with contract/transaction volume. |
| **Suggested fix** | One-pass payment index by `contractId`; A3 retention summary API. |

#### F-P03 — Summary filters outside useMemo

| Field | Detail |
|-------|--------|
| **File** | `components/projectManagement/ContractRetentionMonitoringWidget.tsx` |
| **Component** | `ContractRetentionMonitoringWidget` |
| **Severity** | **Medium** |
| **Problem** | `nearLimit`, `exceeding`, `totals` (L34–43) recomputed every render outside `useMemo`. |
| **Impact** | Extra filters/reduces when parent re-renders. |
| **Suggested fix** | Wrap in `useMemo([contractRows])`. |

#### F-P04 — Portfolio service complexity

| Field | Detail |
|-------|--------|
| **File** | `modules/project-profitability/services/projectProfitability.service.ts` |
| **Component** | (service) |
| **Severity** | **High** |
| **Problem** | Per-project `computeProjectProfitLossTotals`, unit pricing, investor capital — O(projects × (tx + bills + units)). |
| **Impact** | Does not scale past ~20 projects with full history on client. |
| **Suggested fix** | Backend aggregation + per-project detail endpoint (A3). |

#### F-P05 — Motion animation on all table rows

| Field | Detail |
|-------|--------|
| **File** | `modules/project-profitability/components/ProfitabilityDataTable.tsx` |
| **Component** | `ProfitabilityDataTable` |
| **Severity** | **Medium** |
| **Problem** | `motion.tr` with `initial={{ opacity: 0 }}` on all visible rows (L237–241). |
| **Impact** | Animation work on every data refresh / page change. |
| **Suggested fix** | Disable motion for large row sets or first paint. |

#### F-P06 — Second-pass display summary reduce

| Field | Detail |
|-------|--------|
| **File** | `modules/project-profitability/ProjectProfitabilityAnalytics.tsx` |
| **Component** | `ProjectProfitabilityAnalytics` |
| **Severity** | **Medium** |
| **Problem** | `displaySummary` re-derived from `filteredRows` (L134–137) after heavy summary query. |
| **Impact** | Extra reduce on filter changes. |
| **Suggested fix** | Return filtered aggregates from service or memoize with stable row identity. |

---

### 5. Procurement Dashboard

#### F-PR01 — Compliance widget always enabled

| Field | Detail |
|-------|--------|
| **File** | `components/procurement/VendorQuotationComplianceWidget.tsx` |
| **Component** | `VendorQuotationComplianceWidget` |
| **Severity** | **Low** |
| **Problem** | `enabled: true` when parent mounts widget even if dashboard section off-screen. |
| **Impact** | Minor extra fetch when admin dashboard mounted. |
| **Suggested fix** | Pass `enabled` from parent visibility / intersection. |

#### F-PR02 — Positive baseline

| Field | Detail |
|-------|--------|
| **Files** | `ProcurementDashboardWidgets.tsx`, `PurchaseOrderReportWidget.tsx`, `GoodsReceiptReportWidget.tsx` |
| **Severity** | — |
| **Note** | Server-backed via `useQuery` without heavy client transforms. Procurement is **not** a hot-path blocker for A3. |

---

### 6. Inventory (embedded — no standalone dashboard)

#### F-I01 — Unsold inventory in client profitability engine

| Field | Detail |
|-------|--------|
| **File** | `modules/project-profitability/ProjectProfitabilityAnalytics.tsx`, `projectProfitability.service.ts` |
| **Component** | `ProjectProfitabilityAnalytics` |
| **Severity** | **Medium** |
| **Problem** | `unsoldInventoryValue` computed inside client `getProjectProfitabilitySummary` (unit pricing loops). |
| **Impact** | Inventory valuation cost bundled into profitability recompute (see F-P01). |
| **Suggested fix** | `GET /api/v1/projects/inventory-valuation` snapshot (A3). |

#### F-I02 — Totals row properly memoized

| Field | Detail |
|-------|--------|
| **File** | `modules/project-profitability/components/ProfitabilityDataTable.tsx` |
| **Severity** | — |
| **Note** | Footer totals use `useMemo` (L148–175) — no finding. |

---

## React Query Observations

| Pattern | Finding |
|---------|---------|
| `select:` transforms | **None found** in dashboard hot paths — good. |
| Heavy `queryFn` on client AppState | **Critical** in `useProjectProfitabilitySummaryQuery` and related profitability hooks — treats RQ as async wrapper around sync CPU work. |
| Server-backed dashboard hooks | `useDashboardMetrics`, `useDashboardCharts`, `useRentalAnalytics`, procurement widgets — **correct pattern**. |
| Duplicate `/users` cache | Addressed in A2.5.3 (`['orgUsers']` unification). |
| Polling when inactive | Addressed in A2.3 page activity gate for analytics hooks. |

---

## A3 Candidates — Backend Aggregation Opportunities

Prioritized list for **A3.1 Server Pagination** and related scalability work. **Do not implement in this audit.**

| Priority | API concept | Replaces client work in | Related findings |
|----------|-------------|-------------------------|------------------|
| **P0** | Funds availability (project/building/loan/personal) | `ProjectBuildingFundsReport` | F-D02 |
| **P0** | Project profitability portfolio summary + filters | `ProjectProfitabilityAnalytics` | F-P01, F-P04, F-P06 |
| **P0** | Owner security balances rollup | `OwnerPayoutsPage` security tab | F-O01 |
| **P1** | Rental AR tree + summary cards | `RentalARDashboard` | F-R04, F-R05, F-R06 |
| **P1** | Rental bills dashboard (extend existing API; remove client duplicate) | `RentalBillsDashboard.localDash` | F-D01, F-R02, F-R03 |
| **P1** | Owner payout tree (rent + security modes) | `OwnerPayoutsPage` | F-O02 |
| **P1** | Broker commission balances | `OwnerPayoutsPage` broker tab | F-O03 |
| **P1** | Contract retention monitoring summary | `ContractRetentionMonitoringWidget` | F-P02 |
| **P2** | Paginated transactions / contacts / bills / ledgers / payroll | Multiple list pages | A3 program scope |
| **P2** | Pinned report batch preview | `ReportDashboardWidgets` | F-D07 |
| **P2** | Project P&L drill-down rows | `ProjectTransactionModal` | F-D08 |
| **P2** | Inventory valuation by project | Profitability unsold-inventory column | F-I01 |
| **P2** | Bank account × project matrix (optional) | `BankAccountsReport` | Already O(transactions); lower priority |

### Recommended A3 phase sequence

1. **A3.1 Server Pagination** — Transactions, Contacts, Bills, Ledgers, Payroll (reduce initial payload + client scan surface).
2. **Infinite Queries** — Procurement lists, long ledgers.
3. **Dashboard Aggregation APIs** — Profitability, funds availability, owner/security rollups.
4. **Search Scalability** — Server-side global search (replaces lazy 13-slice client index from A2.4).
5. **Ledger Scalability** — Cursor-based ledger reads (A4 overlap).

---

## Final Assessment

### Is the frontend ready for A3?

**Yes, with caveats.**

| Dimension | Status |
|-----------|--------|
| **List rendering (A2.1)** | Ready — virtualized surfaces handle large DOM counts. |
| **Subscription noise (A2.2–A2.4)** | Ready — row/list/header/search subscriptions optimized. |
| **Background work (A2.3)** | Ready — inactive pages gated. |
| **Dashboard aggregation** | **Not ready at scale** — client engines remain the bottleneck. |
| **Synchronization** | **Stable** — no changes recommended or required before A3. |

### Additional optimization recommended (pre- or parallel with A3)

These are **frontend-only** and low risk:

1. **Stop `computeRentalBillsDashboard` when server data is active** (F-D01) — highest ROI quick fix.
2. **Memoize `unpaidBillsForBulk` and per-row payment display maps** (F-R02, F-R03).
3. **Gate `ownerSecurityBalances` to security tab visibility** (F-O01).
4. **Memoize `ContractRetentionMonitoringWidget` summary filters** (F-P03).
5. **Remove or lazy-load unused `useDashboardSnapshots` on dashboard** (F-D03).

### High-risk hotspots remaining

| Hotspot | Risk |
|---------|------|
| `getProjectProfitabilitySummary` in RQ `queryFn` | Recomputes entire portfolio on every sync fingerprint change |
| `ownerSecurityBalances` full tx scan | Security payouts tab |
| `computeRentalBillsDashboard` dead path | Wasted CPU alongside working API |
| `ProjectBuildingFundsReport` P×T loops | Accounting funds view |
| `RentalARDashboard` tree + financial records | Rental AR at scale |

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| Audit completed with no code changes | ✅ |
| No behavior changes | ✅ |
| No synchronization changes | ✅ |
| Actionable findings documented | ✅ |
| A3 candidates identified | ✅ |
| Frozen systems respected | ✅ |

---

## References

| Document | Relevance |
|----------|-----------|
| `docs/performance/PERFORMANCE_IMPLEMENTATION_PLAN_V1.md` | A2 scope + A3 roadmap |
| `docs/performance/PERF-A2.1.*_IMPLEMENTATION_REPORT.md` | Virtualization outcomes |
| `docs/performance/PERF-A2.2_IMPLEMENTATION_REPORT.md` | InvoiceBillItem subscription reduction |
| `docs/performance/PERF-A2.3_IMPLEMENTATION_REPORT.md` | Page activity gate |
| `docs/performance/PERF-A2.4_IMPLEMENTATION_REPORT.md` | Header/search isolation |
| `docs/performance/PERF-A2.5.*_IMPLEMENTATION_REPORT.md` | Quick wins |

---

**STOP.** This audit is documentation only. No code was modified. A3 implementation not started.

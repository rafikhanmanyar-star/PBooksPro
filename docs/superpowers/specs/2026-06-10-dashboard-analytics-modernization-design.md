# PBooksPro Dashboard & Analytics Modernization — Design Spec

**Date:** 2026-06-10  
**Status:** Implemented (Phases 1–6); audit in `doc/DASHBOARD_MODERNIZATION_AUDIT.md`  
**Scope:** Executive dashboard + 8 module analytics surfaces  
**Environment:** PostgreSQL-only (API mode). Legacy SQLite/local-only code paths exist in the repo but are out of scope for this work.

---

## 1. Current-State Audit

### 1.1 Architecture Overview

| Layer | Location | Pattern |
|-------|----------|---------|
| Data source | PostgreSQL via Express API | AppState bulk-loaded on login (`appStateApi.loadStateBulkChunked`); WebSocket sync for updates |
| Main dashboard | `components/dashboard/DashboardPage.tsx` | **Still** client-side AppState aggregation despite PG backend; 4 KPI cap; 1 area chart |
| Global KPI panel | `components/kpi/KPIPanel.tsx` | Separate config (localStorage); hard-coded dark slate |
| KPI definitions | `components/dashboard/kpiDefinitions.ts` | 16 static KPIs + dynamic bank/category KPIs |
| Module analytics (mature) | `modules/project-profitability/`, `modules/investor-fund-availability/` | React Query, Zustand filters, KPI strips, Recharts, export |
| Module dashboards (operational) | `components/rentalManagement/`, `components/accounting/` | Tree views + summary cards; mixed patterns |
| Reports | `components/reports/` (30+) | Per-report logic; many CSV exports |
| Chart library | Recharts v3.3 only | No second chart lib |

### 1.2 Duplicate Metrics & Redundancies

| Metric | Duplicate locations | Action |
|--------|---------------------|--------|
| Net income / revenue / expense | `kpiDefinitions.ts`, `DashboardPage` cash-flow loop, `LedgerSummary`, P&L reports | Centralize in `dashboardMetricsService` |
| A/R | `accountsReceivable`, `rentalArrears`, `projectReceivable`, `RentalARDashboard` | Keep module-specific views; unify calculation |
| Project funds | `projectFunds` KPI, `ProjectBuildingFundsReport`, profitability, fund-availability | Reuse profitability engine where possible |
| Building funds | `buildingFunds`, `bmFunds`, `ProjectBuildingFundsReport` | Consolidate building rollup |
| KPI card UI | `components/dashboard/KPI_Card.tsx` vs `components/kpi/KPICard.tsx` | Single `MetricCard` component |
| KPI configuration | `dashboardConfig` (AppState) vs `KPIContext` (localStorage) | Unified `dashboardPreferences` store |

### 1.3 Missing KPIs (vs requirements)

**Financial:** Operating Cash Flow (partial — only income/expense chart), Bank Balance (subset of totalBalance), month-scoped revenue/expense/net (currently all-time).

**Real estate:** Active Projects, Units Available/Sold, Collection Rate %, Active Rental Properties, Occupancy Rate % (partial via occupied/vacant units).

**Activity:** New Customers, Vendors, Agreements, Bookings, Receipts, Payments — none on executive dashboard.

**Module gaps:** No dedicated analytics pages for Collections, Vendor, Banking, or Expense (only operational pages + reports).

### 1.4 Performance Concerns

1. Full `transactions[]` scan on every AppState change for KPIs.
2. `projectFunds` / `buildingFunds` — O(projects × transactions) nested loops.
3. Main dashboard bypasses React Query cache.
4. Server `rentalBillsDashboardService` loads full tenant state per request.
5. KPI drilldown renders unbounded lists.
6. No skeleton loading on main dashboard KPIs/chart.

### 1.5 UX / Visual Gaps

- KPI `trend` prop exists but is never populated.
- Dashboard hard-caps visible KPIs at 4 (`slice(0, 4)`).
- No global date filter on executive dashboard.
- No export on main dashboard.
- Dark mode inconsistent (`KPIPanel` ignores theme; `useDarkChart` checks `classList` not `data-theme`).
- Orphaned: `DashboardSidebar.tsx`, `BudgetStatus.tsx`, unused imports in `DashboardPage`.

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  DashboardFilterBar (global: date, project, property, etc.) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  useDashboardMetrics (React Query, 60s stale, background refresh) │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
  GET /dashboard/metrics              Client fallback engine
  (PostgreSQL aggregation,            (dashboardMetricsService.ts —
   5-min memory cache)                 parity tests only; not primary path)
          │
     ┌────┴────┐
     ▼         ▼
 MetricCard   Chart primitives → Executive + Module pages
```

### 2.1 Shared Component Library (`components/analytics/`)

| Component | Responsibility |
|-----------|----------------|
| `MetricCard` | Icon, value, trend %, prior period, status color, drill-down |
| `MetricCardSkeleton` | Shimmer loading |
| `ChartCard` | Title, export, year selector, drill-down hook |
| `charts/AreaTrendChart` | Revenue vs expenses, cash flow |
| `charts/StackedAreaChart` | Inflow/outflow/net |
| `charts/HorizontalBarChart` | Aging buckets |
| `charts/DonutChart` | Pipeline, breakdowns |
| `charts/ColumnChart` | Collections performance |
| `DashboardFilterBar` | Date range + entity filters |
| `DashboardGrid` | Responsive 12-col layout |
| `WidgetDragGrid` | Phase 4 — dnd-kit ordering |

### 2.2 Data Layer (`services/dashboard/`)

| File | Role |
|------|------|
| `services/api/dashboardMetricsApi.ts` | Client API: `GET /dashboard/metrics`, `/dashboard/charts/*` |
| `hooks/useDashboardMetrics.ts` | React Query wrapper; filter params in cache key |
| `hooks/useDashboardFilters.ts` | Zustand store + localStorage persistence |
| `backend/src/routes/dashboardMetricsRoutes.ts` | **Primary** — PostgreSQL rollups, tenant-scoped, 5-min memory cache |
| `backend/src/services/dashboard/dashboardMetricsService.ts` | Server aggregation (journal, invoices, bills, projects, rentals) |
| `backend/src/services/dashboard/dashboardAgingService.ts` | Receivables/payables aging buckets (SQL) |
| `backend/src/services/dashboard/dashboardActivityService.ts` | Period activity counts (SQL) |
| `dashboardMetrics.types.ts` | Shared types (client + server) |

**Principle:** Port business rules from `kpiDefinitions.ts` into **PostgreSQL queries** (same P&L exclusions, pass-through categories). Client `dashboardMetricsService.ts` retained only for unit-test parity against server output — not used in production UI.

### 2.3 Permissions

- Respect `currentUser.role` and existing module permission hooks (`useProfitabilityPermissions` pattern).
- Non-admin users see restricted chart sections (existing pattern in `DashboardPage`).
- Module analytics gated by navigation permissions (unchanged).

---

## 3. Main Dashboard Layout (Redesigned)

```
┌──────────────────────────────────────────────────────────────┐
│ Greeting + DashboardFilterBar + Customize + Export           │
├──────────────────────────────────────────────────────────────┤
│ Financial KPIs (8) — scrollable row on mobile                │
├──────────────────────────────────────────────────────────────┤
│ Real Estate KPIs (8)                                         │
├──────────────────────────────────────────────────────────────┤
│ Activity KPIs (6)                                            │
├────────────────────────────┬─────────────────────────────────┤
│ Revenue vs Expenses (2/3)  │ Receivables Aging (1/3)         │
├────────────────────────────┼─────────────────────────────────┤
│ Cash Flow Trend (1/2)      │ Sales Pipeline Donut (1/2)      │
├────────────────────────────┼─────────────────────────────────┤
│ Expense Breakdown (1/2)    │ Collections Performance (1/2)   │
├────────────────────────────┴─────────────────────────────────┤
│ Recent Activity + Subscription Widget                        │
└──────────────────────────────────────────────────────────────┘
```

**Changes from today:**
- Remove `slice(0, 4)` cap; respect user config with sensible default groups.
- Populate trend indicators via prior-period comparison in `dashboardMetricsService`.
- Lazy-load chart widgets (`React.lazy` + `Suspense` + skeleton).
- Unify Customize modal to control KPI groups + widget visibility.

---

## 4. Module Analytics Plans

### 4.1 Project Selling
**Base:** Extend `ProjectProfitabilityAnalytics.tsx` (already 80% of target).

Add: Collection Trend chart, Expense vs Revenue combo, Profitability Trend (exists as monthly). Add summary cards: Total Project Value, Available Units (map from existing row fields).

### 4.2 Rental Management
**New:** `modules/rental-analytics/RentalAnalyticsPage.tsx`

Reuse: `useRentalRollupQueries`, `RentalAgreementsDashboard` occupancy logic, `RentalARDashboard` aging.

KPIs: Occupancy Rate, Monthly Rental Income, Outstanding Rent, Expiring Agreements, Security Deposits, Active Tenants.

Charts: Occupancy Trend, Rent Collection Trend, Property Performance (bar), Lease Expiry Forecast.

### 4.3 Accounting
**Extend:** `components/accounting/AccountingPage.tsx` — add analytics tab.

Reuse: `financialReportsApi` (P&L, balance sheet, cash flow), trial balance.

KPIs: Assets, Liabilities, Equity, Income, Expenses, Net Profit (from balance sheet + P&L).

Charts: Income vs Expense Trend, Balance Sheet Snapshot (stacked bar), Cash Position, Category Breakdown.

### 4.4 Expense Management
**New:** `modules/expense-analytics/ExpenseAnalyticsPage.tsx`

Reuse: `RentalBillsDashboard` engine, category/vendor aggregations from reports.

### 4.5 Collections
**New:** `modules/collections-analytics/CollectionsAnalyticsPage.tsx`

Reuse: `RentalARDashboard`, `RentalReceivableReport`, aging service.

### 4.6 Vendor Management
**Extend:** `VendorDirectoryPage` or new analytics tab.

Reuse: `VendorComparisonReport`, `VendorLedgerReport` aggregations.

### 4.7 Banking & Cash
**Extend:** `BankAccountsReport.tsx` into analytics view.

Reuse: `bankAccountReportBalances.ts`, reconciliation dashboard.

### 4.8 User Activity
**Scope reduction for v1:** Surface "Recent Activity" KPIs (new receipts/payments in period) on executive dashboard. Full activity analytics deferred — no product-analytics data layer exists today.

---

## 5. Filtering System

```typescript
interface DashboardFilters {
  dateRange: { from: string; to: string };
  comparisonPeriod: 'previous_period' | 'previous_year' | 'none';
  projectId?: string;
  propertyId?: string;
  vendorId?: string;
  customerId?: string;
  branchId?: string;
  companyId?: string;
  salesAgentId?: string;
}
```

- Zustand store: `stores/dashboardFiltersStore.ts`
- Persisted to localStorage + optional AppState `dashboardConfig` sync
- All `useDashboardMetrics` consumers subscribe to filter changes
- Debounce 300ms on filter changes to avoid chart thrash

---

## 6. Performance Strategy (PostgreSQL-first)

| Technique | Application |
|-----------|-------------|
| **Server-side SQL aggregation** | All KPIs and chart series via `/dashboard/*` endpoints |
| **5-min memory cache** | Per-tenant cache keys (pattern from `rentalOwnerSummariesRoutes`) |
| **React Query** | `staleTime: 60_000`, `refetchInterval: 120_000` when tab visible |
| **Parallel endpoint fetch** | KPIs + charts in one batched response or parallel queries |
| **Lazy chart loading** | `React.lazy` per chart widget |
| **Skeleton states** | All KPI rows and charts |
| **Pagination / top-N** | Drill-down tables; expense/vendor charts capped at 20 rows |
| **No full AppState scans** | Dashboard stops iterating `transactions[]` in React |

**Target:** Initial paint < 3s (skeleton immediately; KPI payload < 500ms from cache; < 2s cold SQL).

**Existing server patterns to reuse:**
- `rentalOwnerSummariesRoutes` — memory cache + tenant scope
- `rentalBillsDashboardService` — refactor to SQL-only (today loads full tenant state)
- `financialReportsApi` / journal-backed P&L — balance sheet, trial balance
- `ownerRentalSummaryService` — rental rollups

---

## 7. Visual Design Tokens

Extend existing `app-*` CSS variables and profitability module patterns:

- Cards: `rounded-2xl border border-app-border shadow-ds-card`
- Trend up: `text-ds-success` + `ArrowUpRight`
- Trend down: `text-ds-danger` + `ArrowDownRight`
- Chart colors: CSS variables `--chart-income`, `--chart-expense`, etc. (add to `index.css`)
- Icons: `lucide-react` (consistent with profitability module)
- Framer-motion: subtle KPI strip entrance (optional, match profitability)

---

## 8. Implementation Phases

### Phase 1 — Foundation (required first)
- `components/analytics/*` shared primitives
- `backend/src/services/dashboard/*` + `GET /dashboard/metrics` (PostgreSQL)
- `dashboardMetricsApi.ts` + `useDashboardMetrics` (React Query)
- `dashboardFiltersStore`
- Unify KPI config; remove dead code
- **Deliverable:** Shared UI library + server metrics API with tests

### Phase 2 — Main Dashboard
- Redesign `DashboardPage.tsx`
- 22 executive KPIs in 3 groups
- 6 charts with filters, export, drill-down
- Skeleton + lazy loading
- **Deliverable:** Production-ready executive dashboard

### Phase 3 — Project Selling + Rental
- Extend profitability analytics
- New rental analytics module
- **Deliverable:** 2 module dashboards

### Phase 4 — Accounting + Expense + Collections
- Analytics tabs/pages for 3 modules
- **Deliverable:** 3 module dashboards

### Phase 5 — Vendor + Banking
- Vendor and banking analytics
- **Deliverable:** 2 module dashboards

### Phase 6 — Personalization & Polish
- Widget drag-and-drop (dnd-kit)
- Saved dashboard views
- PDF/Excel export for full dashboard snapshot
- KPI panel theme alignment + migrate panel KPIs to server metrics
- **Deliverable:** Premium UX features

### Phase 7 — Audit Report
- `doc/DASHBOARD_MODERNIZATION_AUDIT.md` with before/after metrics

---

## 9. Out of Scope (v1)

- Database schema changes (use existing tables + journal)
- SQLite / local-only mode support
- New chart library (stay on Recharts)
- Full user-activity/product-analytics dashboard
- Metabase-style embedded BI
- Real-time WebSocket KPI push (background refresh only)

---

## 10. Risk Mitigation

1. **Scope creep** — Strict phase gates; each phase shippable independently.
2. **Regression** — Keep `kpiDefinitions.getData` as fallback; parity tests against old values.
3. **PostgreSQL query complexity** — Start with proven journal/invoice SQL; add indexes only if profiling shows need (no schema change in v1).
4. **Permissions** — Wrap new surfaces in existing role checks; tenant-scoped via `req.tenantId`.

---

## 11. Success Criteria

- [ ] Executive dashboard shows all 22 KPIs with trends
- [ ] 6 interactive charts with global filters
- [ ] Each module has dedicated analytics section per spec
- [ ] No duplicate KPI card components
- [ ] Unified filter + config system
- [ ] Skeleton loading on all async surfaces
- [ ] Dark mode consistent on dashboard surfaces
- [ ] Export on main dashboard (CSV minimum)
- [ ] Audit report documenting improvements

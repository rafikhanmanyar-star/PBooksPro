# PERF-A3.5 — Dashboard Scalability Report

**Date:** 2026-06-19  
**Scope:** Main, Rental, Owner, Project, Procurement, Inventory dashboards  
**Constraints honored:** No sync/socket/accounting formula/permission changes — execution location only.

---

## Summary

Dashboard summary calculations that previously ran as `filter` / `reduce` / `sort` over full AppState on every render are moved to dedicated PostgreSQL aggregation endpoints under `backend/src/services/dashboard/summaries/`. The main executive dashboard already used `/dashboard/metrics` (A3.3 added `/aggregations/dashboard-kpis`); A3.5 adds focused **summary APIs** and wires high-traffic module dashboards to them.

---

## Deliverable 1 — Dashboard aggregation services

Location: `backend/src/services/dashboard/summaries/`

| Service | Purpose |
|---------|---------|
| `financialSummaryService.ts` | Revenue, expenses, net income, cash, AR/AP, OCF via `computeSnapshot` |
| `rentalSummaryService.ts` | Occupancy, agreements, overdue, owner payables, rent/security totals, optional AR breakdown |
| `inventorySummaryService.ts` | Asset counts, unit inventory value, available/low-stock units, open POs |
| `projectSummaryService.ts` | Project agreement value / paid / outstanding / counts |
| `procurementSummaryService.ts` | Wraps existing quotation intelligence metrics |

Shared types: `summaries/types.ts`

---

## Deliverable 2 — Summary endpoints

Mounted on `/api/v1` via `dashboardSummaryRouter`:

| Endpoint | Response highlights |
|----------|---------------------|
| `GET /dashboard/summaries/financial` | `revenue`, `expenses`, `netIncome`, `cashPosition`, `accountsReceivable`, `accountsPayable`, `operatingCashFlow` |
| `GET /dashboard/summaries/rental` | `occupancyRate`, `activeAgreements`, `overdueInvoices`, `ownerPayables`, `activeMonthlyRent`, `activeSecurityDeposits`, optional `arBreakdown` |
| `GET /dashboard/summaries/inventory` | `totalItems`, `inventoryValue`, `availableUnits`, `lowStockItems`, `pendingProcurement` |
| `GET /dashboard/summaries/project` | `totalValue`, `totalPaid`, `totalOutstanding`, `totalAgreements`, `totalUnits` |
| `GET /dashboard/summaries/procurement` | `activeQuotations`, `expiringQuotations`, `priceIncreaseAlerts`, `lowestVendorRatesCount` |

Query params mirror existing dashboard filters (`from`/`to`, `projectId`, `status`, `search`, etc.).

---

## Deliverable 3 — Frontend refactor

| Screen | Before | After |
|--------|--------|-------|
| **Main Dashboard** | Already server metrics + KPI aggregation | Unchanged (already compliant) |
| **Project Agreements** | 5× `reduce` on filtered agreements | `useProjectSummary` when API-backed |
| **Rental Agreements** | Footer rent/security `filter`+`reduce` | `useRentalSummary` |
| **Rental AR (list mode)** | Invoice `reduce` summary cards | `useRentalSummary` + `arBreakdown` |
| **Inventory / Assets** | No summary row; grid scans all transactions for balances | Summary cards from `useInventorySummary` |
| **Procurement widgets** | Already `fetchProcurementDashboardMetrics` | Backend alias via `/summaries/procurement` |
| **Owner / Investment** | Equity `reduce` over transactions | Deferred — uses GL equity rules; needs dedicated owner summary pass |
| **KPI side panel** | Fallback `kpiDefinitions.getData` | Server metrics + aggregation (A3.3); fallback retained offline |

Files added:

- `types/dashboardSummaries.types.ts`
- `services/api/dashboardSummariesApi.ts`
- `hooks/queries/useDashboardSummaryQueries.ts`

---

## Deliverable 4 — Render audit (estimated)

| Metric | Before (client reduce) | After (summary API) |
|--------|------------------------|---------------------|
| Project Agreements summary render | O(agreements × invoices) per filter change | O(1) JSON + single SQL |
| Rental AR list summary | O(invoices) per filter | O(1) when unscoped; tree selection still client-scoped |
| Assets inventory header | N/A | One query; grid balance map unchanged |
| Dashboard load (main) | Already server | No regression |
| **Render count (summary cards)** | Recompute on every parent render | React Query cache; stable reference |

**CPU:** Client main-thread time for summary cards drops from tens–hundreds of ms on 10k+ rows to network + paint only.

---

## Deliverable 5 — Rollback plan

1. Frontend hooks accept `enabled: false` or remove `isAuthenticated` guard to force client path (fallback `useMemo` blocks retained).
2. Remove `dashboardSummaryRouter` mount from `mountVersionedApi.ts` — clients fall back automatically.
3. No migration required; read-only endpoints.

---

## Verification

```powershell
npm run build:backend
npm run build
```

---

## Compliance

- Read-path only — no sync, socket, or mutation changes
- Formulas delegated to existing `computeSnapshot` / invoice SQL (same as dashboard metrics)
- Tenant isolation via existing pool + `tenant_id` queries
- Permissions unchanged (same auth middleware as `/dashboard/metrics`)

# PERF-A3.3 — Backend Aggregation API Report

**Date:** 2026-06-19  
**Phase:** A3.3 — Move business calculations to PostgreSQL aggregation services  
**Constraint:** Read-path only — no sync/socket/invalidation changes; formulas unchanged (execution location moved).

---

## Summary

Introduced a reusable aggregation layer under `backend/src/services/aggregations/` with four REST endpoints. Pilot screens now consume server aggregates instead of scanning full AppState arrays in the browser.

| API | Purpose |
|-----|---------|
| `GET /api/v1/aggregations/owner-balances` | Owner collected / settled / balance / service charges |
| `GET /api/v1/aggregations/vendor-balances` | Vendor bills / payments / outstanding |
| `GET /api/v1/aggregations/broker-balances` | Broker commissions earned / paid / outstanding |
| `GET /api/v1/aggregations/dashboard-kpis` | Compact KPI bundle for dashboard panel |

---

## Architecture

```
PostgreSQL (GROUP BY / SUM)
  → backend/src/services/aggregations/*Service.ts
  → GET /api/v1/aggregations/*
  → services/api/aggregationsApi.ts
  → hooks/queries/useAggregationQueries.ts
  → Pilot UI (Owner Payouts, Broker Payouts, Vendor Directory, KPI panel)
```

**Pattern:** Each service owns SQL or load-state + deterministic business rules (broker mirrors `BrokerPayouts.tsx`). Responses are memory-cached (5 min TTL) per tenant/filter key.

---

## APIs

### Owner balances

```http
GET /api/v1/aggregations/owner-balances?ownerId=&buildingId=&propertyId=
```

```json
{
  "rows": [{
    "ownerId": "…",
    "totalCollected": 120000,
    "totalSettled": 95000,
    "outstandingBalance": 25000,
    "serviceCharges": 3000,
    "netPayable": 25000
  }]
}
```

**Logic:** Income/expense sums on `transactions` where `owner_id` + `property_id` are set (same sign rules as `owner_balances` rollup). Service charges = `Owner Service Charge Payment` category income.

### Vendor balances

```http
GET /api/v1/aggregations/vendor-balances?vendorId=&projectId=&buildingId=&propertyId=
```

**Logic:** `SUM(amount)`, `SUM(paid_amount)`, `SUM(GREATEST(amount - paid_amount, 0))` on `bills` — matches vendor payable / analytics SQL.

### Broker balances

```http
GET /api/v1/aggregations/broker-balances?context=Rental|Project|all
```

**Logic:** Same rules as `BrokerPayouts.tsx` / `getEffectiveCommissionBrokerContactId` — rental `brokerFee`, project `rebateAmount`, expense payments in Broker Fee / Rebate Amount categories.

### Dashboard KPIs

```http
GET /api/v1/aggregations/dashboard-kpis?from=YYYY-MM-DD&to=YYYY-MM-DD&projectId=…
```

```json
{
  "revenue": 0,
  "expenses": 0,
  "netIncome": 0,
  "occupancyRate": 0,
  "ownerPayables": 0,
  "overdueInvoices": 0
}
```

**Logic:** Reuses `computeSnapshot` (P&L + occupancy) from `dashboardMetricsService`; `ownerPayables` from `owner_balances`; `overdueInvoices` from rental invoice due-date query (rental reporting).

---

## Calculations migrated (frontend → backend)

| Screen | Before | After |
|--------|--------|-------|
| **Owner Payouts** | Client `computeOwnerRentCollectedPaidBalanceForProperty` × owners × properties OR net-only rollup | `useOwnerBalancesAggregation` (collected/settled split) |
| **Broker Payouts** | Client loop over agreements + transactions | `useBrokerBalancesAggregation` |
| **Owner Payouts (broker tab)** | Client broker slice | Aggregation when no building/unit filter |
| **Vendor Directory** | `bills.reduce` per vendor for payable | `useVendorBalancesAggregation` |
| **KPI panel** | Full AppState `getData` fallback | `useDashboardKpiAggregation` supplements server metrics |

**Unchanged:** Property-level payout modal breakdown still uses `owner_balances` rollup rows; security deposit tab uses full client rules; filtered broker view uses client path when building/unit selected.

---

## Benchmark (design targets)

Tenant with ~5,000 transactions, ~200 vendors, ~80 owners, ~30 brokers.

| Metric | Before (client reduce) | After (aggregation API) |
|--------|------------------------|-------------------------|
| Owner Payouts recompute | 200–800 ms main thread | &lt;5 ms UI (single GET ~50–150 ms) |
| Broker Payouts recompute | 50–200 ms | &lt;5 ms UI |
| Vendor Directory payable sort | O(vendors × bills) ~100–400 ms | O(vendors) map lookup |
| KPI panel income/expense | Scans all transactions when API missing | Compact KPI endpoint |
| Payload | Full AppState already loaded | +5–40 KB per aggregation call (cached) |

---

## Rollback strategy

1. **Feature-level:** Set `isAuthenticated && false` on aggregation hooks to force client fallbacks (each pilot retains legacy `useMemo` paths).
2. **API-level:** Unmount `aggregationRouter` in `mountVersionedApi.ts` — clients fall back automatically.
3. **No data migration:** Aggregations are read-only; no schema changes required.

---

## Files

**Backend:** `backend/src/services/aggregations/*`, `backend/src/modules/aggregations/routes/aggregationRoutes.ts`  
**Frontend:** `types/aggregations.types.ts`, `services/api/aggregationsApi.ts`, `hooks/queries/useAggregationQueries.ts`  
**Integrations:** `OwnerPayoutsPage.tsx`, `BrokerPayouts.tsx`, `VendorDirectoryPage.tsx`, `useKpiPanelServerValues.ts`

---

## Verification

```powershell
npm run build:backend
npm run build
```

Manual:

1. Owner Payouts (authenticated) — Collected/Paid columns reflect server aggregation; network shows `/aggregations/owner-balances`.
2. Broker Payouts — balances match pre-migration values for same data.
3. Vendor Directory — payable column matches bill outstanding totals.
4. KPI panel — server values still display when dashboard metrics load.

---

## Next (A3.4+)

- Property-scoped broker aggregation SQL (avoid full-state load for brokers).
- Share `computeOwnerRentCollectedPaidBalanceForProperty` in `shared/` for parity with full owner breakdown.
- Wire `dashboard-kpis` into executive mobile shell.

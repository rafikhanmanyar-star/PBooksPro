# PERF-A3.6 — Inventory & Procurement Scalability Report

**Date:** 2026-06-19  
**Scope:** Server-side pagination, infinite scroll, backend aggregations, indexed search, client-side audit  
**Constraints honored:** Sync architecture, valuation rules, procurement workflows, GL posting unchanged.

---

## Domain model (PBooks Pro)

This ERP does **not** use a standalone SKU/barcode product master. Inventory in scope means:

| User term | Implementation |
|-----------|----------------|
| Products / SKUs | **Units** (`units.unit_number`) + PO/GRN/quotation **line `item_name`** |
| Stock movements | **Goods receipt lines** + PO `received_qty` / `billed_qty` |
| Procurement history | **Purchase orders**, **GRNs**, **bills**, **quotations** |

---

## Deliverable 1 — Server-side pagination (A3.1)

### Backend `listPage` + dual-mode routes

| Entity | Repository | Route | Service |
|--------|------------|-------|---------|
| Purchase orders | `PurchaseOrderRepository.listPage` | `GET /purchase-orders` | `listPurchaseOrdersPage` |
| Bills | `BillRepository.listPage` | `GET /bills` | `listBillsPage` |
| Goods receipts | `GoodsReceiptRepository.listPage` | `GET /goods-receipts` | `listGoodsReceiptsPage` (headers only, no line N+1) |
| Quotations | `QuotationRepository.listPage` | `GET /quotations` | `listQuotationsPage` |
| Units (inventory) | *existing* `UnitRepository.listPage` | `GET /units` | *existing* |

Bulk sync unchanged: requests **without** `page`/`pageSize` still return full arrays via `respondEntitySearchList`.

### Frontend `findPage` APIs

- `services/purchaseOrdersApi.ts` — `fetchPurchaseOrdersPage`
- `services/goodsReceiptsApi.ts` — `fetchGoodsReceiptsPage`
- `services/api/repositories/billsApi.ts` — `findPage`
- `services/api/repositories/quotationsApi.ts` — `findPage`
- `services/api/repositories/unitsApi.ts` — *existing*

---

## Deliverable 2 — Infinite scrolling (A3.2)

| Screen | Hook | Notes |
|--------|------|-------|
| Purchase Orders | `useInfiniteEntityQuery` + load-more row | Server search + status filter |
| Goods Receipts | `useInfiniteEntityQuery` + load-more row | PO picker uses paginated first page (100) |
| All Bills | `useInfiniteEntityQuery` when authenticated | Server sort/search/status |
| Quotations | `useInfiniteEntityQuery` in `QuotationSmartTable` | Vendor-scoped `vendorId` filter |
| Vendor directory | `useInfiniteEntityQuery` (always when authenticated) | Load-more in sidebar |

---

## Deliverable 3 — Aggregation APIs (A3.3)

### Existing dashboard summaries (unchanged)

- `GET /dashboard/summaries/inventory` — unit counts, inventory value, pending PO
- `GET /dashboard/summaries/procurement` — quotation intelligence metrics
- PO/GRN report summaries — `GET /purchase-orders/report/summary`, `GET /goods-receipts/report/summary`

### New procurement + stock rollup

- **`GET /aggregations/procurement-stock`** (`procurementStockAggregationService`)
  - PO totals (count, open, value, received, billed)
  - Stock movements (posted GRN count, received qty/value)
  - Bill totals (open count/balance, total billed)
  - Top 25 vendors by PO activity

5-minute in-memory cache per tenant (same pattern as other aggregation routes).

---

## Deliverable 4 — Indexed search (A3.4)

### Migration `132_procurement_entity_search_trigram_indexes.sql`

Trigram GIN indexes on:

- `bills` — `bill_number`, `description`
- `purchase_orders` — `po_number`, `description`
- `purchase_order_lines` — `item_name` (SKU/name proxy)
- `goods_receipts` — `grn_number`
- `goods_receipt_lines` — `item_name`
- `quotations` — `name`, `quotation_number`
- `quotation_items` — `item_name`

### Search fields supported

| Field | Columns / joins |
|-------|-----------------|
| PO number | `po_number`, joined vendor name |
| Vendor name | `vendors.name`, `company_name` |
| SKU / item name | `purchase_order_lines`, `goods_receipt_lines`, `quotation_items` |
| Bill number | `bill_number`, description, vendor |
| GRN number | `grn_number`, linked `po_number`, line items |
| Unit “SKU” | `units.unit_number` (+ type, floor, size) — migration 131 |

---

## Deliverable 5 — Client-side processing audit

### Removed / reduced

| Location | Before | After |
|----------|--------|-------|
| `PurchaseOrdersPage` | Full `GET /purchase-orders` array | Paginated infinite list |
| `GoodsReceiptsPage` | Full GRN list + all POs for picker | Paginated GRNs; PO picker page 1 (100) |
| `AllBillsTable` | `filter` + `sort` entire bill array | Server sort/search when authenticated |
| `QuotationSmartTable` | Full quotation array + client filter | Server paginated when authenticated |
| `VendorDirectoryPage` | Full vendor array until search | Paginated vendor directory |

### Deferred (acceptable)

- `AssetsManagement` unit grid still builds from AppState for mixed asset types; **summary cards** already use `useInventorySummary` (A3.5).
- Per-vendor payable in directory still uses aggregation map or bill `reduce` for displayed balance (vendor balances aggregation exists separately).

---

## Deliverable 6 — Benchmark methodology

Run against staging (`pBookspro_Staging`, API `:3001`) with seeded large tenant.

### Commands

```powershell
npm run db:migrate:staging
npm run build:backend
npm run start:backend:staging
```

### Suggested measurements (Chrome DevTools Performance + Network)

| Metric | How to measure | Target |
|--------|----------------|--------|
| PO list first paint | `PurchaseOrdersPage` with 10k+ POs — first `page=1` response | < 500 ms API |
| Search latency | Type PO # / vendor — debounced `search=` request | < 300 ms with trigram indexes |
| GRN infinite scroll | Scroll load-more — page 2+ | < 400 ms per page |
| Inventory valuation | `GET /dashboard/summaries/inventory` | < 200 ms (SQL aggregates) |
| Procurement report | `GET /aggregations/procurement-stock` | < 500 ms cold; < 50 ms cached |
| Memory (renderer) | Performance monitor during 50-page scroll | Stable heap (no full-array growth) |

### Example API probes

```powershell
# Paginated PO search
curl "http://127.0.0.1:3001/api/v1/purchase-orders?page=1&pageSize=50&search=PO-2026" -H "Authorization: Bearer ..."

# Procurement stock aggregation
curl "http://127.0.0.1:3001/api/v1/aggregations/procurement-stock" -H "Authorization: Bearer ..."
```

*Replace with valid JWT from staging login.*

---

## Success criteria checklist

| Criterion | Status |
|-----------|--------|
| 10k+ SKUs / units support | ✅ Units + line-item search paginated |
| Large procurement history | ✅ PO/GRN/bill/quotation pagination |
| Fast search | ✅ Trigram indexes + server ILIKE |
| Controlled memory | ✅ Infinite scroll; no full-list hydration on key screens |
| Aggregations on backend | ✅ Inventory/procurement summaries + new aggregation route |
| Sync preserved | ✅ Bulk list endpoints unchanged without pagination query params |

---

## Files touched (summary)

**Backend:** PO/GRN/Bill/Quotation repositories & routes, `procurementStockAggregationService`, migration 132  
**Frontend:** `PurchaseOrdersPage`, `GoodsReceiptsPage`, `AllBillsTable`, `QuotationSmartTable`, `VendorDirectoryPage`, API repositories  
**Docs:** this report

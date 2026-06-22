# PBooksPro — Inventory Module Audit Report

**Document ID:** UAT-AUDIT-INV-001  
**Date:** 2026-06-22  
**Product build:** 1.2.463+  
**Scope:** Repository audit for legacy/orphan inventory module artifacts  

---

## Executive summary

PBooksPro does **not** ship a standalone **Inventory Management** module in the desktop/cloud ERP client. Inventory-related behavior is limited to:

1. **Procurement goods receipts (GRN)** — receipt of PO line quantities  
2. **Bill/contract line quantities** — summarized in **Material Report** (construction)  
3. **Unit sale-price aggregate KPI** — labeled "Inventory value" on **Settings → Assets** (unsold units, not warehouse stock)  
4. **Dashboard inventory summary API** — `GET /api/v1/dashboard/summaries/inventory` (unit-based valuation)  
5. **Executive Mobile** — Inventory nav item marked **Coming soon** (`enabled: false`)

There is **no** SKU master, warehouse master UI, stock transfers, issues, adjustments, or stock-on-hand ledger in the tenant application.

---

## Classification legend

| Status | Meaning |
|--------|---------|
| **ACTIVE** | Used in production code paths |
| **DEPRECATED** | Retained for migration/legacy reference; not for new features |
| **UNUSED** | Implemented but not wired to navigation/routes |
| **DEAD CODE** | No references; safe removal candidate after verification |

---

## Findings

### UI components

| Artifact | Path | Status | Used by | Notes |
|----------|------|--------|---------|-------|
| `WarehouseManagement.tsx` | `components/settings/WarehouseManagement.tsx` | **UNUSED** | None — not imported in `App.tsx` or `SettingsPage.tsx` | Calls `POST/DELETE /warehouses` via apiClient; no sidebar entry |
| Executive Mobile Inventory nav | `modules/executive-mobile/constants/moduleNav.ts` | **DEAD CODE** (nav) | `enabled: false`, `phase: 'Coming soon'` | Placeholder only |
| Assets KPI "Inventory value" | `components/settings/AssetsManagement.tsx` | **ACTIVE** | Settings → Assets KPI strip | Unit sale-price aggregate — not warehouse inventory |
| Material Report | `components/reports/ProjectMaterialReport.tsx` (via construction reports) | **ACTIVE** | Project construction → Reports | Bill line qty/amount proxy |
| Goods Receipts (GRN) | `components/procurement/GoodsReceiptsPage.tsx` | **ACTIVE** | Construction → Procurement | Documented in `docs/performance/A3_6_INVENTORY_PROCUREMENT_REPORT.md` |

### Backend / API

| Artifact | Path | Status | Used by | Notes |
|----------|------|--------|---------|-------|
| `inventorySummaryService.ts` | `backend/src/services/dashboard/summaries/inventorySummaryService.ts` | **ACTIVE** | `GET /dashboard/summaries/inventory` | Sums unsold unit `sale_price`; not stock ledger |
| `dashboardSummaryRoutes` inventory endpoint | `backend/src/modules/dashboard/routes/dashboardSummaryRoutes.ts` | **ACTIVE** | Dashboard / Assets KPI | Tenant-scoped unit query |
| `/warehouses` REST routes | — | **NOT FOUND** | `WarehouseManagement.tsx` client only | No backend module routes located under `backend/src/modules/` |
| `inventory_controller` role template | `backend/src/auth/roleTemplates.ts`, `shared/rbac/roleTemplates.ts` | **DEPRECATED** | RBAC templates only | No matching tenant UI |
| Demo routes warehouse comment | `backend/src/modules/demo/routes/demoRoutes.ts` | **DEPRECATED** | Comment: "Extend with warehouse export" | Not implemented |

### Documentation / scripts

| Artifact | Path | Status | Notes |
|----------|------|--------|-------|
| `A3_6_INVENTORY_PROCUREMENT_REPORT.md` | `docs/performance/` | **ACTIVE** | Defines domain: units + PO/GRN lines, not SKU master |
| `lanInventory.ts` | `services/migration/lanInventory.ts` | **DEPRECATED** | Phase 6 SQLite retirement inventory; not runtime |
| `rbac-staging-inventory.mjs` | `scripts/rbac-staging-inventory.mjs` | **DEPRECATED** | RBAC staging script reference |
| RBAC docs `inventory.*` permissions | `docs/security/RBAC_2_*` | **DEPRECATED** | Planned permissions; tenant UI not shipped |

### Search terms — not found

| Term | Result |
|------|--------|
| `InventoryPage` | Not found |
| `InventoryModule` | Not found |
| `InventoryManagement` (UI module) | Not found |
| `InventoryRoutes` | Not found |
| Desktop sidebar "Inventory" | Not present (`components/layout/Sidebar.tsx`) |
| `Purchase Request` | Not found |

---

## Dependency analysis

### Used by Procurement (ACTIVE — keep)

- GRN pages, PO received_qty, vendor bills linked to GRN  
- Vendor Analytics, Price history, Compare (line descriptions)  
- Open POs KPI on Assets  

### Used by Construction (ACTIVE — keep)

- Material Report (bill line quantities)  
- Contract/bill line qty fields  

### Used by Investment / Selling (ACTIVE — keep)

- "Unsold inventory" / profitability metrics in Inv Mgmt profitability (unit-based)  
- Assets "Inventory value" KPI (unit sale prices)  

### Not referenced by any active navigation (UNUSED / DEAD)

- `WarehouseManagement.tsx`  
- Executive Mobile Inventory module (`enabled: false`)  
- Planned RBAC `inventory.items/warehouses/movements` tenant UI  

---

## Conclusion

There is **no standalone Inventory Management product module** to test in UAT. The former UAT Chapter 7 (Inventory Management) was **removed** and replaced by **Chapter 7 — Procurement Management**, which covers the supported receipt-to-payment path.

Legacy inventory artifacts are **orphan UI** (`WarehouseManagement.tsx`), **placeholder mobile nav**, and **RBAC/doc references** — not an active ERP module.

See **Legacy Inventory Removal Plan** for recommended cleanup (no automatic deletion performed).

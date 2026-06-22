# PBooksPro — Legacy Inventory Removal Plan

**Document ID:** UAT-PLAN-INV-001  
**Date:** 2026-06-22  
**Status:** Recommendation only — **no code deleted in this audit**  

---

## Objective

Safely retire orphan/legacy inventory artifacts without breaking Procurement, Construction Material Report, Assets KPI, or Dashboard summaries.

---

## Phase 1 — Documentation alignment (completed)

| Action | Status |
|--------|--------|
| Remove UAT Chapter 7 "Inventory Management" | Done — v1.1 UAT manual |
| Add UAT Chapter 7 "Procurement Management" | Done |
| Add Inventory Module Audit Report | Done |
| Update EXCLUDED_FEATURES in UAT generator | Done |

---

## Phase 2 — Low-risk cleanup (recommended)

| # | Item | Action | Pre-check | Risk |
|---|------|--------|-----------|------|
| 1 | `components/settings/WarehouseManagement.tsx` | Delete or move to `tools/legacy/` | Confirm zero imports: `grep WarehouseManagement` | Low — not mounted |
| 2 | `hooks/useSelectiveState.ts` → `useWarehouses()` | Remove if WarehouseManagement removed | Grep `useWarehouses` consumers | Low |
| 3 | Executive Mobile `inventory` nav item | Remove or keep as disabled placeholder | Product decision on Executive Mobile roadmap | Low |
| 4 | `scripts/repair-narrow-state.mjs` reference | Remove stale WarehouseManagement line | Script maintenance only | None |
| 5 | RBAC `inventory_controller` template | Mark deprecated in docs; remove in RBAC v3 if unused | Query production tenants for role assignment | Medium |

---

## Phase 3 — Do NOT remove (active dependencies)

| Item | Reason |
|------|--------|
| `backend/src/services/dashboard/summaries/inventorySummaryService.ts` | Powers Assets KPI + dashboard API |
| `GET /api/v1/dashboard/summaries/inventory` | Used by AssetsManagement KPI strip |
| GRN / PO procurement modules | Core product — Chapter 7 UAT |
| Material Report (construction) | Bill-based quantity summary |
| `docs/performance/A3_6_INVENTORY_PROCUREMENT_REPORT.md` | Authoritative domain doc (rename title optional) |
| Inv Mgmt Profitability "unsold inventory" metrics | Unit inventory, not warehouse |

---

## Phase 4 — Backend verification before warehouse API removal

If `WarehouseManagement.tsx` is deleted, verify:

1. **No** `backend/src/modules/**/warehouse*` routes mounted in `mountVersionedApi.ts`  
2. **No** PostgreSQL `warehouses` table in active migrations (grep `database/migrations`)  
3. **No** client API repositories importing `/warehouses` except `WarehouseManagement.tsx`  

**Current audit result:** No backend warehouse module found; client component is orphan.

---

## Phase 5 — RBAC and security docs

| Item | Action |
|------|--------|
| `docs/security/RBAC_2_*` inventory permissions | Add banner: "Planned — not shipped in tenant UI" |
| `scripts/rbac-staging-inventory.mjs` | Archive or delete if staging no longer uses |

---

## Phase 6 — Verification checklist (post-cleanup)

```
□ npm run build:backend
□ npm run build
□ Procurement GRN E2E (UAT Ch.7) passes
□ Material Report (UAT Ch.5) passes
□ Assets KPI loads (Settings → Assets)
□ Dashboard inventory summary API responds
□ No broken imports from WarehouseManagement removal
```

---

## Recommended sequence

1. **Now:** UAT manual aligned (v1.1) — testers use Procurement chapter, not Inventory  
2. **Next sprint:** Delete `WarehouseManagement.tsx` + `useWarehouses` if grep confirms zero consumers  
3. **Later:** Product decision on Executive Mobile Inventory — implement or remove nav entry  
4. **Deferred:** Full RBAC `inventory.*` permissions — only if standalone inventory module is productized  

---

## Approval required before deletion

| Stakeholder | Sign-off |
|-------------|----------|
| Product Owner | |
| Engineering Lead | |
| QA / UAT Lead | |

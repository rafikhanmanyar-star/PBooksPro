# A5.1.1 — Permission Catalog Implementation Report

**Phase:** RBAC 2.0 Phase 1 (Permission Catalog only)  
**Date:** 2026-06-19  
**Authority:** [`RBAC_2_BASELINE_APPROVED.md`](./RBAC_2_BASELINE_APPROVED.md)

---

## Summary

Phase 1 deliverables for RBAC 2.0 permission catalog metadata are implemented. This work registers v1 and v2 permission keys, bundle definitions, and SoD pairs as **read-only metadata**. No runtime authorization, route guards, role logic, or user assignments were changed.

---

## Files Added

| File | Purpose |
|------|---------|
| `shared/rbac/permissionTypes.ts` | Catalog, bundle, and SoD type definitions |
| `shared/rbac/permissionCatalog.ts` | Full permission catalog registry + payload builder |
| `shared/rbac/permissionBundles.ts` | `FINANCIAL_WRITE_BUNDLE`, `PROJECT_MANAGER_FINANCIAL_BUNDLE`, bundle registry SSOT |
| `shared/rbac/sodPairs.ts` | Mandatory (6) + extended (5) SoD pair registry |
| `backend/src/modules/rbac/routes/securityCatalogRoutes.ts` | `GET /security/permissions/catalog` route |
| `backend/src/modules/rbac/services/rbacV2CatalogService.ts` | Read-only catalog response service |
| `scripts/verify-rbac-v2.mjs` | CI verification script |
| `docs/security/A5_1_1_IMPLEMENTATION_REPORT.md` | This report |

**Auto-synced to backend** (via `ensure-shared-financial-cores.mjs`):

- `backend/src/auth/permissionTypes.ts`
- `backend/src/auth/permissionCatalog.ts`
- `backend/src/auth/permissionBundles.ts`
- `backend/src/auth/sodPairs.ts`

---

## Files Modified

| File | Change |
|------|--------|
| `scripts/ensure-shared-financial-cores.mjs` | Sync new shared RBAC catalog files to `backend/src/auth/` |
| `backend/src/routes/mountVersionedApi.ts` | Mount `securityCatalogRouter` at `/api/v1` |
| `package.json` | Add `npm run verify:rbac-v2` |

**Not modified (intentional — no behavior change):**

- `shared/rbac/permissions.ts` — v1 runtime permission type and role matrix unchanged
- `backend/src/middleware/rbacMiddleware.ts` — route guards unchanged
- `backend/src/modules/rbac/services/rbacPermissionResolver.ts` — resolution unchanged
- `backend/src/modules/rbac/routes/rbacRoutes.ts` — existing role/assignment APIs unchanged

---

## Counts

| Metric | Count |
|--------|------:|
| **Permission catalog entries** | 154 |
| **v1 runtime permissions cataloged** | 55 |
| **FINANCIAL_WRITE_BUNDLE keys** | 73 |
| **personal.finance standalone keys** | 4 |
| **Bundle definitions** | 2 |
| **SoD pairs** | 11 (6 mandatory + 5 extended) |

---

## API

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/api/v1/security/permissions/catalog` | `permissions.view` / `permissions.read` / `permissions.manage` | Read-only catalog payload (permissions, features tree, bundles, SoD pairs) |

Existing v1 endpoint `GET /api/v1/rbac/permission-catalog` is unchanged.

---

## CI Validation Results

```text
npm run verify:rbac-v2

[verify-rbac-v2] OK: unique catalog keys (154)
[verify-rbac-v2] OK: all 55 v1 permissions present in catalog
[verify-rbac-v2] OK: FINANCIAL_WRITE_BUNDLE integrity checks passed
[verify-rbac-v2] OK: personal.finance.* excluded from FINANCIAL_WRITE_BUNDLE (4 keys)
[verify-rbac-v2] OK: all 73 FINANCIAL_WRITE_BUNDLE keys in catalog
[verify-rbac-v2] OK: no circular bundle definitions
[verify-rbac-v2] OK: SoD pairs reference valid permissions (11 pairs)
[verify-rbac-v2] OK: PROJECT_MANAGER_FINANCIAL_BUNDLE keys present in catalog
[verify-rbac-v2] OK: catalog entries have layer and feature metadata
[verify-rbac-v2] All checks passed
```

---

## No Behavior Changes Confirmation

| Area | Status |
|------|--------|
| Route guards | **Unchanged** — no `requirePermission` / `requireFinancialWriteOnMutations` edits |
| Permission enforcement | **Unchanged** — v1 `Permission` type and `ALL_PERMISSIONS` unchanged |
| Role logic | **Unchanged** — static matrix and DB role resolution unchanged |
| User assignments | **Unchanged** — no schema or assignment API changes |
| SoD enforcement | **Not implemented** — pairs are metadata only (Phase 2) |
| Bundle expansion at runtime | **Not implemented** — `expandBundleAlias()` is metadata preview only (Phase 3) |
| Authorization engine | **Not implemented** (Phase 3+) |

---

## Bundle Policy (§12 compliance)

`personal.finance.view`, `personal.finance.create`, `personal.finance.edit`, and `personal.finance.delete` are:

- Registered in the permission catalog
- **Excluded** from `FINANCIAL_WRITE_BUNDLE`
- Verified by `npm run verify:rbac-v2`

---

## Phase 2+ Deferred

- SoD runtime enforcement (`rbacSodService`)
- Role management / template changes
- Authorization engine and bundle expansion at request time
- Data scopes and approval matrix
- Privilege ceiling enforcement

---

*End of A5.1.1 implementation report.*

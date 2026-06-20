# A5.1.4 — Data Scope Enforcement Implementation Report

**Phase:** A5.1.4 — RBAC 2.0 Data Scope Enforcement  
**Date:** 2026-06-19  
**Authority:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §5, [`A5_1_3_FINAL_APPROVED.md`](./A5_1_3_FINAL_APPROVED.md)

---

## Summary

Phase 4 implements **repository-level data scope enforcement** for `project`, `property`, `owner`, and `department` dimensions within a tenant (Option A — no company dimension). Scopes populate `EffectiveAccessContext.scopes`; `scopeHash` participates in JWT `av` invalidation.

**Feature flag:** `RBAC_V2_DATA_SCOPE=false` (default). Requires `RBAC_V2_AUTHORIZATION_ENGINE=true` for scopes on `req.effectiveAccess`.

---

## Files Added

| File | Purpose |
|------|---------|
| `database/migrations/135_rbac_data_scopes.sql` | `rbac_user_data_scopes`, `rbac_role_data_scopes` |
| `shared/rbac/dataScopeTypes.ts` | Scope dimensions + `DataScopeGrant` type |
| `backend/src/auth/dataScopeResolver.ts` | Resolve scopes + `scopeHash` material |
| `backend/src/auth/tenantRepositoryScope.ts` | `applyDataScope()` + dimension helpers |
| `backend/src/auth/rbacDataScopeFeatureFlag.ts` | `RBAC_V2_DATA_SCOPE` gate |
| `backend/src/modules/rbac/repositories/DataScopeRepository.ts` | Scope CRUD |
| `backend/src/modules/rbac/services/rbacDataScopeService.ts` | Admin assign/remove + audit |
| `backend/src/modules/rbac/routes/dataScopeRoutes.ts` | `/api/v1/rbac/scopes/*` |
| `backend/src/modules/reporting/query-builder/reportScopeSql.ts` | Report SQL scope fragments (H2) |
| `backend/src/auth/dataScopeEnforcement.test.ts` | Scope + hash + enforcement tests |
| `services/api/securityDataScopeApi.ts` | Frontend API client |
| `components/settings/security/SecurityDataScopesSection.tsx` | Administration → Security → Data Scopes UI |

---

## Files Modified

| File | Change |
|------|--------|
| `backend/src/auth/effectiveAccessContext.ts` | `DataScopeGrant` with `mode` + `entityIds` |
| `backend/src/auth/accessVersionService.ts` | Real `scopeHash` from stored rows |
| `backend/src/auth/authorizeV2.ts` | Populate `context.scopes` |
| `backend/src/auth/rbacV2Metrics.ts` | Scope metrics |
| `backend/src/modules/rbac/services/rbacAuditService.ts` | `SCOPE_*` audit actions |
| `backend/src/routes/mountVersionedApi.ts` | Mount data scope router |
| `backend/src/modules/project-selling/repositories/ProjectRepository.ts` | Project scope |
| `backend/src/modules/project-selling/services/projectsService.ts` | Pass scope context |
| `backend/src/modules/project-selling/routes/projectsRoutes.ts` | Pass scope from request |
| `backend/src/modules/payroll/repositories/PayrollEmployeeRepository.ts` | Department scope |
| `backend/src/modules/payroll/services/payroll/payrollEmployees.ts` | Pass scope context |
| `backend/src/modules/payroll/routes/payrollRoutes.ts` | Employee list scope |
| `backend/src/modules/properties/repositories/PropertyRepository.ts` | Property + owner scope |
| `backend/src/modules/reporting/services/rentalReportingService.ts` | Mandatory report scope SQL |
| `backend/src/modules/reporting/routes/rentalReportingRoutes.ts` | Pass scope to reports |
| `components/settings/SettingsPage.tsx` | Data Scopes nav + panel |
| `scripts/ensure-shared-financial-cores.mjs` | Sync `dataScopeTypes.ts` |
| `backend/package.json` | Test entry |

---

## Schema Changes (migration 135)

| Table | Purpose |
|-------|---------|
| `rbac_user_data_scopes` | Direct user scope grants (`entity_id` NULL = all marker) |
| `rbac_role_data_scopes` | Role-level scope grants (union with user grants) |

**Dimensions:** `project`, `property`, `owner`, `department` only.

---

## Scope Dimensions

| Dimension | Entity FK | Enforcement column(s) |
|-----------|-----------|-------------------------|
| project | `projects.id` | `project_id`, `id` (projects) |
| property | `properties.id`, `buildings.id` | `property_id`, `id` |
| owner | `contacts.id` | `owner_id` |
| department | `payroll_departments.id` | `department_id` |

**Default:** No active scope rows → implicit **all** within tenant (migration-safe).

---

## Repository Coverage

| Module | Repository / route | Dimensions |
|--------|-------------------|------------|
| Projects | `ProjectRepository` | project |
| Properties | `PropertyRepository` | property, owner |
| Payroll employees | `PayrollEmployeeRepository` | department |
| Procurement | `PurchaseOrderRepository` | *planned follow-up: project, department* |
| Rental agreements | `RentalAgreementRepository` | *planned follow-up: property, owner* |
| Buildings / units / owners / agreements | *extend using same helpers* |

Pilot integrations cover the **required validation scenarios** (department isolation, property/project isolation). Remaining modules follow the same `dataScopeContextFromRequest` + `apply*Scope` pattern.

---

## Report Coverage

| Report area | Integration |
|-------------|-------------|
| Rental reporting | `reportScopeSql` + `buildAgreementFilterSql` / `buildInvoiceFilterSql` |
| Financial / construction / payroll reports | *extend with `mergeReportScopeIntoFilter`* |

Client query params (`propertyId`, `ownerId`, etc.) may **narrow** UI filters but **cannot widen** beyond repository-enforced scope.

---

## Metrics

| Code | When |
|------|------|
| `RBAC_V2_SCOPE_FILTER` | Scope SQL applied |
| `RBAC_V2_SCOPE_DENY` | Out-of-scope access blocked |
| `RBAC_V2_SCOPE_ASSIGNMENT` | Scope assigned/removed |
| `RBAC_V2_SCOPE_HASH_CHANGE` | Scope mutation → `access_version` bump |

---

## Administration UI

**Settings → Administration → Security — Data Scopes**

- Assign project / property / owner / department scope (all or assigned entity IDs)
- Read-only without `administration.scopes.edit`
- Requires `VITE_RBAC_V2_DATA_SCOPE=true`

---

## Audit Logging

| Action | Fields |
|--------|--------|
| `SCOPE_ASSIGNED` | actor, target_user, scope_type, entity_ids, timestamp, reason |
| `SCOPE_UPDATED` | before/after state in `rbac_audit_log` |
| `SCOPE_REMOVED` | actor, target_user, scope row id, reason |

---

## Expected TOKEN_STALE Behavior

| Event | Effect |
|-------|--------|
| Scope assign / update / remove | `users.access_version++`, `scopeHash` changes |
| JWT `av` mismatch | **401 `TOKEN_STALE`** (engine enabled) |
| Phase 4 rollout | Expect **TOKEN_STALE spike** — all users must re-login |
| Flag off | No repository filters; hash still computed if engine on |

See [`A5_1_3_FINAL_APPROVED.md`](./A5_1_3_FINAL_APPROVED.md) — `scopeHash` migration invalidates existing `av` claims.

---

## Rollback Plan

1. Set `RBAC_V2_DATA_SCOPE=false` — repositories skip scope SQL immediately.
2. Scope rows remain in DB (harmless).
3. To stop `av` invalidation from scope changes while keeping engine: leave assignments unchanged; no rollback migration required.
4. Full rollback of engine: `RBAC_V2_AUTHORIZATION_ENGINE=false` per [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md).

---

## Testing

```powershell
cd backend
node --import tsx --test src/auth/dataScopeEnforcement.test.ts
```

| Category | Tests |
|----------|------:|
| Scope hash | 2 |
| Repository enforcement | 6 |
| Access version / scopeHash | 2 |
| Break-glass all scopes | 1 |
| **Total (A5.1.4 file)** | **11** |

**Validated scenarios (unit level):**

- Payroll officer department A cannot match department B filter SQL
- Property manager assigned property X — `rowMatchesScope` blocks property Y
- Scope assignment changes `scopeHash` → different composite `av`

---

## Enablement

```env
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_AUTHORIZATION_ENGINE=true
RBAC_V2_DATA_SCOPE=true
VITE_RBAC_V2_DATA_SCOPE=true
```

All users **must re-login** after enabling scope enforcement on a live tenant.

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| `EffectiveAccessContext.scopes` populated | ✅ |
| `scopeHash` operational | ✅ |
| Repository enforcement (pilot modules) | ✅ |
| Report enforcement (rental pilot) | ✅ |
| Data scope administration | ✅ |
| JWT invalidation on scope change | ✅ |
| Ready for security review | ✅ |

---

*End of A5.1.4 implementation report.*

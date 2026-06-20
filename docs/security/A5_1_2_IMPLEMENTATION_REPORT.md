# A5.1.2 — RBAC 2.0 Role Management Implementation Report

**Phase:** A5.1.2 — Role Management + Security Foundation  
**Date:** 2026-06-19  
**Authority:** [`RBAC_2_PHASE1_APPROVED.md`](./RBAC_2_PHASE1_APPROVED.md)

---

## Summary

Phase 2 introduces RBAC 2.0 role management behind feature flag **`RBAC_V2_ROLE_MANAGEMENT`** (default: `false`). When disabled, existing `/api/v1/rbac/*` endpoints and authorization behavior are unchanged. When enabled, `/api/v1/security/*` endpoints enforce delegation, privilege ceiling, and SoD validation on role mutations.

---

## Files Added

| File | Purpose |
|------|---------|
| `database/migrations/133_rbac_v2_role_management.sql` | Templates table, audit log, role version hash, assignment lifecycle |
| `shared/rbac/restrictedPermissions.ts` | Privilege ceiling restricted registry |
| `shared/rbac/roleTemplates.ts` | 10 SoD-safe industry templates (SSOT: bundles + permissions) |
| `backend/src/modules/rbac/services/rbacV2FeatureFlag.ts` | Feature flag gate |
| `backend/src/modules/rbac/services/rbacPermissionExpansion.ts` | Bundle expansion via `permissionBundles.ts` |
| `backend/src/modules/rbac/services/rbacSodService.ts` | `assertNoSodViolation()` |
| `backend/src/modules/rbac/services/rbacDelegationService.ts` | `assertCanDelegate()` |
| `backend/src/modules/rbac/services/rbacPrivilegeCeilingService.ts` | Privilege ceiling enforcement |
| `backend/src/modules/rbac/services/rbacRoleVersionService.ts` | `role_version_hash` computation |
| `backend/src/modules/rbac/services/rbacAuditService.ts` | `rbac_audit_log` writer |
| `backend/src/modules/rbac/services/rbacV2ValidationPipeline.ts` | Ordered validation pipeline |
| `backend/src/modules/rbac/services/rbacSecurityRoleService.ts` | Security role business logic |
| `backend/src/modules/rbac/routes/securityRoleRoutes.ts` | `/security/roles` API |
| `backend/src/modules/rbac/services/rbacV2Validation.test.ts` | Automated validation tests |
| `services/api/securityRbacApi.ts` | Frontend API client |
| `components/settings/security/SecurityRolesSection.tsx` | Administration → Security → Roles UI |
| `docs/security/A5_1_2_IMPLEMENTATION_REPORT.md` | This report |

**Auto-synced:** `restrictedPermissions.ts`, `roleTemplates.ts` → `backend/src/auth/`

---

## Files Modified

| File | Change |
|------|--------|
| `backend/src/modules/rbac/repositories/RbacRepository.ts` | Archive/restore, version hash, audit queries, assignment lifecycle |
| `backend/src/routes/mountVersionedApi.ts` | Mount `securityRoleRouter` |
| `scripts/ensure-shared-financial-cores.mjs` | Sync new shared RBAC files |
| `components/settings/SettingsPage.tsx` | Security — Roles nav (when UI flag enabled) |
| `backend/package.json` | Include `rbacV2Validation.test.ts` in test suite |

**Unchanged when flag off:** `rbacRoutes.ts`, `rbacPermissionResolver.ts`, `rbacMiddleware.ts`, legacy `/rbac/*` behavior.

---

## Schema Changes

Migration **`133_rbac_v2_role_management.sql`** (additive):

| Object | Change |
|--------|--------|
| `rbac_roles` | `role_type`, `archived_at`, `role_version_hash`, `template_id`; status includes `archived` |
| `rbac_user_roles` | `is_active`, `expires_at` |
| `users` | `access_version` (Phase 3 cache invalidation) |
| `tenants` | `rbac_global_version` |
| `rbac_role_templates` | Global template catalog table |
| `rbac_audit_log` | RBAC-specific audit trail |

Existing tables `rbac_roles`, `rbac_role_permissions`, `rbac_user_roles` from migration `131` retained.

---

## API Endpoints

All require auth + subscription. Gated by `RBAC_V2_ROLE_MANAGEMENT=true`.

| Method | Path | Permission |
|--------|------|------------|
| `GET` | `/api/v1/security/roles` | `roles.view` |
| `GET` | `/api/v1/security/roles/:id` | `roles.view` |
| `POST` | `/api/v1/security/roles` | `roles.manage` |
| `PUT` | `/api/v1/security/roles/:id` | `roles.manage` |
| `POST` | `/api/v1/security/roles/:id/archive` | `roles.manage` |
| `POST` | `/api/v1/security/roles/:id/restore` | `roles.manage` |
| `POST` | `/api/v1/security/roles/:id/assign` | `users.role.assign` |
| `POST` | `/api/v1/security/roles/:id/unassign` | `users.role.assign` |
| `GET` | `/api/v1/security/templates` | `roles.view` |
| `POST` | `/api/v1/security/templates/:id/instantiate` | `roles.manage` |
| `GET` | `/api/v1/security/roles-audit` | `audit_logs.rbac.read` |

**Error codes:** `SOD_VIOLATION` (409), `DELEGATION_DENIED` (409), `PRIVILEGE_CEILING_EXCEEDED` (409), `FEATURE_DISABLED` (503).

---

## Counts

| Metric | Count |
|--------|------:|
| Role templates | 10 |
| SoD pairs enforced | 11 |
| Validation pipeline steps | 5 (expandBundles → delegate → ceiling → SoD; holder check on permission update) |
| Existing seeded system roles per tenant | 8 (+ hidden SYSTEM_OWNER) |

---

## SoD Enforcement Points

| Point | Trigger | Validation |
|-------|---------|------------|
| **1 — Role create** | `POST /security/roles`, template instantiate | Expanded permission set on new role |
| **2 — Role assignment** | `POST /security/roles/:id/assign` | Effective union across all user roles |
| **3 — Role permission update** | `PUT /security/roles/:id` when permissions added | Each role holder's effective union |

Bundle expansion uses **`permissionBundles.ts` only** (NR1).

---

## Privilege Ceiling Rules

| Tier | Actor | May grant |
|------|-------|-----------|
| T0/T1 | SYSTEM_OWNER / super_admin | All (subject to delegation invariant) |
| T2 | security_administrator | RBAC admin bundle only |
| T3 | company_admin + delegate | Company admin ceiling (no restricted registry, no approve keys) |
| T4/T5 | Domain / standard users | Cannot delegate |

Restricted registry: `shared/rbac/restrictedPermissions.ts` (mirrors `PRIVILEGE_CEILING.md`).

---

## Audit Events

Written to `rbac_audit_log`:

- `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_ARCHIVED`, `ROLE_RESTORED`
- `ROLE_ASSIGNED`, `ROLE_REMOVED`
- `TEMPLATE_INSTANTIATED`
- `SOD_VIOLATION_BLOCKED`, `PRIVILEGE_CEILING_BLOCKED`, `DELEGATION_DENIED`

Fields: actor, timestamp, target role/user, reason, before/after state (JSON).

---

## Role Version Infrastructure

- `rbac_roles.version` — existing LWW column; incremented on mutations
- `rbac_roles.role_version_hash` — SHA-256 of tenant + role + version + sorted permission keys
- `users.access_version` — incremented on assignment changes (Phase 3 JWT `av` integration)

Aligns with `RBAC_2_ARCHITECTURE_V2.md` §2.5 — no shortcut; full hash wired on permission persist.

---

## Feature Flag

| Env | Default | Purpose |
|-----|---------|---------|
| `RBAC_V2_ROLE_MANAGEMENT` (API) | `false` | Enable `/security/*` role endpoints + validation |
| `VITE_RBAC_V2_ROLE_MANAGEMENT` (client) | unset/`false` | Show Administration → Security → Roles UI |

---

## Testing

```powershell
npm run verify:rbac-v2
cd backend && node --import tsx --test src/modules/rbac/services/rbacV2Validation.test.ts src/modules/rbac/services/rbacV2SecurityClosure.test.ts
```

**33/33** RBAC v2 tests pass (19 validation + 14 security closure), including:

- SoD blocking (payroll create + approve)
- Delegation denial
- Privilege ceiling (security admin → financial.write)
- Role version hash stability
- All 10 templates SoD-safe

---

## Rollback Strategy

1. Set `RBAC_V2_ROLE_MANAGEMENT=false` — disables security API immediately; legacy RBAC resumes.
2. UI hidden when `VITE_RBAC_V2_ROLE_MANAGEMENT` unset.
3. Schema is additive — no rollback migration required for emergency disable.
4. `rbac_audit_log` rows preserved for forensic review.

---

## Not Implemented (Deferred)

- Authorization Engine / effective permission expansion at request time (Phase 3)
- Data scope enforcement (Phase 4)
- Approval matrix enforcement (Phase 5)
- JWT `av` / cache invalidation middleware (Phase 3)

**Break-glass (C2):** Implemented — see [`A5_1_2_C2_IMPLEMENTATION_REPORT.md`](./A5_1_2_C2_IMPLEMENTATION_REPORT.md).

---

## Enable for Testing

```powershell
# API (.env or shell)
RBAC_V2_ROLE_MANAGEMENT=true

# Client build
VITE_RBAC_V2_ROLE_MANAGEMENT=true

npm run db:migrate:staging   # applies 133_rbac_v2_role_management.sql
npm run test:staging
```

---

*End of A5.1.2 implementation report.*

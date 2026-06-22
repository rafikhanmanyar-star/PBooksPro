# RBAC V2 Fresh Tenant Cutover Report

**Date:** 2026-06-22  
**Scope:** RBAC-first tenant provisioning (`seedTenantRbac`) — implementation + validation  
**Status:** PASS (staging DB validation)

---

## 1. Tenant Provisioning Report

### Implementation

| Component | Location |
|-----------|----------|
| `seedTenantRbac()` | `backend/src/modules/rbac/services/seedTenantRbac.ts` |
| System role definitions + SoD-safe seed keys | `shared/rbac/roleTemplates.ts` |
| Integration hook | `bootstrapNewOrganizationData()` in `organizationApprovalService.ts` |

### Registration paths wired

| Path | Creator RBAC assignment |
|------|-------------------------|
| `POST /auth/register-tenant` | Yes — `creatorUserId` passed |
| `npm run org:create --prefix backend` | Yes |
| Trial signup (`trialSignupService.ts`) | Yes — direct `seedTenantRbac` call |
| Admin portal super-user | Assumes roles exist (now seeded at org bootstrap) |

### What `seedTenantRbac()` does

1. Creates **8 system roles** (idempotent, stable IDs per tenant)
2. Seeds **SoD-safe permission keys** into `rbac_role_permissions` (from `getSystemRoleSeedPermissionKeys`)
3. Creates **4 SoD helper roles** (`payroll_officer`, `hr_manager`, `procurement_officer`, `inventory_controller`)
4. Seeds **approval matrix** defaults (`seedTenantApprovalMatrix`)
5. Assigns **creator → `company_admin`** in `rbac_user_roles`
6. Syncs display label to `users.role` / `user_tenants.role` (display only — not auth source when engine on)
7. Bumps `access_version` + `rbac_global_version` on creator assignment

### Staging validation run (`fresh-rbac-79d2b95c`)

```
rolesCreated: 8
permissionsSeeded: 156
helperRolesCreated: 4
creatorAssigned: true
creatorRoleSlug: company_admin
SoD violations: 0
Overall: PASS
```

Evidence: `docs/security/staging-evidence/fresh-tenant-rbac-validation-fresh-rbac-79d2b95c.json`

---

## 2. RBAC Role Seed Report

### System roles (8)

| Slug | Permissions seeded | Full catalog at runtime |
|------|-------------------|-------------------------|
| `SYSTEM_OWNER` | 0 (hidden) | Yes |
| `security_administrator` | 5 | No |
| `super_admin` | 0 | Yes |
| `company_admin` | 51 (SoD-safe) | No |
| `accountant` | 38 (SoD-safe) | No |
| `project_manager` | 39 | No |
| `sales_user` | 6 | No |
| `read_only` | 17 | No |

### SoD helper roles (4)

| Slug | Permissions | SoD intent |
|------|-------------|------------|
| `payroll_officer` | 4 | Create runs, no approve |
| `hr_manager` | 8 | Payroll prep + users, no approve |
| `procurement_officer` | 19 | Create/edit, no approve |
| `inventory_controller` | 5 | GRN prep, no post |

### SoD change for fresh tenants

`company_admin` seed now **excludes `payroll.runs.approve`** (added to `COMPANY_ADMIN_TEMPLATE_KEYS` exclusion list). Creator can prepare payroll; approval requires a separate role (e.g. custom finance approver or super_admin).

### Unit tests

`backend/src/modules/rbac/services/seedTenantRbac.test.ts` — **11/11 pass**

---

## 3. RBAC-Only Validation Report

### Test: legacy columns stripped

After provisioning, validation sets `users.role = 'viewer'` and `user_tenants.role = 'viewer'`, then calls `resolveEffectivePermissions()`.

| Check | Result |
|-------|--------|
| `rbac_user_roles` assignment present | PASS — `company_admin` |
| Permissions resolve from RBAC (not legacy string) | PASS — 132 effective permissions |
| Material permission gap vs seed | PASS — 0 (bundle alias `financial.write` excluded from comparison) |
| SoD violations in seeded roles | PASS — 0 |

### Flow readiness (when V2 flags enabled)

| Flow | RBAC-only ready? | Notes |
|------|------------------|-------|
| Login | Yes | JWT + per-request `resolveEffectivePermissions` |
| User creation | Partial | Still accepts legacy `role` string; syncs to RBAC |
| Role assignment | Yes | Security role APIs + `rbac_user_roles` |
| Permissions | Yes | Engine uses assignments + DB permissions |
| Data scope | Yes | Default all dimensions until grants added |
| Payroll SoD | Yes | Seed SoD-safe; app-level creator≠approver always on |
| Break glass | Yes | Independent of legacy roles |

### API validation

Run with staging API on port 3001:

```powershell
node --import tsx scripts/rbac-fresh-tenant-validation.mjs --env staging --api --keep
```

---

## 4. Legacy Dependency Report (remaining)

### Not required for authorization (proven)

| Item | Status |
|------|--------|
| `users.role` for permission resolution | **Not required** when assignments exist + engine on |
| `user_tenants.role` for permission resolution | **Not required** when assignments exist + engine on |
| Legacy role assignment at tenant create | **Not required** — `seedTenantRbac` assigns `company_admin` |

### Still present (do not remove yet)

| Item | Why it remains |
|------|----------------|
| `users.role` / `user_tenants.role` columns | Display label + JWT stale check + user CRUD backward compat |
| `syncPrimaryUserRole()` | Writes display label after RBAC assign |
| `LEGACY_ROLE_TO_ENTERPRISE` | User CRUD + JWT role strings |
| `ROLE_PERMISSIONS` static matrix | Fallback when zero assignments; static merge for system roles in V2 engine |
| `syncUserRbacFromLegacyRole()` | User create/update API still accepts legacy role picker |
| Frontend legacy role optgroup | `Team Lead`, `Task Contributor` in User Management |
| `isAdminRole()` hardcoded checks | ~15 UI components |

### PakLand recreation checklist

1. Delete existing `pakland-*` tenant (when ready)
2. Create org via registration or `org:create` — **RBAC seeds automatically**
3. Enable V2 flags on production Render:
   - `RBAC_V2_AUTHORIZATION_ENGINE=true`
   - `RBAC_V2_ROLE_MANAGEMENT=true`
   - `RBAC_V2_SOD=true`
   - `RBAC_V2_DATA_SCOPE=true`
   - `RBAC_V2_BREAK_GLASS=true`
4. Verify with `node --import tsx scripts/rbac-fresh-tenant-validation.mjs --env production --api`
5. Assign payroll approver role separately if needed (SoD split)

---

## 5. Validation commands

```powershell
# Unit tests
node --import tsx --test backend/src/modules/rbac/services/seedTenantRbac.test.ts

# Fresh tenant DB validation (staging)
node --import tsx scripts/rbac-fresh-tenant-validation.mjs --env staging --keep

# With API (requires npm run start:backend:staging)
node --import tsx scripts/rbac-fresh-tenant-validation.mjs --env staging --api --keep

# RBAC catalog integrity
npm run verify:rbac-v2
```

---

*End of report.*

# RBAC 2.0 Architecture — PBooksPro (V2)

**Phase:** A5.1.0.4 — Final Review Closure  
**Status:** Architecture package finalized — ready for implementation authorization  
**Date:** June 2026  
**Supersedes:** [`RBAC_2_ARCHITECTURE.md`](./RBAC_2_ARCHITECTURE.md) (v1 draft)  
**Scope:** Planning only — no code, schema, or permission changes

---

## Revision summary (Critical Findings)

| ID | Finding | Resolution | Document |
|----|---------|------------|----------|
| **C1** | Separation of Duties | Mandatory blocking SoD matrix at role assignment | [`SoD_MATRIX.md`](./SoD_MATRIX.md) |
| **C2** | SYSTEM_OWNER auditability | Break-glass sessions, MFA, full audit with `actor_type` | §4.6 |
| **C3** | Company-level isolation | **Option A:** 1 Tenant = 1 Company | §5.1 |
| **C4** | Role cache invalidation | `role_version_hash` in EffectiveAccessContext; event-driven invalidation | §2.5 |
| **C5** | financial.write expansion | Complete migration map | [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) |

### Review #3 findings (A5.1.0.3)

| ID | Finding | Resolution | Document |
|----|---------|------------|----------|
| **H1** | Payroll department scope | `department` scope dimension | §5.2, §5.7 |
| **H2** | Report scope enforcement | Repository `applyDataScope()` mandatory | §5.9 |
| **H3** | Template instantiation escalation | `assertCanDelegate()` on all role mutations | §4.7 |
| **H4** | Journal approval mandatory | Non-disableable matrix seed | §6.4 |
| **H6** | Company admin privilege ceiling | Restricted registry + tier ceilings | §3.4, [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) |
| **NR1** | SoD stub expansion source | Single `permissionBundles.ts` | [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md) |
| **NR2** | project_manager subset | Fully enumerated | [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) §11 |

### Review #4 findings (A5.1.0.4)

| ID | Finding | Resolution | Document |
|----|---------|------------|----------|
| **NH1** | SoD on role permission add | Enforcement Point #3 — validate all role holders | [`SoD_MATRIX.md`](./SoD_MATRIX.md) |
| **NM1** | Break-glass capability governance | Vendor-controlled capability store | §4.6.1 |
| **NM2** | Department table prerequisite | `payroll_departments` exists (Option A) | Plan Phase 4 |
| **NM3** | personal.finance classification | Remove from `financial.write` bundle | [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) §12 |

---

## Document purpose

This document defines the target **RBAC 2.0** architecture for PBooksPro with security foundations required before implementation. It extends the v1 draft with mandatory SoD, SYSTEM_OWNER governance, tenant/company model clarity, version-based cache invalidation, and a complete `financial.write` decomposition plan.

**Related documents:**

| Document | Purpose |
|----------|---------|
| [`SoD_MATRIX.md`](./SoD_MATRIX.md) | Mandatory incompatible permission pairs |
| [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) | `financial.write` → v2 key mapping |
| [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md) | Phased delivery |
| [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) | Restricted permissions + admin ceilings (H6) |
| [`RBAC_2_REVIEW_3_CHANGES.md`](./RBAC_2_REVIEW_3_CHANGES.md) | Review #2 closure summary |
| [`reviews/REVIEW_ACTION_LOG.md`](./reviews/REVIEW_ACTION_LOG.md) | All review findings traceability |
| [`docs/rbac/rbac-v2-specification.md`](../rbac/rbac-v2-specification.md) | Prior delegation/audit spec |

**Hard constraints (unchanged):**

| System | Constraint |
|--------|------------|
| RealtimeDispatchHub | Do not modify event dispatch core |
| Transactional Entity Queue | Do not modify ordering or commit semantics |
| Socket.IO synchronization | RBAC emits standard audit/domain events only |
| Event ordering / LWW | Unaffected — RBAC is pre-handler authorization |
| Accounting engine / FinancialPostingService | GL posting rules unchanged |
| JWT auth flow | Extend payload with version hash; maintain backward compatibility during migration |

---

## Table of contents

1. [Current-state assessment](#1-current-state-assessment)
2. [Future-state architecture](#2-future-state-architecture)
3. [Permission model](#3-permission-model)
4. [Role model](#4-role-model)
6. [Approval model](#6-approval-model)
7. [Separation of duties](#7-separation-of-duties)
8. [Migration strategy](#8-migration-strategy)
9. [Risks](#9-risks)
10. [Rollback strategy](#10-rollback-strategy)

---

## 1. Current-state assessment

*(Unchanged from v1 — see [`RBAC_2_ARCHITECTURE.md`](./RBAC_2_ARCHITECTURE.md) §1 for full detail.)*

**Summary:** Hybrid static matrix + DB-backed roles; 51 permission keys; `super_admin` short-circuit; 45s TTL-only auth cache; no SoD enforcement; `SYSTEM_OWNER` unaudited break-glass; `financial.write` as coarse bundle on 22+ API mounts; no in-tenant company dimension.

**Critical gaps addressed in V2:**

| Gap | v1 state | V2 resolution |
|-----|----------|---------------|
| SoD | Not enforced | §7 + SoD_MATRIX |
| SYSTEM_OWNER | Hidden, implicit all perms | §4.6 break-glass |
| Company scope | Ambiguous "company" dimension | §5.1 Option A |
| Cache | TTL-only (45s) | §2.5 version hash |
| financial.write | Undocumented expansion | PERMISSION_MIGRATION_MAP |

---

## 2. Future-state architecture

### 2.1 Design principles

1. **Defense in depth** — UI hides; API enforces; repositories apply data scope.
2. **Least privilege by default** — granular v2 keys; bundles are migration aliases only.
3. **Separation of duties** — create and approve permissions cannot coexist (blocking, no override).
4. **Auditable break-glass** — SYSTEM_OWNER is session-based, MFA-gated, fully logged.
5. **Immediate revocation** — version hash invalidates cached access without waiting for TTL.
6. **Tenant = company** — organization boundary is `tenant_id`; no in-tenant company_id scope.

### 2.2 Logical architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client (Electron / Web)                        │
│  usePermissions() │ useDataScope() │ useEffectiveAccess()                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ GET /api/v1/rbac/effective-context
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         authMiddleware                                   │
│  JWT verify → role_version_hash check → cache or resolve                 │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌──────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ PermissionEngine │   │ DataScopeEngine      │   │ ApprovalMatrixEngine │
│ + bundle expand  │   │ (project/property/   │   │ + SoD on approvers   │
│ + SoD validate   │   │  owner/department)   │   │                      │
└────────┬─────────┘   └──────────┬───────────┘   └──────────┬───────────┘
         │                        │                          │
         └────────────────────────┼──────────────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │ rbacMiddleware               │
                    └─────────────┬───────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │ Domain modules (/api/v1)     │
                    │ TenantRepository + scope SQL │
                    └─────────────────────────────┘
```

### 2.3 Effective access context (revised)

```typescript
type EffectiveAccessContext = {
  tenantId: string;
  userId: string;
  permissions: Set<PermissionKey>;
  scopes: DataScopeGrant[];           // project | property | owner | department
  approvalCapabilities: ApprovalCapability[];
  roles: { slug: string; roleId: string }[];
  roleVersionHash: string;            // C4 — see §2.5
  resolvedAt: string;
  sessionType: 'standard' | 'break_glass';  // C2
  breakGlassExpiresAt?: string;       // C2 — SYSTEM_OWNER sessions only
};
```

Injected on `AuthedRequest` alongside `resolvedPermissions` during migration.

### 2.4 Module layout

Extend `backend/src/modules/rbac/` (unchanged from v1):

```
modules/rbac/services/
  rbacPermissionEngine.ts      # bundle expand + SoD check on resolve
  rbacDataScopeResolver.ts
  rbacApprovalMatrixService.ts
  rbacDelegationService.ts
  rbacSodService.ts            # NEW — C1 enforcement
  rbacAccessVersionService.ts  # NEW — C4 hash computation + invalidation
  rbacBreakGlassService.ts     # NEW — C2 SYSTEM_OWNER sessions
  rbacAuditService.ts
```

### 2.5 Role cache invalidation (C4)

**Problem:** The v1 design relied on a 45-second TTL (`authUserCache`) for permission changes. Revoked permissions, suspended users, and modified roles could remain effective until cache expiry.

**Decision:** Replace TTL-only correctness with **version-based invalidation**. TTL remains a performance optimization only — correctness is driven by `role_version_hash`.

#### Version hash computation

```
role_version_hash = SHA256(
  tenantId + userId +
  user.is_active +
  user.suspended_at +
  MAX(rbac_roles.version for assigned roles) +
  COUNT(rbac_user_roles) +
  HASH(rbac_role_permissions for assigned roles) +
  HASH(rbac_user_data_scopes) +   -- includes department dimension
  break_glass_session_id (if active)
)
```

Stored denormalized for fast lookup:

| Table | Column | Purpose |
|-------|--------|---------|
| `users` | `access_version` | Increment on suspension, activation |
| `rbac_roles` | `version` | Increment on permission edit (existing LWW column) |
| `tenants` | `rbac_global_version` | Increment on tenant-wide RBAC policy change |

The composite hash is computed at resolve time and cached with the entry.

#### JWT integration

Access token payload extended (backward compatible):

```typescript
type AccessTokenPayload = {
  sub: string;           // userId
  tenantId: string;
  role: string;          // legacy display role
  av: string;            // role_version_hash at issue time
};
```

**authMiddleware flow:**

```
1. Verify JWT signature
2. Load cached EffectiveAccessContext by (userId, tenantId)
3. If cache hit:
     IF cached.roleVersionHash === computeCurrentHash(userId, tenantId)
       → use cache
     ELSE
       → invalidate cache, re-resolve
4. If JWT.av !== currentHash → 401 TOKEN_STALE (same as role stale check)
5. On cache miss → resolve, store with hash, max TTL 45s
```

#### Invalidation events

| Event | Action |
|-------|--------|
| **Permission revocation** (role permission removed) | Increment `rbac_roles.version`; emit `rbac:role_updated` socket event; `invalidateAuthUserCache` for all users with that role |
| **Role modification** (permissions added/changed) | Same as above |
| **User role assignment / revocation** | Increment `users.access_version`; invalidate cache for that user |
| **User suspension** (`is_active = false`) | Immediate invalidation; active requests fail on next middleware pass |
| **User reactivation** | Invalidate + force re-login |
| **Break-glass session end** | Invalidate user cache; revoke break-glass token |
| **Scope assignment change** | Increment `users.access_version`; invalidate user cache |

#### Socket propagation

After RBAC mutation commit:

```typescript
emitEntityEvent({
  tenantId,
  type: 'rbac_access',
  id: userId | roleId,
  action: 'invalidated',
  data: { roleVersionHash, affectedUserIds },
});
```

Client `usePermissions()` / `useEffectiveAccess()` listeners call `queryClient.invalidateQueries(['permissions', 'me'])` on `rbac_access` events — no manual refresh.

#### Revocation flow diagram

```
Admin removes permission P from role R
        │
        ▼
rbacService.updateRolePermissions()
        ├── withAudit()
        ├── rbac_roles.version += 1
        ├── rbac_audit_log row
        ├── compute affected user IDs (holders of role R)
        ├── for each userId: invalidateAuthUserCache(userId, tenantId)
        ├── emitEntityEvent(rbac_access, invalidated)
        └── COMMIT
        │
        ▼
Connected clients receive socket event
        ├── invalidate React Query permission cache
        └── next API call: middleware recomputes hash → new permission set
        │
        ▼
User without P receives 403 on next mutation (no TTL wait)
```

#### User suspension flow

```
Admin sets user.is_active = false
        │
        ▼
usersService.suspendUser()
        ├── users.access_version += 1
        ├── invalidateAuthUserCache(userId, all tenantIds for user)
        ├── emitEntityEvent(rbac_access, suspended)
        └── COMMIT
        │
        ▼
Next request with existing JWT
        ├── cache miss or hash mismatch
        ├── DB lookup: is_active = false
        └── 401 UNAUTHORIZED (not 403 — session terminated)
```

---

## 3. Permission model

### 3.1 Three-layer taxonomy

| Layer | Pattern | Example |
|-------|---------|---------|
| Feature | `{feature}.access` | `rental.access` |
| Page | `{feature}.{page}.view` | `rental.agreements.view` |
| Action | `{feature}.{page}.{action}` | `rental.agreements.approve` |

Standard actions: `view`, `create`, `edit`, `delete`, `approve`, `reverse`, `export`, `print`.

### 3.2 financial.write bundle (C5)

`financial.write` is a **deprecated bundle alias** expanding to the v2 key set defined in [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) §2.

**Rules:**

- PermissionEngine expands bundle before SoD validation and route checks.
- Bundle expansion **excludes** all approve-type permissions (SoD safety).
- Route guards migrate to specific v2 keys per §3 of migration map.
- `project_manager` receives a **subset** of the bundle, not the full expansion set — see [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) §11.

### 3.3 Delegation rules

> **Invariant:** `actor.permissions ⊇ targetRole.permissions`

Combined with SoD: delegated permissions must pass `assertNoSodViolation()` on the target effective set.

### 3.4 Privilege ceiling (H6)

**Problem:** Delegation subset rule alone does not prevent `company_admin` from approaching `super_admin` power when granted `permissions.delegate`.

**Decision:** Tier-based **privilege ceiling** enforced alongside `assertCanDelegate()` and SoD.

| Check | Service |
|-------|---------|
| Actor holds permission | `assertCanDelegate()` |
| No SoD violation | `assertNoSodViolation()` |
| Permission not in restricted registry (for T3/T2) | `assertWithinPrivilegeCeiling()` |
| Target ⊆ actor grantable set | Ceiling rules per role tier |

Full specification: [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md)

**Key rules:**

- **Restricted Permission Registry** — RBAC admin, backup restore, journal approve, period close, `permissions.delegate`, etc. — **super_admin only**.
- **company_admin ceiling** — may delegate business permissions except restricted registry and all `*.approve` keys.
- **security_administrator ceiling** — RBAC keys only; no financial or approve permissions.

---

## 4. Role model

### 4.1 Role types

*(Unchanged from v1 — system, template, custom, composite assignment.)*

### 4.2 System roles

*(Unchanged slugs — see v1 §4.2.)*

**Phase 6 migration note:** `accountant` and `company_admin` roles holding both write and approve capabilities must be split per [`SoD_MATRIX.md`](./SoD_MATRIX.md).

### 4.3 Industry templates

*(Unchanged from v1 §4.3.)*

### 4.4 Multi-role assignments

Effective permissions = union of all roles. **SoD runs on the union** — not per-role.

### 4.5 Role lifecycle

*(Unchanged from v1 §4.5 — version bump on edit feeds C4 hash.)*

### 4.6 SYSTEM_OWNER break-glass design (C2)

**Problem:** `SYSTEM_OWNER` is a hidden seeded role with implicit all permissions. Actions were not distinguishable in audit logs, had no MFA gate, and no session boundary.

**Design:** SYSTEM_OWNER is **never** a standing user assignment for day-to-day work. It is activated only through an explicit **break-glass session**.

#### Break-glass session properties

| Property | Value |
|----------|-------|
| Activation | Dedicated API: `POST /api/v1/rbac/break-glass/activate` |
| MFA | **Required** — TOTP step-up via existing MFA infrastructure |
| Duration | **15 minutes** default (hard max 60 minutes; not configurable per tenant) |
| Token | Short-lived break-glass JWT with `sessionType: 'break_glass'` |
| Permissions | All permissions for session duration |
| Audit | **Every action** logged with `actor_type = 'system_owner'` |
| Concurrent sessions | Max 1 active break-glass session per tenant |
| Assignments | `rbac_user_roles` row for SYSTEM_OWNER must not exist for normal users; session grants temporary elevation |

#### Audit log schema extension

All break-glass actions write to `rbac_audit_log` **and** standard `enterpriseAuditService`:

| Field | Value |
|-------|-------|
| `actor_type` | `'system_owner'` (new enum value) |
| `actor_id` | User who activated break-glass |
| `session_id` | Break-glass session UUID |
| `action` | Business action + `BREAK_GLASS_ACTIVATED` / `BREAK_GLASS_EXPIRED` lifecycle events |
| `ip_address` | Required |
| `user_agent` | Required |

#### Break-glass lifecycle

```
User requests break-glass
        │
        ▼
Verify user in platform_break_glass_capabilities (vendor-controlled, not tenant RBAC)
        │
        ▼
MFA step-up challenge (mandatory)
        │
        ▼
Create break_glass_sessions row (expires_at = now + 15min)
        ├── rbac_audit_log: BREAK_GLASS_ACTIVATED, actor_type=system_owner
        └── Issue break-glass JWT (av = special hash including session_id)
        │
        ▼
All mutations during session:
        ├── actor_type = system_owner on every audit row
        ├── Standard requirePermission checks pass (all permissions)
        └── Display persistent UI banner: "Break-glass active — expires HH:MM"
        │
        ▼
Session expiry (cron or middleware check):
        ├── Invalidate JWT (401)
        ├── rbac_audit_log: BREAK_GLASS_EXPIRED
        └── Delete break_glass_sessions row
```

#### super_admin vs SYSTEM_OWNER

| Aspect | super_admin | SYSTEM_OWNER break-glass |
|--------|-------------|--------------------------|
| Visibility | Visible role | Hidden |
| Assignment | Standing role | Session only |
| MFA | Standard login MFA policy | Mandatory step-up every session |
| Session | Normal JWT TTL | 15 min hard expiry |
| Audit actor_type | `user` | `system_owner` |
| Use case | Tenant administration | Recovery, bootstrap, emergency |

#### 4.6.1 Break-glass capability governance (NM1)

**Problem:** "Tenant bootstrap list" for who may activate break-glass was undefined — risk of tenant self-granting break-glass access.

**Decision:** Break-glass **capability** is **vendor-controlled**, **not tenant-assignable**, and stored outside tenant RBAC tables.

| Aspect | Specification |
|--------|---------------|
| **Storage location** | Platform table `platform_break_glass_capabilities` (implementation phase) — **not** `rbac_user_roles`, not `rbac_role_permissions`, not tenant `app_settings` |
| **Row shape** | `(tenant_id, user_id, granted_by_platform_user_id, granted_at, revoked_at, reason)` |
| **Assignment authority** | **PBooksPro vendor platform admin only** (admin portal super-admin API) — not `super_admin`, not `company_admin`, not `security_administrator` |
| **Revocation authority** | Vendor platform admin (immediate); auto-revoke on user deactivation; auto-revoke when user removed from tenant |
| **Tenant visibility** | Read-only audit: tenant `super_admin` may see *that* break-glass was used (audit log) but **cannot** grant or revoke capability |
| **Activation gate** | `POST /break-glass/activate` checks `platform_break_glass_capabilities` where `revoked_at IS NULL` **before** MFA step-up |
| **Maximum holders** | 2 capability rows per tenant (bootstrap + backup); enforced at platform API |

**Rationale:** Break-glass is vendor recovery / compliance tooling. Tenants must not assign standing paths to implicit all-permissions access.

**Explicit prohibitions:** No tenant Settings UI; no RBAC permission key; no tenant API writes to capability table.

### 4.7 Template instantiation security (H3)

**Problem:** Instantiating a role template or cloning a role could grant permissions the actor does not hold — a privilege escalation path separate from SoD.

**Decision:** `assertCanDelegate(actor, targetPermissions)` **must execute** on every path that materializes permissions onto a role or user:

| Operation | Service entry point | Validates |
|-----------|---------------------|-----------|
| Role creation | `rbacService.createRole()` | `targetPermissions ⊆ actor.permissions` |
| Role permission update | `rbacService.updateRolePermissions()` | Resulting set + **SoD holder check** ([SoD Point #3](../SoD_MATRIX.md#enforcement-point-3--role-permission-updates)) when permissions added |
| Role assignment to user | `rbacUserRoleService.assignRoles()` | Union of user's new effective set |
| Role clone | `rbacService.cloneRole()` | Cloned permission set |
| Template instantiation | `rbacTemplateService.instantiate()` | Template permission set |

**Validation pipeline (all five operations):**

```
1. rbacPermissionEngine.expandBundles(targetPermissions)
2. rbacDelegationService.assertCanDelegate(actor, expanded)
3. rbacPrivilegeCeilingService.assertWithinCeiling(actor, expanded)
4. rbacSodService.assertNoSodViolation(expanded)
5. COMMIT + audit + cache invalidation
```

**Acceptance criteria (implementation phase):**

- [ ] Template instantiation blocked if actor does not hold **every** permission in template (HTTP 409 `DELEGATION_DENIED`)
- [ ] Template with restricted permission blocked for `company_admin` (HTTP 409 `PRIVILEGE_CEILING_EXCEEDED`)
- [ ] Role clone blocked if source role exceeds actor ceiling
- [ ] `super_admin` passes delegation and ceiling checks; still subject to SoD on target set
- [ ] Blocked attempts audited (`DELEGATION_DENIED`, `PRIVILEGE_CEILING_EXCEEDED`, `SOD_VIOLATION`)
- [ ] Delegation failure is **separate from SoD failure** (distinct error codes)

**Template instantiation is not exempt** — holding `roles.template.use` alone is insufficient.

---

## 5. Data scope model

### 5.1 Company isolation decision (C3)

**Decision: Option A — 1 Tenant = 1 Company (Organization)**

| Concept | Implementation |
|---------|----------------|
| **Company / Organization** | `tenants` table row |
| **Isolation boundary** | `tenant_id` on all business tables |
| **Multi-company users** | `user_tenants` membership + JWT `tenantId` switch via `/auth/select-company` |
| **In-tenant company_id** | **Not used** — no `company_id` RBAC scope dimension |

**Rationale:**

- PostgreSQL schema has no `company_id` column on business entities (verified: no migration defines tenant-scoped `company_id`).
- `user_tenants` (migration `096`) models multi-organization access as **separate tenants**, not sub-companies within one tenant.
- Product login flow (`/auth/select-company`) switches JWT `tenantId` — each selection is a distinct company database boundary.
- Option B (1 Tenant = Multiple Companies) would require a new legal-entity model, `company_id` on all tables, and mandatory company scope — deferred as a future major initiative, not RBAC 2.0.

**Business requirement mapping:**

| Stated requirement | V2 interpretation |
|--------------------|-------------------|
| All Companies | User has `user_tenants` rows for each org; switches via select-company |
| Assigned Companies | Subset of `user_tenants` memberships (future: restrict which tenants user may select) |
| All Projects / Assigned Projects | In-tenant scope dimension (`project`) — §5.2 |
| All Properties / Assigned Properties | In-tenant scope dimension (`property`) — §5.2 |
| All Owners / Assigned Owners | In-tenant scope dimension (`owner`) — §5.2 |

### 5.2 Scope dimensions (revised)

| Dimension | All | Assigned | Entity FK | Primary modules |
|-----------|-----|----------|-----------|-----------------|
| **Project** | All projects in tenant | Subset | `projects.id` | Construction, procurement, project selling |
| **Property** | All buildings/properties | Subset | `buildings.id`, `properties.id` | Rental, facility |
| **Owner** | All owner/investor contacts | Subset | `contacts.id` | CRM, investor modules |
| **Department** | All departments | Subset | `payroll_departments.id` | Payroll, HR, employee records |

**Removed from v1:** in-tenant `company` dimension (Option A — see §5.1).

**Added in Review #3 (H1):** `department` dimension for payroll and HR isolation within a tenant.

### 5.3 Scope diagrams (revised)

**Single-tenant request (typical):**

```
JWT.tenantId ──► tenant_id filter (mandatory)
                      │
                      ├── permission check (feature/page/action)
                      │
                      └── scope filter (project | property | owner | department)
                              │
                              ▼
                         Repository SQL
```

**Multi-company user (cross-tenant):**

```
User ──► user_tenants [T1, T2, T3]
              │
              ▼
     select-company → JWT.tenantId = T2
              │
              ▼
     All queries scoped to T2 only
     (no cross-tenant data in single session)
```

### 5.4 Scope grant model

User-level and role-level grants are **unioned per dimension** (OR semantics — least restrictive wins within the user's effective grants):

1. No rows for a dimension → implicit `mode: all` (§5.6).
2. **Any** grant with `entity_id IS NULL` (all marker), whether user-level or role-level → `mode: all` for that dimension.
3. Otherwise → `mode: assigned` with the union of distinct `entity_id` values from user and role rows.

**Precedence example (A5.1.4.1 / M5):** User-level ALL on `department` + role-level ASSIGNED to `dept_a` → effective **`all`** (user ALL overrides role constraint).

Implementation: `mergeEffectiveDataScopeGrants()` in `backend/src/auth/dataScopeResolver.ts`.

### 5.5 Storage

```
rbac_user_data_scopes   (tenant_id, user_id, dimension, entity_id)
rbac_role_data_scopes   (tenant_id, role_id, dimension, entity_id)
```

No `company` dimension column. **`department`** entity FK is **`payroll_departments.id`** (migration `021_payroll.sql` — table already exists; see Implementation Plan Phase 4 prerequisite NM2).

### 5.6 Default scope policy

| Role | Project | Property | Owner | Department |
|------|---------|----------|-------|------------|
| `super_admin`, `company_admin` | all | all | all | all |
| `accountant` | all | all | all | all |
| `project_manager` | assigned | all | — | — |
| `sales_user` | assigned | — | assigned | — |
| `payroll_officer` (template) | — | — | — | assigned |
| `hr_manager` (template) | — | — | — | assigned |

No scope rows during migration = implicit **all** within tenant for every dimension.

### 5.7 Department scope dimension (H1)

**Problem:** Payroll officers and HR managers require access limited to their department's employees and payroll runs, not tenant-wide HR data.

**Decision:** `department` is a **mandatory scope dimension** for payroll and HR modules when `RBAC_V2_DATA_SCOPE` is enabled.

#### Modules requiring department scope

| Module | Repository / route area | Scope column |
|--------|-------------------------|--------------|
| Payroll | `payrollRouter`, payroll repositories | `department_id` on employees, runs |
| HR / employees | Employee CRUD, org structure | `department_id` |
| Payroll reports | Department-filtered report queries | via employee/run join |

#### Default behavior

| Scenario | Behavior |
|----------|----------|
| Flag off (`RBAC_V2_DATA_SCOPE`) | No department filter — current behavior |
| Flag on, no scope rows | **All departments** (migration safe default) |
| Flag on, assigned departments | SQL filter: `department_id IN (assigned_ids)` |
| HR manager template | Seeded with `assigned` mode — admin assigns departments at onboarding |
| Payroll officer template | Same |

#### Scope administration

- Assign via Settings → Data Scope → Department tab.
- Requires `administration.scopes.edit` (restricted — super_admin or delegated per [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md)).
- Scope grant increments `users.access_version` (C4).

### 5.8 Default scope behavior (summary)

```
Effective department scope =
  IF any role/user grant has mode 'all' → ALL departments
  ELSE → UNION(assigned department_ids)

Cross-dimension: filters AND across dimensions
  (user must pass project scope AND department scope where both apply)
```

**Payroll list example:**

```sql
-- Repository layer (mandatory when flag on)
WHERE tenant_id = $1
  AND applyDataScope(scopes, 'department', 'department_id')
  AND applyDataScope(scopes, 'project', 'project_id')  -- if applicable
```

### 5.9 Report engine enforcement (H2)

**Problem:** Passing scope as report **parameters** allows clients to widen or narrow filters arbitrarily, bypassing authorization.

**Decision:** All report queries **must** apply data scope at the **repository layer** via `applyDataScope()`. Parameter-only scope passing is **prohibited**.

#### Architecture

```
Report API request
        │
        ▼
requirePermission('reports.*.read')     ← permission gate
        │
        ▼
ReportService.run(params)
        │
        ├── params used for: date range, report type, format ONLY
        ├── params NOT used for: tenant, project, property, owner, department scope
        │
        ▼
ReportRepository / module repository
        │
        ├── WHERE tenant_id = req.tenantId        (mandatory)
        └── applyDataScope(req.effectiveAccess.scopes, ...)  (mandatory)
        │
        ▼
Result set (already filtered)
```

#### Rules

| Rule | Detail |
|------|--------|
| **No client scope parameters** | Reject `projectIds`, `departmentIds`, etc. from request body for authorization |
| **Repository enforcement** | Every report SQL path calls `applyDataScope()` |
| **Shared report engines** | `shared/report-engines/` receive pre-scoped data or scope context from service — never raw unscoped queries |
| **Custom reports** | Template execution applies actor scope; saved templates cannot embed scope-bypass filters |
| **Export / print** | Same scope as read — no wider export than view |
| **Consolidated reports** | `scopeIsConsolidated()` reports require explicit `reports.consolidated.read` + all-dimension scope |

#### Modules in scope (Phase 4–5)

- Financial reports (trial balance, P&L, balance sheet, cash flow)
- Rental reporting routes
- Construction reporting routes
- Custom report builder / designer
- Payroll reports
- Dashboard analytics snapshots that aggregate tenant data

#### Acceptance criteria (implementation phase)

- [ ] Report API ignoring client-supplied `departmentIds` for filtering
- [ ] Integration test: scoped user receives empty/partial result; cannot widen via params
- [ ] `npm run verify:rbac-v2` greps report repositories for `applyDataScope` presence
- [ ] Pen test: parameter tampering does not expose out-of-scope rows

---

## 6. Approval model

Permission-based **ApprovalMatrixEngine** replaces hardcoded role-slug routing in `workflowEngineService`.

**SoD integration:** Approvers must hold approve permission but must **not** hold the paired create permission for the same domain (enforced at assignment, not at approve time).

**Requester check:** Service layer rejects self-approval regardless of permissions.

### 6.1 Matrix rule structure

*(Unchanged — entity type, amount thresholds, required permission, approval level.)*

### 6.2 Default matrix seeds

Per-tenant seeds for PO, payroll, rental agreements, vendor bills, payments — see Implementation Plan Phase 5.

### 6.3 Segregation of duties at approve time

Requester ≠ approver enforced in service layer. Approver pool excludes users with SoD conflict for the entity's create/approve pair.

### 6.4 Mandatory journal approval (H4)

**Problem:** Manual journal entries could post without approval or tenants could disable journal approval via workflow settings.

**Decision:** Manual journal approval is **mandatory**, **non-configurable**, and **cannot be disabled** by any tenant setting or feature flag.

#### Policy

| Rule | Detail |
|------|--------|
| **Always on** | Every manual journal (`POST /transactions/journal`) requires completed approval workflow before GL post |
| **No tenant override** | Workflow settings UI must not expose "disable journal approval" |
| **No auto-approve bypass** | `AUTO_APPROVE` path disabled for `manual_journal` entity type |
| **SoD** | `accounting.journals.create` and `accounting.journals.approve` cannot coexist (see [`SoD_MATRIX.md`](./SoD_MATRIX.md)) |
| **Restricted approve** | `accounting.journals.approve` in Restricted Permission Registry — super_admin assigns to approver roles only |

#### Default matrix seed (required per tenant)

| Field | Value |
|-------|-------|
| `entity_type` | `manual_journal` |
| `priority` | 100 |
| `required_permission` | `accounting.journals.approve` |
| `approval_level` | 1 |
| `min_approvers` | 1 |
| `allow_self_approval` | false |
| `conditions.min_amount` | null (all amounts) |

Optional level 2 seed for amounts above tenant-configured threshold (not disablement):

| Field | Value |
|-------|-------|
| `entity_type` | `manual_journal` |
| `approval_level` | 2 |
| `required_permission` | `administration.approvals.final` |
| `conditions.min_amount` | tenant threshold (default: 1,000,000) |

#### Approval flow

```
Accountant creates journal (accounting.journals.create)
        │
        ▼
submitEntityForApproval(entityType: manual_journal)
        ├── ApprovalMatrixEngine selects approvers with accounting.journals.approve
        ├── Excludes requester (SoD)
        └── emitApprovalEvent() → queue UI
        │
        ▼
Approver acts (accounting.journals.approve required)
        ├── Self-approval check → reject
        └── On approve → FinancialPostingService posts GL
        │
        ▼
Journal reversal (accounting.journals.reverse)
        ├── Separate approval request (entityType: journal_reversal)
        ├── Required permission: accounting.journals.approve
        └── SoD: reverse + approve cannot be same user (same pair as SoD matrix)
```

#### Acceptance criteria (implementation phase)

- [ ] No workflow setting disables manual journal approval
- [ ] Default `manual_journal` matrix seed present for every tenant after migration
- [ ] Unapproved journal cannot reach FinancialPostingService
- [ ] Reversal requires separate approval step
- [ ] CI test: tenant admin cannot toggle journal approval off

---

## 7. Separation of duties

### 7.1 Policy

Full matrix: [`SoD_MATRIX.md`](./SoD_MATRIX.md)

**Non-negotiable rules:**

- Violations are **blocking** (HTTP 409 `SOD_VIOLATION`).
- No tenant override, no configuration option, no warnings-only mode.
- Validation runs on expanded v2 permissions (post bundle expansion).
- Applies to effective permission **union** across all assigned roles.

### 7.2 Enforcement architecture

```
Role / template / clone / assign request
        │
        ▼
rbacPermissionEngine.expandBundles(targetPerms)   ← permissionBundles.ts (NR1)
        │
        ▼
rbacDelegationService.assertCanDelegate(actor, expanded)   ← H3
        │
        ▼
rbacPrivilegeCeilingService.assertWithinCeiling(actor, expanded)   ← H6
        │
        ▼
rbacSodService.assertNoSodViolation(expanded)   ← role set (C1)
        │
        ▼
[If role permission ADD] rbacSodService.assertNoViolationForRoleHolders(roleId, expanded)   ← NH1
        │
        ├── pass → commit + audit + invalidate caches (C4)
        └── fail → 409 (DELEGATION_DENIED | PRIVILEGE_CEILING_EXCEEDED | SOD_VIOLATION)
```

### 7.3 Impact on system roles

Migration Phase 6 must split roles that violate SoD after expansion — e.g. separate **Preparer** and **Approver** templates for accounting and payroll.

---

## 8. Migration strategy

### 8.1 Principles

*(Extended from v1 with C1–C5 requirements.)*

1. SoD enforcement enabled in Phase 2 before broad role customization.
2. `role_version_hash` enabled in Phase 3 before route guard migration.
3. `financial.write` decomposition per PERMISSION_MIGRATION_MAP.
4. Option A tenant model — no company_id scope work.
5. SYSTEM_OWNER break-glass in Phase 2 before production cutover.

### 8.2 Feature flags

| Flag | Phase | Purpose |
|------|-------|---------|
| `RBAC_V2_SOD` | 2 | Enable blocking SoD checks |
| `RBAC_V2_BREAK_GLASS` | 2 | SYSTEM_OWNER session mode |
| `RBAC_V2_VERSION_HASH` | 3 | Version-based cache invalidation |
| `RBAC_V2_CATALOG` | 1 | Hierarchical catalog |
| `RBAC_V2_RESOLVER` | 3 | PermissionEngine with bundle expand |
| `RBAC_V2_DATA_SCOPE` | 4 | Repository scope filters |
| `RBAC_V2_APPROVAL_MATRIX` | 5 | Matrix-based approvers |
| `RBAC_V2_STRICT_MODE` | 7 | Deny unmapped permissions |

### 8.3 Migration phases

See [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md).

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| SoD breaks existing admin workflows | Phase 6 role split templates; staging pilot |
| Break-glass misuse | MFA + 15min expiry + actor_type audit + max 1 session |
| Version hash compute cost | Denormalized `access_version`; cache hash with entry |
| financial.write partial migration | PERMISSION_MIGRATION_MAP + CI verify |
| Option A limits holding-company model | Document as future Option B initiative |
| Scope data leak | Repository-level enforcement; integration tests |

---

## 10. Rollback strategy

| Component | Rollback |
|-----------|----------|
| SoD | Disable `RBAC_V2_SOD` — **not recommended post-cutover** |
| Break-glass | Disable activation API; existing super_admin unchanged |
| Version hash | Disable `RBAC_V2_VERSION_HASH` → fall back to TTL-only (degraded) |
| Bundle resolver | Disable `RBAC_V2_RESOLVER` |
| Data scope | Disable `RBAC_V2_DATA_SCOPE` |

All rollbacks are feature-flag toggles except SoD post-production (requires security review to disable).

---

## Appendix A — Critical findings checklist

- [x] **C1** SoD matrix defined; blocking; no tenant override
- [x] **C2** SYSTEM_OWNER: audit (`actor_type=system_owner`), MFA, break-glass session, expiry
- [x] **C3** Option A chosen; scope diagrams updated; company_id not used
- [x] **C4** `role_version_hash` in EffectiveAccessContext; revocation/suspension/role flows documented
- [x] **C5** PERMISSION_MIGRATION_MAP complete for all financial.write usages

## Appendix B — Review #3 checklist (A5.1.0.3)

- [x] **H1** Department scope dimension for payroll/HR
- [x] **H2** Report repository `applyDataScope()` mandatory
- [x] **H3** `assertCanDelegate()` on create/assign/clone/template instantiate
- [x] **H4** Mandatory journal approval; default matrix seed
- [x] **H6** Privilege ceiling documented ([`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md))
- [x] **NR1** Single `permissionBundles.ts` source of truth
- [x] **NR2** `project_manager` bundle fully enumerated (PERMISSION_MIGRATION_MAP §11)

## Appendix C — Review #4 checklist (A5.1.0.4)

- [x] **NH1** Role permission add validates all holders (SoD_MATRIX Enforcement Point #3)
- [x] **NM1** Break-glass capability vendor-controlled (§4.6.1)
- [x] **NM2** `payroll_departments` prerequisite documented (Plan Phase 4)
- [x] **NM3** `personal.finance` classified; removed from financial.write bundle (PERMISSION_MIGRATION_MAP §12)

---

*End of RBAC 2.0 Architecture V2.*

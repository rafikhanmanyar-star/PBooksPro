# PBooksPro RBAC v2 — Enterprise Specification

**Author:** Analysis — June 2026  
**Status:** Specification (no code modified)  
**Scope:** Current system analysis + enterprise RBAC v2 design

---

## Table of Contents

1. [All RBAC-Related Files](#1-all-rbac-related-files)
2. [Permission Assignment Flow (Current)](#2-permission-assignment-flow-current)
3. [How Permissions Are Currently Granted](#3-how-permissions-are-currently-granted)
4. [Why Only Super Admin Can Assign Permissions](#4-why-only-super-admin-can-assign-permissions)
5. [Security Risk Analysis](#5-security-risk-analysis)
6. [Enterprise RBAC v2 Design](#6-enterprise-rbac-v2-design)
7. [Implementation Specification](#7-implementation-specification)

---

## 1. All RBAC-Related Files

### Core RBAC Module

| File | Purpose |
|---|---|
| `backend/src/modules/rbac/repositories/RbacRepository.ts` | Database layer — all SQL queries against rbac_* tables |
| `backend/src/modules/rbac/routes/rbacRoutes.ts` | REST API endpoints for roles, permissions, and user-role assignments |
| `backend/src/modules/rbac/services/rbacService.ts` | Business logic — role CRUD, permission catalog, validation |
| `backend/src/modules/rbac/services/rbacPermissionResolver.ts` | Core resolution engine — translates user → assignments → permission set |
| `backend/src/modules/rbac/services/rbacUserRoleService.ts` | User-role sync from legacy role string |

### Auth Layer

| File | Purpose |
|---|---|
| `backend/src/auth/permissions.ts` | **AUTO-GENERATED** — Permission type, ALL_PERMISSIONS array, role→permission matrix, helpers |
| `backend/src/auth/permissionGroups.ts` | UI groupings of permissions for admin panel display |
| `backend/src/auth/jwt.ts` | JWT signing/verification; token payload shape |
| `backend/src/middleware/authMiddleware.ts` | Token validation, DB user lookup, cache management, `resolvedPermissions` injection |
| `backend/src/middleware/rbacMiddleware.ts` | Route guards: `requirePermission`, `requireAnyPermission`, `requireAllPermissions`, `requireRole` |

### Database

| File | Purpose |
|---|---|
| `database/migrations/131_rbac_enhancement.sql` | Defines `rbac_roles`, `rbac_role_permissions`, `rbac_user_roles`; seeds all system roles per tenant |
| `database/migrations/124_sync_user_tenants_role_from_users.sql` | Legacy role synchronization migration |

### Tests

| File | Purpose |
|---|---|
| `backend/src/auth/permissions.test.ts` | Permission matrix unit tests |
| `backend/src/middleware/authMiddleware.test.ts` | Auth middleware behavior tests |
| `backend/src/middleware/rbacMiddleware.test.ts` | Route guard tests |
| `backend/src/modules/rbac/services/rbacPermissionResolver.test.ts` | Resolver logic tests |

### Related (Cross-Cutting)

| File | Purpose |
|---|---|
| `backend/src/modules/admin/adminPortal/middleware/requireAdminPortalSuperAdmin.ts` | Platform-level admin portal guard (separate from tenant RBAC) |
| `backend/src/modules/organization/services/enterpriseAuditService.ts` | Audit log writer called from RBAC routes |
| `backend/src/middleware/introspectionGuard.ts` | GraphQL/introspection discovery guard |

---

## 2. Permission Assignment Flow (Current)

The following traces the complete lifecycle from HTTP request to route execution.

### Step 1 — JWT Extraction and Verification
**File:** `backend/src/middleware/authMiddleware.ts:112–114`

```
Authorization: Bearer <token>
  └─ verifyAccessToken(token)
       └─ Checks signature with JWT_SECRET
       └─ Returns payload: { sub: userId, tenantId, role }
```

The JWT stores: `userId`, `tenantId`, and a `role` string (legacy role name). It does **not** store the permission list.

### Step 2 — Cache Lookup
**File:** `authMiddleware.ts:115–138`

```
authUserCache.get(`${userId}:${tenantId}`)
  └─ HIT  → use cached user + resolvedPermissions (TTL: 45 s)
  └─ MISS → proceed to Step 3
```

Cache is an in-memory `Map<string, AuthCacheEntry>`, capped at 2,000 entries. TTL is 45 seconds.

### Step 3 — Database User Lookup (on cache miss)
**File:** `authMiddleware.ts:141–175`

```sql
SELECT u.id, ut.tenant_id, ut.role, u.username, u.name, u.is_active,
       COALESCE(t.status, 'ACTIVE') AS organization_status, t.rejection_reason
FROM user_tenants ut
INNER JOIN users u ON u.id = ut.user_id
INNER JOIN tenants t ON t.id = ut.tenant_id
WHERE ut.user_id = $1 AND ut.tenant_id = $2
```

Rejects if `is_active = false` or row not found.

### Step 4 — Permission Resolution
**File:** `rbacPermissionResolver.ts:16–59`

```
resolveUserPermissions(tenantId, userId, legacyRole)
  │
  ├─ repo.listUserRoleAssignments(userId)   ← SELECT from rbac_user_roles
  │
  ├─ assignments.length === 0
  │    └─ return permissionsForRole(legacyRole)   ← static matrix fallback
  │
  └─ for each assignment:
       ├─ slug === 'SYSTEM_OWNER' || 'super_admin'
       │    └─ return ALL_PERMISSIONS immediately
       │
       ├─ repo.listRolePermissionKeys(role_id)   ← SELECT from rbac_role_permissions
       │    └─ HAS keys → add to merged Set
       │    └─ EMPTY   → permissionsForRole(slug) fallback
       │
       └─ return [...merged]   ← union of all assigned roles
```

Result is a `Permission[]` stored on `req.resolvedPermissions`.

### Step 5 — Stale Token Check
**File:** `authMiddleware.ts:190–194`

```
isTokenRoleStale(payload.role, user.role)
  └─ JWT role ≠ DB role → invalidate cache + return 401 TOKEN_STALE
```

This catches the case where a user's base role changed after their token was issued.

### Step 6 — Cache Population
**File:** `authMiddleware.ts:178–187`

On a cache miss, the resolved user + permission set is written back to `authUserCache` with a 45-second TTL.

### Step 7 — Route Guard Evaluation
**File:** `rbacMiddleware.ts:19–60`

```
requirePermission('roles.manage')
  └─ requestHasPermission(req, 'roles.manage')
       ├─ req.resolvedPermissions exists → permissionSetHas(resolved, permission)
       └─ fallback → roleHasPermission(req.role, permission)   ← static matrix
```

`permissionSetHas` also checks `PERMISSION_EQUIVALENTS` (e.g. `permissions.read` ↔ `permissions.view`).

### Flow Diagram

```
HTTP Request
    │
    ▼
authMiddleware
    ├── verify JWT signature
    ├── cache hit? ──YES──► inject resolvedPermissions ──────────────┐
    │                                                                  │
    └── cache miss                                                     │
           ├── query user_tenants + users + tenants                    │
           ├── resolveUserPermissions()                                 │
           │     ├── query rbac_user_roles                             │
           │     ├── for each role: query rbac_role_permissions        │
           │     └── return merged Permission[]                        │
           ├── cache result (45s TTL)                                  │
           └── inject resolvedPermissions ─────────────────────────────┘
    │
    ▼
stale token check (JWT role vs DB role)
    │
    ▼
requirePermission('xyz') middleware
    ├── check resolvedPermissions Set
    └── pass or 403 FORBIDDEN
    │
    ▼
Route Handler
```

---

## 3. How Permissions Are Currently Granted

### Static Matrix (Legacy Path)
Defined in `backend/src/auth/permissions.ts` (auto-generated from `shared/rbac/permissions.ts`).

Every `EnterpriseRole` maps to a hardcoded `Set<Permission>`:

| Role | Key Permissions |
|---|---|
| `super_admin` | ALL 51 permissions |
| `company_admin` | Reports read, payroll r/w, users r/manage, billing r/manage, audit, financial.write, permissions.read, backups, PEV, retention, procurement, workflow, goods receipt |
| `accountant` | Reports read, payroll r/w, billing.read, audit, financial.write, permissions.read, PEV, retention, procurement, workflow (approve/view), goods receipt |
| `project_manager` | P&L + cash flow read, project selling read, financial.write, PEV create, retention (v/e/r), procurement quote/PO, workflow view, goods receipt (v/c/e) |
| `sales_user` | project_selling.* (read, catalog.write, marketing, agreements, invoices, payments) |
| `read_only` | Reports read, payroll.read, audit, PEV read, retention view, price history, PO view, workflow view, goods receipt view |

### Dynamic RBAC Path
When a user has rows in `rbac_user_roles`, the resolver queries `rbac_role_permissions` for each assigned role and returns the **union** of all permission keys. This overrides the static matrix entirely (unless the merged set is empty, in which case it falls back).

### System-Seeded Roles (per tenant)
Migration `131_rbac_enhancement.sql` seeds these roles into every tenant on deployment:

| Slug | Visible | Protected | Permissions |
|---|---|---|---|
| `SYSTEM_OWNER` | No (hidden) | Yes | All (implicit) |
| `super_admin` | Yes | Yes | All (implicit) |
| `security_administrator` | Yes | Yes | `roles.view`, `roles.manage`, `permissions.view`, `permissions.manage`, `users.role.assign` |
| `company_admin` | Yes | Yes | See static matrix |
| `accountant` | Yes | Yes | See static matrix |
| `project_manager` | Yes | Yes | See static matrix |
| `sales_user` | Yes | Yes | See static matrix |
| `read_only` | Yes | Yes | See static matrix |

### Who Can Call Assignment APIs
**File:** `rbacRoutes.ts:350`

```typescript
requireAnyPermission('users.role.assign', 'users.manage', 'permissions.manage')
```

Only users holding at least one of these three permissions can PUT user role assignments. Currently that means: `super_admin`, `security_administrator`, or a custom role explicitly granted these.

---

## 4. Why Only Super Admin Can Assign Permissions

### The Root Cause: `company_admin` Missing `roles.manage`

The static permission matrix in `permissions.ts:264–339` deliberately excludes `roles.manage` and `permissions.manage` from `company_admin`:

```typescript
company_admin: new Set([
  // ...reports, payroll, users, billing, financial, backups, etc.
  'users.manage',      // can manage users, NOT assign roles
  'permissions.read',  // can VIEW permissions, NOT manage them
  // ← no 'roles.manage'
  // ← no 'permissions.manage'
  // ← no 'users.role.assign'
]),
```

This is confirmed by the test suite (`rbacPermissionResolver.test.ts:29–32`):

```typescript
it('company admin does not have roles.manage by default', () => {
  assert.equal(roleHasPermission('Admin', 'roles.manage'), false);
  assert.equal(roleHasPermission('Admin', 'permissions.manage'), false);
});
```

### The Guard Chain

When `company_admin` attempts to access `POST /rbac/roles`:

```
requirePermission('roles.manage')
  └─ requestHasPermission(req, 'roles.manage')
       └─ permissionSetHas(resolvedPermissions, 'roles.manage')
            └─ company_admin's set does not contain 'roles.manage'
                 └─ return false → 403 FORBIDDEN
```

### The Design Intent

Restricting `roles.manage` to `super_admin` (and `security_administrator`) prevents a class of **privilege escalation attacks**:

1. A `company_admin` cannot create a role with `financial.write` + `payroll.write` + `billing.manage` and assign it to themselves or a colluding user.
2. A `company_admin` cannot modify the `accountant` system role to add `billing.manage`.
3. A `company_admin` with `users.manage` can create users but cannot control what those users are authorized to do beyond their own role.

### The `security_administrator` Delegation Path

The seeded `security_administrator` role **does** have `roles.manage`. This provides a delegation path without granting super_admin. However, assigning `security_administrator` to a user is itself gated behind `users.role.assign` — which `company_admin` does not have — so the escalation chain is closed.

---

## 5. Security Risk Analysis

### CRITICAL

None identified. The core privilege model is sound.

---

### HIGH

#### H-1: In-Memory Auth Cache Not Distributed
**Location:** `authMiddleware.ts:57`  
**Issue:** `authUserCache` is a process-local `Map`. In a multi-instance API deployment (e.g., Render.com auto-scaling, PM2 cluster), each process holds an independent cache. A permission revocation triggers `invalidateAuthUserCache()` on one process only. Other instances retain the stale entry for up to 45 seconds.  
**Impact:** Revoked permissions remain active across other server instances for the remainder of the TTL window.  
**Mitigation present:** `invalidateAuthUserCache()` is called immediately on role change — effective for single-process deployments only.  
**Recommendation:** Replace with Redis-backed cache, or use a pub/sub event bus to broadcast invalidation to all instances.

#### H-2: `assigned_by` Not Foreign-Key Constrained
**Location:** `131_rbac_enhancement.sql:38`  
```sql
assigned_by TEXT,   -- no FK, no NOT NULL
```
**Issue:** `assigned_by` in `rbac_user_roles` is a nullable TEXT column with no foreign-key constraint to `users.id`. It can be NULL (lost audit trail on legacy sync), a non-existent user ID, or any arbitrary string.  
**Impact:** Audit trail of who assigned a role is unreliable — the chain of accountability is broken.  
**Recommendation:** Enforce `NOT NULL` for new assignments; validate against `users.id` in the service layer; back-fill NULLs with a sentinel value like `'system:migration'`.

---

### MEDIUM

#### M-1: 45-Second Permission Revocation Lag (single instance)
**Location:** `authMiddleware.ts:42`  
**Issue:** Even on a single server, a user whose role is revoked continues to operate for up to 45 seconds because the cache entry is not immediately expired unless the mutation path calls `invalidateAuthUserCache()`. If a revocation happens via a direct DB change (not through the API), no invalidation is triggered at all.  
**Recommendation:** Shorten TTL to 15 seconds for high-security deployments; add a DB-trigger or migration-time mechanism to track cache invalidation needs.

#### M-2: SYSTEM_OWNER Single-User Lock-Out Risk
**Location:** `rbacRoutes.ts:376–380`  
**Issue:** Only a user holding `SYSTEM_OWNER` can assign the `SYSTEM_OWNER` role. If the only `SYSTEM_OWNER` user is deactivated or deleted, the tenant has no recovery path through the API.  
**Recommendation:** Allow `super_admin` as a fallback assignor for `SYSTEM_OWNER`; document and enforce a minimum-two-owner policy per tenant; add a platform-level override in the admin portal.

#### M-3: N+1 Permission Resolution on Cold Cache
**Location:** `rbacPermissionResolver.ts:39`  
```typescript
const dbPerms = await repo.listRolePermissionKeys(assignment.role_id); // one query per role
```
**Issue:** For a user with N role assignments, the resolver issues N sequential queries against `rbac_role_permissions`.  
**Impact:** Performance degradation on cold cache hits; not a security risk but can delay auth resolution under load.  
**Recommendation:** Batch with `WHERE role_id = ANY($1::text[])` and group in application code.

#### M-4: `permissions.ts` is Auto-Generated — No Build Guard
**Location:** `backend/src/auth/permissions.ts:1–3`  
```typescript
// AUTO-GENERATED — do not edit. Source: shared/rbac/permissions.ts
// Regenerate: node scripts/ensure-shared-financial-cores.mjs
```
**Issue:** If this file becomes stale (new permissions added to the shared source but script not run before deployment), routes guarded by the new permissions will either always deny or always allow depending on the fallback logic.  
**Recommendation:** Add a CI check that runs the generation script and asserts the output matches the committed file; fail the build if they differ.

---

### LOW

#### L-1: Hardcoded `isAdminRole` Bypasses RBAC
**Location:** `authMiddleware.ts:37–40`  
```typescript
export function isAdminRole(role: string | undefined): boolean {
  const r = (role ?? '').toLowerCase().replace(/\s+/g, '_');
  return r === 'admin' || r === 'super_admin';
}
```
Used by `requireAdminRole` (`authMiddleware.ts:299`). This guard checks the raw role string, not the resolved permission set. A user with a custom role called `admin` in the DB would pass this guard without any RBAC permissions.  
**Recommendation:** Replace with `requirePermission('users.manage')` or a more specific permission; retire `requireAdminRole`.

#### L-2: `PERMISSION_EQUIVALENTS` Creates Silent Permission Aliases
**Location:** `permissions.ts`  
```typescript
'permissions.read': ['permissions.view'],
'permissions.view': ['permissions.read'],
```
Both names grant identical access. Any future permission added to the list without a corresponding alias could create inconsistent access between old and new role assignments.  
**Recommendation:** Consolidate to one canonical name and add a deprecation migration for the alias.

#### L-3: Custom Role Slug Collision Potential
**Location:** `rbacService.ts`  
Custom role slugs are normalized to lowercase snake_case. The protected slug list is checked, but a user creating a role named `"Super Admin"` or `"super-admin"` triggers the reserved check correctly. However, Unicode normalization (e.g. Cyrillic lookalikes) is not handled.  
**Recommendation:** Apply slug normalization to ASCII-only characters; reject non-ASCII slugs.

---

### Privilege Escalation Analysis Summary

| Attack Vector | Blocked By | Verdict |
|---|---|---|
| `company_admin` grants themselves `roles.manage` | `roles.manage` not in company_admin permission set | ✅ Blocked |
| User with `users.role.assign` creates `super_admin`-equivalent role | Reserved slug validation + `isImmutableAllPermissionsRole()` | ✅ Blocked |
| User with `users.manage` assigns `security_administrator` | `users.manage` ≠ `users.role.assign` — 403 | ✅ Blocked |
| Edit JWT to claim higher role | JWT signed with `JWT_SECRET`; signature verification | ✅ Blocked |
| Forge `assigned_by` to impersonate an admin | No FK enforcement — **trail unreliable**, not exploitable | ⚠️ Audit gap |
| Cross-tenant role assignment | All queries include `WHERE tenant_id = $1` | ✅ Blocked |
| Stale token with old high role | Stale token detection at `authMiddleware.ts:190` | ✅ Blocked |

---

## 6. Enterprise RBAC v2 Design

### Design Goals

1. **Super Admin remains highest** — all permissions, cannot be restricted
2. **Admin can manage permissions** — scoped delegation without full super_admin
3. **All permission assignments are auditable** — immutable audit log with actor, target, before/after state
4. **Role templates** — reusable permission blueprints that roles can instantiate from
5. **Multi-company security maintained** — strict tenant isolation, no cross-tenant leakage

### Role Hierarchy (v2)

```
SYSTEM_OWNER  (hidden, recovery only — unchanged)
      │
 super_admin  (all permissions — unchanged)
      │
 ┌────┴────────────────┐
 │                     │
company_admin    security_administrator
 │                     │
 ├─ accountant         └─ [custom RBAC admin roles]
 ├─ project_manager
 ├─ sales_user
 └─ read_only

[custom roles]  ← created from role templates or from scratch
```

**Key change:** `company_admin` gains the ability to manage permissions **within their own permission scope** (cannot grant what they do not hold), gated by a new `permissions.delegate` permission that `super_admin` must explicitly grant them.

### New Permission Keys (v2)

```typescript
// Delegation control
'permissions.delegate'     // may assign permissions up to own level
'roles.template.create'    // create role templates
'roles.template.use'       // instantiate roles from templates
'roles.template.manage'    // edit/delete role templates

// Audit
'audit_logs.rbac.read'     // read RBAC-specific audit trail

// Time-limited assignments
'roles.assign.temporary'   // assign roles with expiry dates
```

### Delegation Rule: "You Can Only Grant What You Have"

The core invariant of safe delegation:

> **A user may only assign permissions that are a subset of their own resolved permission set.**

This is enforced at the service layer, not the route guard level:

```
actor.resolvedPermissions ⊇ targetPermissions   (required)
```

This means `company_admin` with `permissions.delegate` can:
- Create custom roles containing permissions from `company_admin`'s own set
- Assign those custom roles to users in their tenant
- Cannot create or assign any permission they themselves do not hold

### Role Templates

A **role template** is a named, reusable permission blueprint stored in a new `rbac_role_templates` table. Templates are:
- Tenant-scoped (each company defines their own)
- **Or** platform-scoped (super_admin creates global templates available to all tenants)
- Versioned (immutable once published; new versions create new template records)
- Instantiated into actual roles (the role holds a `template_id` reference, not a live link)

**Example templates:**
- `"Junior Accountant"` — subset of `accountant` without `payroll.write`
- `"Procurement Viewer"` — `purchase_order.view` + `goods_receipt.view` only
- `"Finance Director"` — `company_admin` set + `workflow.admin`

### Audit Log (v2)

Extend the existing `enterpriseAuditService` with a dedicated `rbac_audit_log` table:

```sql
rbac_audit_log
  id            TEXT PRIMARY KEY
  tenant_id     TEXT NOT NULL REFERENCES tenants(id)
  actor_id      TEXT NOT NULL REFERENCES users(id)
  actor_role    TEXT NOT NULL          -- snapshot of actor's role at time of action
  action        TEXT NOT NULL          -- ROLE_CREATED | ROLE_UPDATED | PERMISSION_ADDED |
                                       -- PERMISSION_REMOVED | USER_ROLE_ASSIGNED |
                                       -- USER_ROLE_REVOKED | TEMPLATE_CREATED | etc.
  target_type   TEXT NOT NULL          -- 'role' | 'user' | 'template' | 'permission'
  target_id     TEXT NOT NULL
  target_name   TEXT
  before_state  JSONB                  -- permissions/assignments before change
  after_state   JSONB                  -- permissions/assignments after change
  ip_address    TEXT
  user_agent    TEXT
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

All writes to RBAC tables **must** produce a corresponding `rbac_audit_log` row in the same transaction.

### Time-Limited Role Assignments

Add `expires_at` to `rbac_user_roles`:

```sql
ALTER TABLE rbac_user_roles ADD COLUMN expires_at TIMESTAMPTZ;
```

The permission resolver skips assignments where `expires_at < NOW()`. A background job removes expired rows daily and writes an audit event.

Use cases:
- Grant `project_manager` for a 3-month contract
- Temporary `workflow.admin` for an audit period
- Emergency access grants with automatic expiry

### Multi-Company Security (unchanged + strengthened)

All RBAC v2 operations continue to enforce:

1. Every DB query includes `WHERE tenant_id = $1` — no cross-tenant reads
2. Role assignment validation checks that both the role and the target user belong to the same tenant
3. Template instantiation creates a **copy** of the template's permissions in the target tenant's `rbac_role_permissions` — no live cross-tenant permission references
4. `rbac_audit_log` is tenant-scoped; querying it requires `audit_logs.rbac.read` permission
5. Platform templates are read-only from tenant context; tenants cannot modify them

---

## 7. Implementation Specification

### Phase 1 — Foundation (no breaking changes)

#### 1.1 Audit Log Table

```sql
-- Migration: 140_rbac_audit_log.sql

CREATE TABLE rbac_audit_log (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id      TEXT NOT NULL,
  actor_role    TEXT NOT NULL,
  action        TEXT NOT NULL CHECK (action IN (
                  'ROLE_CREATED', 'ROLE_UPDATED', 'ROLE_DELETED',
                  'PERMISSION_ADDED', 'PERMISSION_REMOVED',
                  'USER_ROLE_ASSIGNED', 'USER_ROLE_REVOKED',
                  'TEMPLATE_CREATED', 'TEMPLATE_UPDATED', 'TEMPLATE_DELETED',
                  'ROLE_FROM_TEMPLATE'
                )),
  target_type   TEXT NOT NULL CHECK (target_type IN ('role', 'user', 'template')),
  target_id     TEXT NOT NULL,
  target_name   TEXT,
  before_state  JSONB,
  after_state   JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rbac_audit_tenant_created ON rbac_audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_rbac_audit_actor          ON rbac_audit_log(actor_id);
CREATE INDEX idx_rbac_audit_target         ON rbac_audit_log(target_type, target_id);
```

#### 1.2 Fix `assigned_by` to Be Non-Nullable for New Rows

In `RbacRepository.assignUserRole()`, enforce that `assignedBy` is always the current authenticated user's ID. Reject NULL at the service layer (application-level FK).

#### 1.3 Add Expiry to User Role Assignments

```sql
-- Migration: 141_rbac_role_expiry.sql

ALTER TABLE rbac_user_roles
  ADD COLUMN expires_at TIMESTAMPTZ,
  ADD COLUMN assignment_note TEXT;

CREATE INDEX idx_rbac_user_roles_expiry ON rbac_user_roles(expires_at)
  WHERE expires_at IS NOT NULL;
```

Update `rbacPermissionResolver.ts` to skip expired assignments:

```typescript
// In listUserRoleAssignments query:
AND (expires_at IS NULL OR expires_at > NOW())
```

#### 1.4 Wrap All RBAC Mutations in `rbac_audit_log` Writes

Create `backend/src/modules/rbac/services/rbacAuditService.ts`:

```typescript
export async function logRbacAction(
  client: pg.PoolClient,
  params: {
    tenantId: string;
    actorId: string;
    actorRole: string;
    action: RbacAuditAction;
    targetType: 'role' | 'user' | 'template';
    targetId: string;
    targetName?: string;
    beforeState?: unknown;
    afterState?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void>
```

Call this in the same `withTransaction()` block as the mutation. If the audit write fails, the entire transaction rolls back.

---

### Phase 2 — Admin Delegation

#### 2.1 New Permissions

Add to `shared/rbac/permissions.ts` (then regenerate `backend/src/auth/permissions.ts`):

```typescript
| 'permissions.delegate'
| 'roles.template.create'
| 'roles.template.use'
| 'roles.template.manage'
| 'audit_logs.rbac.read'
| 'roles.assign.temporary'
```

#### 2.2 Updated `company_admin` Permission Set

`company_admin` does **not** receive `permissions.delegate` by default. It must be explicitly granted by `super_admin` via the RBAC UI. This preserves backward compatibility — existing `company_admin` accounts are unaffected until a `super_admin` chooses to delegate.

#### 2.3 Delegation Enforcement in Service Layer

Add to `rbacService.ts`:

```typescript
/**
 * Validates that the actor may grant every permission in `targetKeys`.
 * Throws FORBIDDEN if actor lacks `permissions.delegate` or attempts to
 * grant a permission they do not themselves hold.
 */
export function assertCanDelegate(
  actorPermissions: Permission[],
  targetKeys: string[]
): void {
  if (!permissionSetHas(actorPermissions, 'permissions.delegate')) {
    throw forbidden('Actor does not have permissions.delegate');
  }
  const actorSet = new Set(actorPermissions);
  const unauthorized = targetKeys.filter((k) => !actorSet.has(k as Permission));
  if (unauthorized.length > 0) {
    throw forbidden(`Cannot grant permissions not held by actor: ${unauthorized.join(', ')}`);
  }
}
```

Call `assertCanDelegate` in `POST /rbac/roles` and `PUT /rbac/roles/:id` when the caller is not `super_admin`.

#### 2.4 Route Guard Update

```typescript
// POST /rbac/roles — allow company_admin with permissions.delegate
requireAnyPermission('roles.manage', 'permissions.delegate')

// PUT /rbac/roles/:id — same
requireAnyPermission('roles.manage', 'permissions.delegate')
```

The delegation rule (§2.3) enforces the scope limit; the route guard only controls entry.

---

### Phase 3 — Role Templates

#### 3.1 Database Schema

```sql
-- Migration: 142_rbac_role_templates.sql

CREATE TABLE rbac_role_templates (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id       TEXT REFERENCES tenants(id) ON DELETE CASCADE,
                  -- NULL = platform-global template (super_admin only)
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, slug)
);

CREATE TABLE rbac_role_template_permissions (
  template_id     TEXT NOT NULL REFERENCES rbac_role_templates(id) ON DELETE CASCADE,
  permission_key  TEXT NOT NULL,
  PRIMARY KEY (template_id, permission_key)
);

-- Track which roles were instantiated from which template version
ALTER TABLE rbac_roles
  ADD COLUMN template_id TEXT REFERENCES rbac_role_templates(id),
  ADD COLUMN template_version INTEGER;
```

#### 3.2 Template API Endpoints

```
GET    /rbac/templates              requireAnyPermission('roles.template.use', 'roles.template.manage')
POST   /rbac/templates              requirePermission('roles.template.create')
GET    /rbac/templates/:id          requireAnyPermission('roles.template.use', 'roles.template.manage')
PUT    /rbac/templates/:id          requirePermission('roles.template.manage')
DELETE /rbac/templates/:id          requirePermission('roles.template.manage')
POST   /rbac/templates/:id/publish  requirePermission('roles.template.manage')
POST   /rbac/roles/from-template    requireAnyPermission('roles.manage', 'roles.template.use')
```

#### 3.3 Template Instantiation Logic

`POST /rbac/roles/from-template`:

1. Load template by ID, validate tenant isolation (template.tenant_id must be NULL or match req.tenantId)
2. Validate all template permission keys exist in `ALL_PERMISSIONS`
3. If actor has `permissions.delegate` (not `roles.manage`), run `assertCanDelegate` against template permissions
4. Create `rbac_roles` row with `template_id` + `template_version` for lineage tracking
5. Insert rows into `rbac_role_permissions` (copy, not live link)
6. Write `rbac_audit_log` with `action: 'ROLE_FROM_TEMPLATE'`, `before_state: null`, `after_state: { permissions: [...] }`

---

### Phase 4 — RBAC Audit UI

#### 4.1 Audit API Endpoint

```
GET /rbac/audit-log
  Query params: page, limit, action, actorId, targetId, dateFrom, dateTo
  Guard: requirePermission('audit_logs.rbac.read')
  Returns: paginated rbac_audit_log rows
```

#### 4.2 Response Shape

```typescript
interface RbacAuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: RbacAuditAction;
  targetType: 'role' | 'user' | 'template';
  targetId: string;
  targetName: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;  // ISO 8601
}

interface RbacAuditLogResponse {
  entries: RbacAuditEntry[];
  total: number;
  page: number;
  limit: number;
}
```

---

### Phase 5 — Distributed Cache

#### 5.1 Redis-Backed Permission Cache

Replace `authUserCache` (in-memory `Map`) with a Redis hash:

```
Key:   auth_cache:{userId}:{tenantId}
Value: JSON-serialized AuthCacheEntry
TTL:   45 seconds (EXPIRE)
```

Invalidation becomes:
```typescript
// Single instance (current)
authUserCache.delete(key);

// Multi-instance (v2)
await redis.del(`auth_cache:${userId}:${tenantId}`);
// All instances automatically get a cache miss on next request
```

For deployments without Redis, the existing in-memory `Map` remains as a fallback with a reduced TTL of 15 seconds.

#### 5.2 Environment Configuration

```env
# New optional env var
RBAC_CACHE_BACKEND=redis         # 'memory' (default) | 'redis'
RBAC_CACHE_TTL_MS=15000          # default 15s (down from 45s)
REDIS_URL=redis://...            # required if RBAC_CACHE_BACKEND=redis
```

---

### Migration Sequence

| Order | Migration File | Description |
|---|---|---|
| 1 | `140_rbac_audit_log.sql` | Create audit log table |
| 2 | `141_rbac_role_expiry.sql` | Add `expires_at` to user role assignments |
| 3 | `142_rbac_role_templates.sql` | Create role templates tables |
| 4 | `143_rbac_permissions_v2.sql` | Add `permissions.delegate` and template permissions to `ALL_PERMISSIONS`; seed `security_administrator` updates |
| 5 | `144_rbac_assigned_by_backfill.sql` | Back-fill NULL `assigned_by` with `'system:migration'` sentinel |

---

### Backward Compatibility

- All existing `rbac_user_roles` rows without `expires_at` are treated as non-expiring (default NULL = no expiry).
- `company_admin` receives no new permissions automatically — a `super_admin` must explicitly grant `permissions.delegate`.
- All existing API routes and response shapes are unchanged.
- The static permission matrix fallback remains for tenants with no RBAC assignments.
- `security_administrator` seeded permissions are unchanged.
- The `rbac_audit_log` is additive — existing code paths continue to work; the audit calls are added alongside existing logic.

---

### Testing Requirements

| Area | Tests Required |
|---|---|
| Delegation | `company_admin` + `permissions.delegate` can create roles within own permission set |
| Delegation boundary | `company_admin` + `permissions.delegate` cannot create roles with permissions they lack |
| Audit log | Every RBAC mutation produces a corresponding `rbac_audit_log` row |
| Audit log atomicity | If audit write fails, the RBAC mutation is rolled back |
| Template instantiation | Role created from template has correct permissions; template lineage tracked |
| Expiry | Expired role assignments are excluded from permission resolution |
| Distributed invalidation | Permission revocation is reflected within one TTL window across simulated instances |
| Multi-tenant isolation | User in tenant A cannot read, modify, or assign roles in tenant B |
| Privilege escalation | All six escalation vectors in §5 remain blocked |

---

*End of specification. No source files were modified during this analysis.*

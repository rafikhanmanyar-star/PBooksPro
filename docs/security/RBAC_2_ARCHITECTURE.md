# RBAC 2.0 Architecture — PBooksPro

**Phase:** A5.1.0 — Architecture & Planning  
**Status:** Draft for review  
**Date:** June 2026  
**Scope:** Planning only — no code, schema, or permission changes in this phase

---

## Document purpose

This document defines the target **Role-Based Access Control 2.0 (RBAC 2.0)** architecture for PBooksPro. It replaces ad-hoc role checks and `super_admin`-centric operations with an enterprise-grade model suitable for builders, property managers, construction companies, and multi-company organizations.

**Related prior work:** [`docs/rbac/rbac-v2-specification.md`](../rbac/rbac-v2-specification.md) (delegation, audit, templates — incorporated and extended here).

**Hard constraints (unchanged):**

| System | Constraint |
|--------|------------|
| RealtimeDispatchHub | Do not modify event dispatch core |
| Transactional Entity Queue | Do not modify ordering or commit semantics |
| Socket.IO synchronization | RBAC emits standard audit/domain events only; no new sync protocol |
| Event ordering / LWW | Unaffected — RBAC is pre-handler authorization |
| Accounting engine / FinancialPostingService | GL posting rules unchanged; RBAC gates who may trigger posting |
| JWT auth flow | Extend payload optionally; do not break existing tokens during migration |

---

## Table of contents

1. [Current-state assessment](#1-current-state-assessment)
2. [Future-state architecture](#2-future-state-architecture)
3. [Permission model](#3-permission-model)
4. [Role model](#4-role-model)
5. [Data scope model](#5-data-scope-model)
6. [Approval model](#6-approval-model)
7. [Migration strategy](#7-migration-strategy)
8. [Risks](#8-risks)
9. [Rollback strategy](#9-rollback-strategy)

---

## 1. Current-state assessment

### 1.1 What exists today

PBooksPro has a **hybrid RBAC** system that combines:

1. **Static permission matrix** — `shared/rbac/permissions.ts` (source of truth) synced to `backend/src/auth/permissions.ts` (auto-generated).
2. **Database-backed roles** — `rbac_roles`, `rbac_role_permissions`, `rbac_user_roles` (migration `131_rbac_enhancement.sql`).
3. **Runtime resolver** — `rbacPermissionResolver.ts` merges DB role permissions with static fallbacks.
4. **Route guards** — `rbacMiddleware.ts` (`requirePermission`, `requireAnyPermission`, legacy `requireRole`).
5. **Frontend gating** — `usePermissions()` hook + `permissionsApi.getMyPermissions()`.

```
HTTP Request
    │
    ▼
authMiddleware ──► resolveUserPermissions(tenantId, userId, legacyRole)
    │                    │
    │                    ├─ rbac_user_roles (if any)
    │                    ├─ rbac_role_permissions per role
    │                    └─ fallback: ROLE_PERMISSIONS[enterpriseRole]
    │
    ▼
req.resolvedPermissions (cached 45s)
    │
    ▼
requirePermission('domain.action') ──► 403 or handler
```

### 1.2 Permission inventory (v1)

| Metric | Value |
|--------|-------|
| Permission keys | **51** (`ALL_PERMISSIONS`) |
| Enterprise roles | **6** assignable + `SYSTEM_OWNER` + `security_administrator` |
| Naming convention | `{domain}.{subfeature}.{action}` or `{domain}.{action}` |
| Modules with explicit keys | Reports, Payroll, Users, Billing, Audit, Financial, RBAC, Backups, PEV, Contracts/Retention, Project Selling, Procurement, PO, Workflow, Goods Receipt |

**Domains without dedicated permission keys today** (rely on `financial.write`, role strings, or open access):

| Business domain | Current gating |
|-----------------|----------------|
| Rental Management | `financial.write` / sidebar role heuristics |
| Property Management | `financial.write` |
| Inventory | `financial.write` or unguarded |
| POS | `financial.write` or unguarded |
| CRM / Contacts | Partial — project selling catalog permissions |
| Project Construction (BOQ, IPC, variations) | `financial.write`, PEV, retention keys |
| Administration / Settings | `users.manage`, `company_admin` role checks |

### 1.3 Role model (v1)

| Slug | Behavior |
|------|----------|
| `SYSTEM_OWNER` | Hidden; all permissions (recovery) |
| `super_admin` | All permissions; short-circuits resolver |
| `security_administrator` | RBAC admin bundle only |
| `company_admin` | Broad tenant admin minus RBAC write (unless delegated) |
| `accountant` | Financial + procurement + workflow approve |
| `project_manager` | Construction/procurement subset + limited reports |
| `sales_user` | Project selling bundle only |
| `read_only` | Read-only across covered domains |

**Legacy mapping** still active: `Admin` → `company_admin`, `Accounts` → `accountant`, etc.

### 1.4 Operational limitations

| Limitation | Impact |
|------------|--------|
| **`super_admin` dependency** | Only super admin (or security administrator for RBAC-only) can assign roles/permissions at scale. Company admins cannot delegate without explicit future `permissions.delegate`. |
| **Flat permission keys** | No structured feature → page → action hierarchy; difficult to build role templates for industry personas (Property Manager, HR Manager). |
| **No data scope** | Users with `financial.write` see all tenant data — no “assigned projects only” or “assigned properties only”. |
| **Role-based workflow approvers** | `workflowEngineService.resolveApproverUserIds()` uses hardcoded role slugs by approval level — not permission- or scope-aware. |
| **Inconsistent frontend checks** | Some modules use `usePermissions()`; others use raw role strings (`useInvestorFundAvailability`, `useProjectProfitabilityAnalytics`, `isAdminRole`). |
| **JWT carries role, not permissions** | Permission changes require cache expiry (45s) or re-login for full effect; acceptable but limits instant revocation without session invalidation. |
| **Single legacy role column** | `users.role` / `user_tenants.role` coexists with `rbac_user_roles`; stale-token detection compares JWT role to DB. |

### 1.5 Strengths to preserve

- Tenant isolation: all RBAC queries scoped by `tenant_id`.
- Union of multiple role assignments supported in resolver.
- Protected system slugs prevent privilege escalation via custom roles.
- Delegation invariant already documented in v2 spec: *grant only what you hold*.
- Existing Settings UI: Role Management, Permission Catalog sections.
- Architecture v2.1 compliance path: permissions in `shared/rbac/`, guards on routes, `usePermissions()` on UI.

---

## 2. Future-state architecture

### 2.1 Design principles

1. **Defense in depth** — UI hides; API enforces; repositories apply data scope.
2. **Least privilege by default** — new permissions opt-in; roles start minimal.
3. **Composable roles** — users hold multiple roles; effective permissions = union.
4. **Separation of concerns** — *what you can do* (permissions) ≠ *what data you see* (scope) ≠ *who approves* (approval matrix).
5. **Backward compatible migration** — v1 keys remain valid aliases during transition.
6. **No sync-layer changes** — RBAC decisions happen before business mutations; existing `emitEntityEvent()` flow unchanged.

### 2.2 Logical architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client (Electron / Web)                        │
│  usePermissions() │ useDataScope() │ useApprovalCapabilities()          │
│  Sidebar/page gates │ action buttons │ approval queue UI                 │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ GET /api/v1/auth/permissions/me
                                    │ GET /api/v1/rbac/effective-context
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         authMiddleware (unchanged mount)                 │
│  JWT verify → cache → resolveEffectiveAccess()                           │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
┌──────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ PermissionEngine │   │ DataScopeEngine      │   │ ApprovalMatrixEngine │
│ (action allow)   │   │ (row/filter scope)   │   │ (workflow routing)   │
└────────┬─────────┘   └──────────┬───────────┘   └──────────┬───────────┘
         │                        │                          │
         └────────────────────────┼──────────────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │ rbacMiddleware guards        │
                    │ requirePermission()          │
                    │ requireScope() [new]           │
                    │ requireApprovalCapability()    │
                    └─────────────┬───────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │ Domain modules (/api/v1)     │
                    │ TenantRepository + scope SQL │
                    └─────────────────────────────┘
```

### 2.3 New module layout (implementation phase)

Extend existing `backend/src/modules/rbac/` — no new top-level platform services:

```
modules/rbac/
  routes/
    rbacRoutes.ts              # existing — extend
    effectiveContextRoutes.ts  # new — permissions + scopes + approval caps
  services/
    rbacPermissionResolver.ts  # extend → PermissionEngine
    rbacDataScopeResolver.ts   # new
    rbacApprovalMatrixService.ts # new
    rbacDelegationService.ts   # from v2 spec
    rbacAuditService.ts        # from v2 spec
  repositories/
    RbacRepository.ts          # extend
    RbacDataScopeRepository.ts # new
    RbacApprovalMatrixRepository.ts # new
```

Shared definitions remain in `shared/rbac/`:

```
shared/rbac/
  permissions.ts           # extended catalog
  permissionCatalog.ts     # new — hierarchical metadata
  dataScopeTypes.ts        # new
  approvalMatrixTypes.ts   # new
  roleTemplates.ts         # new — industry presets
  mfaPolicy.ts             # existing
```

### 2.4 Effective access context

Each authenticated request receives an **EffectiveAccessContext** (server-side only; subset exposed to client):

```typescript
type EffectiveAccessContext = {
  tenantId: string;
  userId: string;
  permissions: Set<PermissionKey>;      // union of all roles
  scopes: DataScopeGrant[];             // dimensional filters
  approvalCapabilities: ApprovalCapability[]; // what user may approve
  roles: { slug: string; roleId: string }[];
  resolvedAt: string;                   // for cache/debug
};
```

Injected on `AuthedRequest` alongside existing `resolvedPermissions` during migration (dual field period).

### 2.5 Integration with Architecture v2.1

| Gate | RBAC 2.0 compliance |
|------|----------------------|
| Tenant isolation | All scope grants include `tenant_id`; repositories never trust client scope |
| Audit | RBAC mutations via `withAudit()` + dedicated `rbac_audit_log` |
| Real-time | Role/scope changes emit `rbac` entity events → client invalidates permission queries |
| Permissions | New keys in `shared/rbac/permissions.ts`; `npm run build:backend` |
| LWW | Role/version conflict on `rbac_roles.version` where applicable |

---

## 3. Permission model

### 3.1 Three-layer permission taxonomy

RBAC 2.0 organizes authorization into three explicit layers. Each layer maps to keys, UI groupings, and route guards.

| Layer | Purpose | Key pattern | Example |
|-------|---------|-------------|---------|
| **Feature** | Module / product area access | `{feature}.access` | `rental.access`, `payroll.access` |
| **Page** | Screen or API resource group | `{feature}.{page}.view` | `rental.agreements.view`, `payroll.runs.view` |
| **Action** | CRUD + domain verbs | `{feature}.{page}.{action}` | `rental.agreements.create`, `payroll.runs.approve` |

**Rule:** `{action}` vocabulary is standardized:

| Action | Meaning |
|--------|---------|
| `view` | Read/list/detail |
| `create` | Insert new records |
| `edit` | Update existing records |
| `delete` | Soft/hard delete |
| `approve` | Workflow approval step |
| `reverse` | Undo/posting reversal |
| `export` | Download / CSV / PDF export |
| `print` | Print layouts |

Feature-level `*.access` implies navigation visibility but **not** data access — page `view` permissions still required.

### 3.2 Feature catalog (target)

| Feature key | Business area | Pages (examples) |
|-------------|---------------|------------------|
| `accounting` | General ledger, journals, COA | `chart_of_accounts`, `journals`, `transactions`, `periods` |
| `rental` | Rental management | `properties`, `units`, `agreements`, `invoices`, `payments`, `collections` |
| `property` | Property / facility management | `buildings`, `units`, `maintenance`, `facility` |
| `projects` | Project construction | `projects`, `boq`, `ipc`, `variations`, `retention` |
| `project_selling` | Sales / marketing | `catalog`, `marketing_plans`, `agreements`, `invoices` |
| `procurement` | Vendors, PO, GRN | `vendors`, `quotations`, `purchase_orders`, `goods_receipts` |
| `inventory` | Stock / materials | `items`, `warehouses`, `movements`, `adjustments` |
| `payroll` | HR payroll | `employees`, `runs`, `payslips`, `deductions` |
| `pos` | Point of sale | `registers`, `sessions`, `sales` |
| `crm` | Contacts / leads | `contacts`, `leads`, `owners`, `clients` |
| `reports` | Financial & operational reports | Per report type (existing `reports.*.read` preserved) |
| `administration` | Tenant admin | `users`, `roles`, `settings`, `backups`, `billing`, `audit` |
| `workflow` | Approval engine config | `queue`, `settings`, `rules` |

### 3.3 v1 → v2 key mapping (compatibility)

Existing keys remain **first-class aliases** during migration. The PermissionEngine resolves both:

| v1 key | v2 canonical key(s) |
|--------|-------------------|
| `financial.write` | `accounting.transactions.edit`, `accounting.journals.create`, … (bundle expansion) |
| `payroll.read` | `payroll.access`, `payroll.employees.view`, `payroll.runs.view` |
| `payroll.write` | `payroll.employees.edit`, `payroll.runs.create`, … |
| `purchase_order.approve` | `procurement.purchase_orders.approve` |
| `workflow.approve` | `workflow.queue.approve` + domain-specific `*.approve` where configured |
| `users.manage` | `administration.users.edit`, `administration.users.create` |
| `roles.manage` | `administration.roles.edit` |

**Bundle permissions:** `financial.write` stays as a **bundle grant** that expands to a defined set of v2 keys internally — avoids breaking ~200 route guards in one release.

### 3.4 Permission catalog metadata

New file `shared/rbac/permissionCatalog.ts` defines machine-readable hierarchy for UI and documentation:

```typescript
type PermissionDefinition = {
  key: string;
  label: string;
  layer: 'feature' | 'page' | 'action';
  feature: string;
  page?: string;
  action?: string;
  implies?: string[];           // keys granted when this key is held
  impliedBy?: string[];         // reverse lookup for bundles
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresMfa?: boolean;        // ties to shared/rbac/mfaPolicy.ts
  deprecated?: boolean;
  aliasOf?: string;             // v1 compatibility
};
```

### 3.5 Delegation rules (from v2 spec, retained)

> **Invariant:** `actor.permissions ⊇ targetRole.permissions`

Additional rules for RBAC 2.0:

- Cannot grant `administration.roles.edit` without holding it.
- Cannot grant scope broader than own scope (see §5).
- `super_admin` and `SYSTEM_OWNER` bypass delegation checks for break-glass only.
- `permissions.delegate` required for non–security-administrator delegation.

### 3.6 MFA and critical actions

Extend `shared/rbac/mfaPolicy.ts` to mark critical permissions:

- `administration.roles.edit`
- `administration.backups.restore`
- `accounting.journals.reverse`
- `payroll.runs.approve`
- `*.approve` above configured amount thresholds

MFA step-up is **orthogonal** to permission check (check permission first, then MFA challenge).

---

## 4. Role model

### 4.1 Role types

| Type | Storage | Editable | Notes |
|------|---------|----------|-------|
| **System** | `rbac_roles.is_system = true` | Protected fields only | Seeded per tenant |
| **Template** | `rbac_role_templates` | Versioned | Blueprint for custom roles |
| **Custom** | `rbac_roles` | Tenant admins with delegation | Instantiated from template or blank |
| **Composite assignment** | `rbac_user_roles` (multiple rows) | Per assignment | Union of permissions |

### 4.2 System roles (preserved + extended)

Existing system roles **retain slugs and default permission sets**. RBAC 2.0 adds mapped v2 keys without removing v1 bundles:

| Slug | Label | RBAC 2.0 persona |
|------|-------|------------------|
| `super_admin` | Super Admin | Full access + break-glass |
| `company_admin` | Company Admin | Tenant administrator |
| `security_administrator` | Security Administrator | RBAC-only admin |
| `accountant` | Accountant | Finance & compliance |
| `project_manager` | Project Manager | Construction & procurement ops |
| `sales_user` | Sales Executive | Project selling |
| `read_only` | Read Only | View-only across granted features |

### 4.3 Industry role templates (new)

Pre-built templates (tenant-instantiated, not live-linked):

| Template | Target persona | Typical features |
|----------|----------------|------------------|
| `property_manager` | Property Manager | `rental.*`, `property.*`, `crm.contacts.view`, limited `reports` |
| `hr_manager` | HR Manager | `payroll.*`, `administration.users.view`, `crm.contacts.view` |
| `payroll_officer` | Payroll Officer | `payroll.runs.*`, `payroll.employees.edit`, no `administration` |
| `procurement_officer` | Procurement Officer | `procurement.*`, `inventory.view`, `workflow.queue.approve` (PO) |
| `sales_executive` | Sales Executive | Maps to extended `sales_user` |
| `site_engineer` | Construction site | `projects.*.view`, `procurement.goods_receipts.create`, scoped projects |
| `finance_controller` | Senior finance | `accounting.*`, `reports.*`, approval caps for payments |

Templates stored in `rbac_role_templates` with `industry` and `version` columns (per v2 spec).

### 4.4 Multi-role assignments

Users may hold **multiple roles** simultaneously (already supported in resolver). RBAC 2.0 UI changes:

- User Management shows role chips (not single dropdown only).
- Primary role for JWT legacy field: highest-privilege system role or `company_admin` default for display.
- Effective permissions = **union**; scopes = **union** of scope grants (see §5.3).

### 4.5 Role lifecycle

```
Template (optional) ──instantiate──► Custom Role ──assign──► User
                         │                │
                         │                ├── add/remove permissions (delegated)
                         │                ├── version bump (LWW on edit)
                         │                └── audit log entry
                         │
                         └── publish version (immutable snapshot)
```

Time-limited assignments: `rbac_user_roles.expires_at` (from v2 spec).

---

## 5. Data scope model

### 5.1 Problem statement

Permissions answer **“May this user perform action X?”**  
Data scope answers **“On which rows may they perform it?”**

Without scope, a Project Manager with `projects.boq.view` sees every project in the tenant.

### 5.2 Scope dimensions

| Dimension | All value | Assigned value | Entity FK |
|-----------|-----------|----------------|-----------|
| **Company** | All legal entities in tenant | Subset of companies | `company_id` / org unit (future) |
| **Project** | All projects | Assigned projects | `projects.id` |
| **Property** | All properties/buildings | Assigned properties | `buildings.id`, `properties.id` |
| **Owner** | All investor/owner contacts | Assigned owners | `contacts.id` (owner type) |

**Note:** PBooksPro today is primarily **single-tenant, multi-project**. “All Companies / Assigned Companies” prepares for multi-company org structures within one tenant (cost centers, legal entities). Phase 4 implements project/property/owner first; company dimension when org model matures.

### 5.3 Scope grant model

```typescript
type ScopeDimension = 'company' | 'project' | 'property' | 'owner';

type DataScopeGrant = {
  dimension: ScopeDimension;
  mode: 'all' | 'assigned';
  entityIds?: string[];  // populated when mode = 'assigned'
};
```

**Effective scope** for a dimension when user has multiple roles:

1. If **any** role grants `mode: 'all'` → effective = all (within tenant).
2. Else effective = union of all `entityIds` across roles and direct user assignments.

### 5.4 Proposed storage (implementation phase)

```
rbac_user_data_scopes
  tenant_id, user_id, dimension, entity_id (nullable for 'all' marker row)
  granted_by, granted_at, expires_at

rbac_role_data_scopes
  tenant_id, role_id, dimension, entity_id
```

Direct user scopes override role scopes for the same dimension (more restrictive wins when both are `assigned` — union of ids; `all` wins over `assigned`).

### 5.5 Enforcement layer

Scope is enforced in **repositories**, not route handlers:

```typescript
// TenantRepository extension pattern
applyDataScope(query, req.effectiveAccess.scopes, {
  dimension: 'project',
  column: 'project_id',
});
```

| Layer | Responsibility |
|-------|----------------|
| Route guard | Permission key check |
| Service | Business rules, approval checks |
| Repository | SQL `WHERE` scope filter |
| Report engine | Scope passed as filter parameter |

**Client scope is never trusted.** Optional `X-Data-Scope-Context` headers may narrow UI filters but server recomputes.

### 5.6 Scope administration permissions

| Permission | Purpose |
|------------|---------|
| `administration.scopes.view` | View user/role scope assignments |
| `administration.scopes.edit` | Assign scopes to users/roles |
| `administration.scopes.delegate` | Grant scopes only within own visibility |

Delegation rule: cannot assign project IDs you cannot see.

### 5.7 Default scope policy (migration)

| Role | Default scope |
|------|---------------|
| `super_admin`, `company_admin` | All (all dimensions) |
| `accountant` | All projects (financial consolidation) |
| `project_manager` | Assigned projects only (new default) |
| `sales_user` | Assigned projects + related owners |
| Custom templates | Defined per template |

Existing users without scope rows → **implicit `all`** during migration (preserve behavior), then tighten per rollout plan.

---

## 6. Approval model

### 6.1 Current state

Workflow engine resolves approvers by **hardcoded role slugs** at approval level:

| Level | Roles |
|-------|-------|
| 1 | super_admin, company_admin, accountant, project_manager |
| 2 | super_admin, company_admin, accountant |
| 3+ | super_admin, company_admin |

Permissions `workflow.approve` gate the approve API but **not** who receives queue items.

### 6.2 Target: permission-based approval matrix

Replace role-slug routing with **ApprovalMatrixEngine**:

```
ApprovalRequest (entity_type, amount, project_id, department_id)
        │
        ▼
ApprovalMatrixEngine.matchRules(tenantId, context)
        │
        ├── Rule: procurement.payments.approve, amount ≤ 500000, scope: project
        ├── Rule: payroll.runs.approve, any amount, permission: payroll.runs.approve
        └── Rule: rental.agreements.approve, level 2, permission: rental.agreements.approve
        │
        ▼
Approver pool = users where:
  - holds required permission
  - data scope includes request context
  - not requester (segregation of duties)
  - active, not expired assignment
```

### 6.3 Approval capability types

| Capability key | Entity types |
|----------------|--------------|
| `approve.payments` | Payment vouchers, rental payments, vendor payments |
| `approve.bills` | Vendor bills, utility bills |
| `approve.agreements` | Rental agreements, project selling agreements |
| `approve.payroll` | Payroll runs |
| `approve.procurement` | PO, quotations, GRN posting |
| `approve.journals` | Manual journal entries (optional high level) |

Capabilities map to permissions — e.g. `approve.payroll` requires `payroll.runs.approve`.

### 6.4 Matrix rule structure

```typescript
type ApprovalMatrixRule = {
  id: string;
  tenantId: string;
  entityType: WorkflowEntityType;
  priority: number;
  conditions: {
    minAmount?: number;
    maxAmount?: number;
    projectIds?: string[];
    departmentIds?: string[];
  };
  requiredPermission: PermissionKey;
  approvalLevel: number;
  minApprovers: number;
  allowSelfApproval: boolean; // default false
};
```

Stored in `rbac_approval_matrix_rules` (implementation phase).

### 6.5 Segregation of duties

| Rule | Enforcement |
|------|-------------|
| Requester ≠ approver | Service layer check on approve action |
| Same user cannot hold conflicting roles | Optional tenant policy (warn vs block) |
| Amount escalation | Higher level rules for higher amounts |
| Scope-bound approval | Approver must have scope covering request's project/property |

### 6.6 Workflow integration (no hub changes)

- `submitEntityForApproval()` calls `ApprovalMatrixEngine` instead of `resolveApproverUserIds()`.
- Existing `emitApprovalEvent()` and queue UI unchanged.
- `workflow.approve` becomes minimum gate; matrix selects eligible approvers.

---

## 7. Migration strategy

### 7.1 Guiding principles

1. **No big-bang** — seven phased releases (see implementation plan).
2. **Dual-run period** — v1 keys and v2 keys both resolve correctly.
3. **Implicit allow first** — data scopes default to `all` until admin opts in to restriction.
4. **Zero downtime** — schema additions only; no removal of v1 columns during migration.
5. **Do not change existing permission assignments** in Phase 1–3.

### 7.2 Migration phases (summary)

| Phase | Focus | User impact |
|-------|-------|-------------|
| 1 | Permission catalog metadata | None — docs + registry only |
| 2 | Role management UI + templates | Optional new roles |
| 3 | Permission engine v2 resolver | None if aliases correct |
| 4 | Data scope (opt-in) | Admins assign scopes |
| 5 | Approval matrix | Admins configure rules |
| 6 | User migration + role mapping | Gradual reassignment |
| 7 | Production rollout + v1 deprecation | Communication + training |

### 7.3 Compatibility matrix

| Component | During migration | After cutover |
|-----------|------------------|---------------|
| `requirePermission('financial.write')` | Works via alias expansion | Works |
| `users.role` column | Populated for JWT | Display only / primary role label |
| `rbac_user_roles` | Source of truth for permissions | Unchanged |
| Static `ROLE_PERMISSIONS` | Fallback when no DB rows | Fallback for legacy tenants only |
| Frontend `usePermissions()` | Extended with scope hooks | Full context API |

### 7.4 Tenant migration playbook

1. **Audit** — export current role → permission matrix per tenant.
2. **Map** — apply industry template closest to each custom role.
3. **Review** — tenant admin confirms in staging.
4. **Scope** — optionally restrict project managers to assigned projects.
5. **Approval** — configure matrix rules mirroring current informal process.
6. **Validate** — run automated permission regression suite.
7. **Cutover** — enable `RBAC_V2_ENFORCEMENT` feature flag per tenant.

### 7.5 Feature flags

| Flag | Purpose |
|------|---------|
| `RBAC_V2_CATALOG` | Serve hierarchical catalog in UI |
| `RBAC_V2_RESOLVER` | Use expanded PermissionEngine |
| `RBAC_V2_DATA_SCOPE` | Enforce repository scope filters |
| `RBAC_V2_APPROVAL_MATRIX` | Route approvers via matrix |
| `RBAC_V2_STRICT_MODE` | Deny if permission unmapped (post-migration) |

Flags stored in tenant `app_settings` or environment defaults.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Scope filter bugs leak data** | Medium | Critical | Repository-level integration tests; security review; default `all` until verified |
| **Permission explosion** | High | Medium | Bundles + hierarchy; ~200 keys max in catalog v1 |
| **Performance (scope JOINs)** | Medium | Medium | Index `entity_id` columns; cache EffectiveAccessContext (extend 45s cache) |
| **Migration breaks existing tenants** | Low | High | Dual-run aliases; per-tenant flags; rollback path |
| **Workflow disruption** | Medium | High | Matrix shadow mode: log would-be approvers before switching |
| **super_admin removal requests** | Medium | Low | Retain super_admin; document break-glass; SYSTEM_OWNER recovery |
| **Frontend/backend drift** | Medium | Medium | Single `shared/rbac/` source; CI verify script |
| **Delegated admin escalation** | Low | Critical | `assertCanDelegate()` on every mutation; audit log |
| **Multi-role confusion in UI** | Medium | Low | Clear effective-permissions preview in User Management |
| **JWT stale permissions** | Existing | Low | Keep cache TTL; optional `permissionsVersion` in JWT refresh |

---

## 9. Rollback strategy

### 9.1 Per-phase rollback

| Phase rolled back | Action |
|-------------------|--------|
| Catalog only | Disable `RBAC_V2_CATALOG` flag — no runtime effect |
| Role templates | Stop offering templates; existing roles unaffected |
| Permission engine | Disable `RBAC_V2_RESOLVER` → revert to v1 resolver path |
| Data scope | Disable `RBAC_V2_DATA_SCOPE` → repositories skip scope SQL |
| Approval matrix | Disable `RBAC_V2_APPROVAL_MATRIX` → revert to role-slug resolver |

All rollbacks are **feature-flag toggles** — no data loss.

### 9.2 Schema rollback

New tables (`rbac_role_templates`, `rbac_user_data_scopes`, `rbac_approval_matrix_rules`, `rbac_audit_log`) are additive. Rollback:

1. Disable enforcement flags.
2. Application ignores new tables.
3. Optional: drop tables in separate maintenance window (only after 30-day stable period).

**Do not drop** `rbac_roles`, `rbac_role_permissions`, `rbac_user_roles` — v1 depends on them.

### 9.3 Permission assignment rollback

Before each tenant cutover:

- Export `rbac_role_permissions` and `rbac_user_roles` snapshot to JSON (backup API).
- Restore script replays snapshot if regression detected.

### 9.4 Communication plan

- Staging release notes per phase.
- Admin guide: “Effective permissions preview” before scope enforcement.
- Support runbook: disable tenant flag + restore snapshot.

---

## Appendix A — Request flow (target state)

```
1. Client loads app
2. GET /api/v1/rbac/effective-context
   → { permissions[], scopes[], approvalCapabilities[], roles[] }
3. Sidebar renders feature/page gates from permissions
4. User opens Rental → Agreements
5. GET /api/v1/rental/agreements
   → authMiddleware resolves EffectiveAccessContext
   → requirePermission('rental.agreements.view')
   → AgreementsRepository.list() applies property scope filter
6. User clicks Approve
   → requirePermission('rental.agreements.approve')
   → workflow submit → ApprovalMatrixEngine selects approvers
7. Approver acts
   → requirePermission + scope + not-requester check
   → existing emitEntityEvent() propagates state
```

---

## Appendix B — Document approval checklist

- [ ] Architecture aligns with `doc/ARCHITECTURE.md` v2.1
- [ ] No changes proposed to RealtimeDispatchHub / TEQ / socket ordering
- [ ] Migration preserves existing tenant permission assignments
- [ ] super_admin break-glass retained
- [ ] Implementation plan phased with feature flags
- [ ] Ready for Claude / security review

---

*End of RBAC 2.0 Architecture document.*

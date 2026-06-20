# RBAC V2 Migration Strategy

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only — no runtime changes  
**Date:** June 2026  
**Authority:** [`A5_1_5_FINAL_APPROVED.md`](./A5_1_5_FINAL_APPROVED.md), [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md)

---

## Purpose

Define how PBooksPro migrates from legacy RBAC to RBAC V2 with **zero downtime**, **rollback capability**, **parallel validation**, **no permission loss**, and **no security downgrade**.

This document is planning only. It does not enable flags, migrate users, or change authorization behavior.

---

## Current State

### Legacy roles

| Slug / stored value | Enterprise slug | Source |
|---------------------|-----------------|--------|
| `super_admin` | `super_admin` | Static matrix + seeded `rbac_roles` |
| `admin`, `manager` | `company_admin` | Legacy `users.role` alias |
| `accounts` | `accountant` | Legacy alias |
| `accountant` | `accountant` | Static matrix |
| `project_manager`, `team_lead` | `project_manager` | Legacy alias |
| `sales`, `sales_user` | `sales_user` | Static matrix |
| `read_only`, `viewer`, `task_contributor` | `read_only` | Legacy alias |
| `security_administrator` | (RBAC admin only) | Seeded per tenant (migration 131) |
| `SYSTEM_OWNER` | (hidden bootstrap) | Seeded per tenant; implicit all permissions |

**Resolver behavior today:**

1. If user has rows in `rbac_user_roles` → union of `rbac_role_permissions` (dynamic path).
2. Else → static `ROLE_PERMISSIONS` in `shared/rbac/permissions.ts` keyed by enterprise slug.
3. `super_admin` and `SYSTEM_OWNER` short-circuit to all permissions.

### Legacy permissions

| Category | Count | Notes |
|----------|-------|-------|
| v1 permission keys | 55 (`ALL_PERMISSIONS`) | Flat keys in `shared/rbac/permissions.ts` |
| Coarse bundle | `financial.write` | Expands to ~73 v2 keys via `FINANCIAL_WRITE_BUNDLE` when engine enabled |
| PM subset bundle | `PROJECT_MANAGER_FINANCIAL_BUNDLE` | Role-aware expansion for `project_manager` |
| No SoD enforcement (legacy) | — | SoD only when `RBAC_V2_SOD=true` |
| No data scope (legacy) | — | All tenant data visible to holders of write keys |
| No approval matrix (legacy) | — | Workflow uses hardcoded role slugs |

### Legacy route authorization

| Pattern | Location | Behavior |
|---------|----------|----------|
| `requirePermission(key)` | Module routes | Legacy resolver + static matrix |
| `requireFinancialWriteOnMutations` | 22 router mounts | POST/PUT/PATCH/DELETE require `financial.write` |
| `requireLedgerRole` / `requireFinancialWriteRole` | Journal, periods, reports | Single `financial.write` check |
| `requireWriteOnMutations(..., financial.write)` | Project selling routers | OR fallback to full financial bundle |
| Role string checks | Some frontend hooks | `isAdminRole`, raw role comparisons (decommission target) |

### Legacy role assignments

| Store | Column / table | Notes |
|-------|----------------|-------|
| Primary legacy | `users.role` / `userAgent_tenants.role` | JWT carries role slug |
| Dynamic RBAC (Phase 2) | `rbac_user_roles` | Overrides static matrix when non-empty |
| Stale detection | JWT role vs DB | 45s TTL cache on auth middleware |

**All feature flags default `false`** — legacy path is production default.

---

## Target State

### RBAC V2 roles

| Capability | Implementation |
|------------|----------------|
| System roles | Seeded slugs unchanged; permissions stored in `rbac_role_permissions` |
| Custom roles | Tenant-defined via Settings → Security → Roles |
| Multi-role | Union of assigned roles with SoD validation |
| Templates | Industry templates pre-validated against SoD |
| Temporary elevation | `rbac_user_roles.expires_at` |

### Permission Catalog

| Capability | Flag | Location |
|------------|------|----------|
| 154 catalog keys | `RBAC_V2_CATALOG` (implicit with engine) | `shared/rbac/permissionCatalog.ts` |
| Bundle aliases | Engine resolver | `financial.write` → v2 expansion |
| Restricted registry | Always enforced when role management on | `shared/rbac/restrictedPermissions.ts` |
| CI verify | — | `npm run verify:rbac-v2` |

### Data Scopes

| Capability | Flag | Dimensions |
|------------|------|------------|
| Repository filters | `RBAC_V2_DATA_SCOPE` | project, property, owner, department |
| Scope hash in JWT `av` | With engine + scope | `scopeHash` in composite access version |
| Report enforcement | With scope flag | `applyDataScope()` on protected report services |

### Approval Matrix

| Capability | Flag | Mandatory types |
|------------|------|-----------------|
| Matrix rules + assignments | `RBAC_V2_APPROVAL_MATRIX` | `manual_journal`, `journal_reversal` (non-disableable) |
| Approver SoD | With matrix | create + approve pairs blocked at approval time |
| Journal draft flow | With matrix | submit → approve → post (atomic) |

### Authorization Engine

| Capability | Flag | Behavior |
|------------|------|----------|
| EffectiveAccessContext | `RBAC_V2_AUTHORIZATION_ENGINE` | Resolved per request |
| JWT `av` claim | With engine | Stale → **401 TOKEN_STALE** |
| `requirePermissionV2` | With engine | v2 evaluator only |
| Version invalidation | With engine | Role/scope/approval mutations bump `users.access_version` |

### Break Glass

| Capability | Flag | Behavior |
|------------|------|----------|
| SYSTEM_OWNER sessions | `RBAC_V2_BREAK_GLASS` | MFA, 15–60 min, full audit |
| Not assignable | — | Hidden from role UI |

---

## Migration Philosophy

| Principle | Implementation |
|-----------|----------------|
| **Zero downtime** | Feature flags; legacy path remains until each stage exit criteria met |
| **Rollback possible** | Disable flags + API restart; no schema drop required |
| **Parallel validation** | Dual-run logging (legacy vs v2 outcome) during Stages 3–7 |
| **No permission loss** | Parity report: effective v2 ⊇ v1 for every user before cutover |
| **No unreviewed permission gain** | Permission Gain Review — human sign-off for users exceeding legacy static matrix |
| **No security downgrade** | SoD, scope, approval matrix enabled **before** strict mode; never disable SoD post-cutover without Security Lead approval |

**Non-goals for A5.1.6A:** automatic production reassignment, global flag enablement, legacy removal.

---

## Coexistence Strategy

Legacy RBAC and RBAC V2 run in parallel controlled by flags:

```
Request
  │
  ├─ RBAC_V2_AUTHORIZATION_ENGINE=false
  │     └─ requirePermission → legacy matrix + module resolver
  │        (tokens without `av` valid)
  │
  └─ RBAC_V2_AUTHORIZATION_ENGINE=true
        └─ requirePermissionV2 → EffectiveAccessContext
           (tokens must include current `av`)
```

### Safe coexistence rules

| Rule | Rationale |
|------|-----------|
| Never stack `requirePermission` + `requirePermissionV2` on same handler | Avoid double-deny or inconsistent outcomes |
| Engine requires role management | Custom roles + `access_version` column |
| Approval matrix requires engine | `approvalHash` participates in `av` |
| Data scope requires engine | `scopeHash` participates in `av` |
| Route migration is **additive** until Stage 6 | Replace guards only after parity proven |
| Frontend flags mirror API flags per environment | Avoid UI showing v2 controls when API disabled |
| **Stage 2.5 bootstrap before engine** | Populate `rbac_user_roles` while `RBAC_V2_AUTHORIZATION_ENGINE=false` — legacy auth remains active |

### Stage 2.5 — RBAC User Assignment Bootstrap

**Purpose:** Ensure every active user has a row in `rbac_user_roles` **before** `RBAC_V2_AUTHORIZATION_ENGINE=true`.

**Mapping chain:**

```
users.role / user_tenants.role
  → LEGACY_ROLE_TO_ENTERPRISE (shared/rbac/permissions.ts)
  → rbac_roles.id (tenant-scoped slug match)
  → rbac_user_roles INSERT … ON CONFLICT DO NOTHING
```

| Property | Requirement |
|----------|-------------|
| Non-destructive | INSERT only; never deletes existing assignments |
| Idempotent | Re-run safe — skips users already assigned target role |
| Engine OFF | `RBAC_V2_AUTHORIZATION_ENGINE=false` throughout Stage 2.5 |
| Legacy auth active | `requirePermission` continues using legacy path until Stage 3 |

**Tool:** `scripts/rbac-assess-tenant.mjs --bootstrap` — see [`RBAC_V2_PARITY_TOOL.md`](./RBAC_V2_PARITY_TOOL.md).

**Exit gate:** `--parity` reports zero `NO_RBAC_ASSIGNMENT` and zero permission loss.

### Parallel validation window

During Stages 3–7 on staging:

1. Enable v2 flags incrementally.
2. Run automated parity scripts (`rbac-assess-tenant.mjs --parity`) — includes **Permission Gain Review**.
3. Compare legacy static matrix vs rbac_user_roles effective permissions.
4. Log mismatches — **block stage exit** on permission loss; **require sign-off** on permission gain.
5. SoD report — **block Stage 6 exit** if standing violations remain after role splits.

### Data coexistence

| Artifact | Legacy | V2 | Coexistence |
|----------|--------|-----|-------------|
| `users.role` | Active | Fallback when no `rbac_user_roles` | Keep until decommission |
| `rbac_user_roles` | Optional | Primary assignment store | **Stage 2.5:** bootstrap all users before engine |
| `rbac_role_permissions` | Seeded for system roles | Source of truth | Backfill from static matrix |
| Approval drafts | N/A | `rbac_journal_approval_drafts` | Empty until matrix enabled |

---

## Related documents

| Document | Purpose |
|----------|---------|
| [`RBAC_V2_ROLE_MIGRATION_PLAN.md`](./RBAC_V2_ROLE_MIGRATION_PLAN.md) | Per-role mapping |
| [`RBAC_V2_PERMISSION_MIGRATION_PLAN.md`](./RBAC_V2_PERMISSION_MIGRATION_PLAN.md) | v1 → v2 key mapping |
| [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md) | Staged rollout |
| [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md) | Emergency rollback |
| [`RBAC_V2_PRODUCTION_GATES.md`](./RBAC_V2_PRODUCTION_GATES.md) | Go/no-go gates |
| [`RBAC_V2_MONITORING_PLAN.md`](./RBAC_V2_MONITORING_PLAN.md) | Observability |
| [`RBAC_V2_DECOMMISSION_PLAN.md`](./RBAC_V2_DECOMMISSION_PLAN.md) | Legacy retirement |

---

*End of migration strategy.*

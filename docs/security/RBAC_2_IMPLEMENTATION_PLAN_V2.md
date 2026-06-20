# RBAC 2.0 Implementation Plan — PBooksPro (V2)

**Phase:** A5.1.0.4 — Final Review Closure  
**Status:** Architecture package finalized — ready for implementation authorization  
**Date:** June 2026  
**Supersedes:** [`RBAC_2_IMPLEMENTATION_PLAN.md`](./RBAC_2_IMPLEMENTATION_PLAN.md)  
**Companion:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md)

---

## Overview

This plan incorporates **mandatory Critical Findings C1–C5** from the first architecture review. Implementation must not begin until this document and companion security artifacts are approved.

**Security foundation artifacts (blocking):**

| Artifact | Critical finding |
|----------|------------------|
| [`SoD_MATRIX.md`](./SoD_MATRIX.md) | C1 |
| [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §4.6 | C2 |
| [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §5.1 | C3 |
| [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §2.5 | C4 |
| [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) | C5 |
| [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) | H6 |
| [`RBAC_2_REVIEW_3_CHANGES.md`](./RBAC_2_REVIEW_3_CHANGES.md) | H1–H6, NR1–NR2 |

**Out of scope (all phases):**

- RealtimeDispatchHub, TEQ, socket ordering changes
- FinancialPostingService / GL logic changes
- Automatic production permission reassignment without admin review

**Cross-cutting requirements (every phase):**

1. `shared/rbac/` → `npm run build:backend`
2. `withAudit()` + `emitEntityEvent()` on RBAC mutations
3. Tenant isolation (`tenant_id` = company boundary — Option A)
4. Feature flags for rollback
5. **SoD validation before any role/permission assignment** (Phase 2+)
6. **`assertCanDelegate()` + privilege ceiling on role create/assign/clone/template** (Phase 2+)
7. **`permissionBundles.ts` single source of truth for all bundle expansion** (Phase 1+)

---

## Bundle expansion source (NR1)

**Single source of truth:** `shared/rbac/permissionBundles.ts`

| Consumer | Phase | Must import from |
|----------|-------|------------------|
| Phase 2 SoD stub (`rbacSodService` pre-expand) | 2 | `permissionBundles.ts` |
| Phase 3 PermissionEngine | 3 | `permissionBundles.ts` |
| Phase 1 CI verify | 1 | Same file — no duplicate arrays in tests |
| PERMISSION_MIGRATION_MAP.md §2, §11 | doc | Kept in sync via `npm run verify:rbac-catalog` |

**Bundles defined in file:**

| Export | Purpose |
|--------|---------|
| `FINANCIAL_WRITE_BUNDLE` | Full §2 expansion for company_admin, accountant |
| `PROJECT_MANAGER_FINANCIAL_BUNDLE` | §11 PM subset only |
| `expandBundles(keys, enterpriseRole?)` | Role-aware expansion function |

**CI rule:** `verify:rbac-catalog` fails if:

- Duplicate permission arrays exist outside `permissionBundles.ts`
- `FINANCIAL_WRITE_BUNDLE` or `PROJECT_MANAGER_FINANCIAL_BUNDLE` drift from PERMISSION_MIGRATION_MAP
- Phase 2 tests define inline bundle arrays

**No duplicate bundle definitions** in `rbacSodService.ts`, `rbacPermissionEngine.ts`, or test fixtures.

---

## Phase summary

| Phase | Name | Duration | Critical findings addressed |
|-------|------|----------|----------------------------|
| 1 | Permission Catalog | 2–3 weeks | C5 (registry) |
| 2 | Role Management + Security Foundation | 3–4 weeks | **C1, C2** |
| 3 | Permission Engine + Cache | 2–3 weeks | **C4, C5** |
| 4 | Data Scope Security | 3–4 weeks | C3 (Option A scopes) |
| 5 | Approval Matrix | 3 weeks | C1 (approver SoD) |
| 6 | Migration | 2–3 weeks | C1, C5 (role splits) |
| 7 | Production Rollout | 2–4 weeks | All |

**Total:** 17–24 weeks.

---

## Phase 1 — Permission Catalog

### Objective

Establish hierarchical permission registry including full `financial.write` decomposition — **no runtime behavior change**.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Permission catalog types | `shared/rbac/permissionCatalog.ts` |
| v1 → v2 alias map | `shared/rbac/permissionAliases.ts` |
| Bundle definition | `shared/rbac/permissionBundles.ts` — mirrors [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) §2 |
| Expanded permission keys (additive) | `shared/rbac/permissions.ts` |
| Catalog API | `GET /api/v1/rbac/permission-catalog` |
| CI verify | `npm run verify:rbac-catalog` |
| SoD pair registry | `shared/rbac/sodPairs.ts` — mirrors [`SoD_MATRIX.md`](./SoD_MATRIX.md) |

### C5 tasks

1. Encode every key from PERMISSION_MIGRATION_MAP §2 in `permissionBundles.ts`.
2. Mark `financial.write` as `aliasOf` bundle with `implies[]` list.
3. CI fails if any mount in §3 lacks catalog entries for target v2 keys.
4. Document `project_manager` subset in catalog metadata — must match PERMISSION_MIGRATION_MAP §11 exactly (NR2).

### Acceptance criteria

- [ ] All 51 v1 permissions cataloged
- [ ] All §2 bundle keys cataloged (~80+ v2 keys)
- [ ] SoD pairs registered in `sodPairs.ts` (6 mandatory + 5 extended)
- [ ] No route guard behavior change
- [ ] `npm run verify:rbac-catalog` passes

### Rollback

Disable catalog API flag only.

---

## Phase 2 — Role Management + Security Foundation

### Objective

Deliver role templates, audit log, **mandatory SoD enforcement**, and **SYSTEM_OWNER break-glass** before any permission engine or scope work.

### Deliverables — Role management

| Deliverable | Location |
|-------------|----------|
| `rbac_role_templates` migration | `database/migrations/NNN_rbac_role_templates.sql` |
| `rbac_audit_log` migration | `database/migrations/NNN_rbac_audit_log.sql` |
| Template + audit services | `modules/rbac/services/` |
| Delegation + ceiling service | `rbacDelegationService.ts`, `rbacPrivilegeCeilingService.ts` |
| Multi-role UI | Extend `RoleManagementSection.tsx`, `UserManagement.tsx` |
| Expiry on assignments | `rbac_user_roles.expires_at` |

### Deliverables — C1 SoD

| Deliverable | Location |
|-------------|----------|
| SoD service | `modules/rbac/services/rbacSodService.ts` |
| `assertNoSodViolation()` | Called on role create/update, user role assign, template instantiate |
| HTTP 409 response | `SOD_VIOLATION` error code |
| Audit on blocked attempts | `SOD_VIOLATION_BLOCKED` in `rbac_audit_log` |
| Flag | `RBAC_V2_SOD` |

**Policy:** No tenant override UI. No env var to disable post-staging cutover.

### Deliverables — C2 SYSTEM_OWNER break-glass

| Deliverable | Location |
|-------------|----------|
| `break_glass_sessions` migration | `database/migrations/NNN_break_glass_sessions.sql` |
| Break-glass service | `modules/rbac/services/rbacBreakGlassService.ts` |
| Platform capability table | `platform_break_glass_capabilities` (vendor admin only — NM1) |
| SoD holder check on role add | `rbacSodService.assertNoViolationForRoleHolders()` (NH1) |
| Activate API | `POST /api/v1/rbac/break-glass/activate` (MFA required) |
| Session expiry | Middleware check + cron cleanup |
| Audit extension | `actor_type = 'system_owner'` on all session actions |
| JWT extension | `sessionType`, break-glass expiry |
| UI banner | Break-glass active indicator (implementation phase) |
| Flag | `RBAC_V2_BREAK_GLASS` |

**Break-glass parameters (fixed, not tenant-configurable):**

| Parameter | Value |
|-----------|-------|
| Default duration | 15 minutes |
| Max duration | 60 minutes |
| MFA | Mandatory step-up |
| Concurrent sessions per tenant | 1 |
| Audit | Every action + lifecycle events |

### Tasks

1. Schema: templates, audit log (with `actor_type` column), break-glass sessions, assignment expiry.
2. `rbacSodService` — load pairs from `shared/rbac/sodPairs.ts`; expand via **`permissionBundles.ts` only** (NR1).
3. Integrate validation pipeline: `assertCanDelegate` → `assertWithinCeiling` → `assertNoSodViolation` — **before** commit on all five mutation paths (H3).
4. Break-glass activate: MFA → session row → short JWT → audit `BREAK_GLASS_ACTIVATED`.
5. Middleware: detect break-glass JWT; set `sessionType`; reject expired sessions.
6. Remove standing `SYSTEM_OWNER` from assignable roles UI (if exposed).
7. Industry template seeds — **pre-validated against SoD** (no create+approve pairs in single template).
8. Tests: SoD block scenarios for all 6 mandatory pairs; break-glass MFA rejection; session expiry; audit `actor_type`.

### Phase 2 acceptance criteria

**SoD (C1):**

- [ ] Assigning both `payroll.runs.create` + `payroll.runs.approve` returns 409 `SOD_VIOLATION`
- [ ] No tenant setting to bypass SoD

**Break-glass (C2):**

- [ ] Break-glass requires MFA; expires at 15 min
- [ ] All break-glass mutations have `actor_type = system_owner`

**Template instantiation & delegation (H3) — separate from SoD:**

- [ ] Template instantiation **blocked** if actor does not hold **every** permission in template (409 `DELEGATION_DENIED`)
- [ ] Role clone blocked if cloned permissions exceed actor's resolved set
- [ ] Role create/update blocked when `targetPermissions ⊄ actor.permissions`
- [ ] User role assign blocked when resulting effective union includes permission actor lacks
- [ ] Delegation failure returns **distinct error code** from SoD failure

**Privilege ceiling (H6):**

- [ ] `company_admin` with delegate cannot assign permissions from Restricted Registry
- [ ] `security_administrator` cannot assign `financial.write` or any business write key
- [ ] Blocked ceiling attempts return 409 `PRIVILEGE_CEILING_EXCEEDED`

**General:**

- [ ] Template instantiation blocked if SoD violated on resulting set
- [ ] RBAC mutations emit socket invalidation events
- [ ] All bundle expansion in Phase 2 uses `permissionBundles.ts` only (NR1)
- [ ] Role permission **add** blocked when any holder would violate SoD (NH1 / SoD Enforcement Point #3)

### Dependencies

Phase 1 catalog + sodPairs + `permissionBundles.ts` (NR1).

### Rollback

Disable `RBAC_V2_SOD` and `RBAC_V2_BREAK_GLASS`. SoD disable requires security sign-off post-production.

---

## Phase 3 — Permission Engine + Cache Invalidation

### Objective

Deploy PermissionEngine with `financial.write` bundle expansion and **version-based cache invalidation** (C4).

### Deliverables — C5 Permission engine

| Deliverable | Location |
|-------------|----------|
| PermissionEngine | `modules/rbac/services/rbacPermissionEngine.ts` |
| Bundle expander | Uses `permissionBundles.ts` |
| Effective context API | `GET /api/v1/rbac/effective-context` |
| Dual-run mode | Log v1 vs v2 mismatches |
| Route pilot | `accountsRouter`, `journalRouter` → specific v2 keys |
| Flag | `RBAC_V2_RESOLVER` |

### Deliverables — C4 Cache invalidation

| Deliverable | Location |
|-------------|----------|
| Access version service | `modules/rbac/services/rbacAccessVersionService.ts` |
| `users.access_version` column | Migration |
| `tenants.rbac_global_version` column | Migration |
| `roleVersionHash` on EffectiveAccessContext | authMiddleware |
| JWT `av` claim | Token issue + stale check |
| Invalidation on RBAC mutations | Increment version + `invalidateAuthUserCache` |
| Invalidation on user suspend | Immediate 401 |
| Socket event | `rbac_access` invalidation |
| Client listener | Invalidate `['permissions', 'me']` query |
| Flag | `RBAC_V2_VERSION_HASH` |

### C4 tasks

1. Implement hash computation per Architecture V2 §2.5.
2. Extend `authMiddleware`: compare JWT `av` vs current hash → 401 `TOKEN_STALE`.
3. On role permission change: increment `rbac_roles.version`, find affected users, invalidate caches, emit socket.
4. On user suspend: increment `users.access_version`, invalidate, reject requests.
5. TTL (45s) remains as performance cache only — hash mismatch always re-resolves.
6. Tests: revoke permission → next request denied without waiting 45s; suspend → immediate 401.

### C5 tasks

1. Expand `financial.write` per PERMISSION_MIGRATION_MAP §2 at resolve time.
2. Run SoD on expanded set during assignment (Phase 2 service calls engine expand).
3. Dual-run: compare v1 `resolvedPermissions` vs v2 expanded set.
4. Pilot route migration on 2 routers; document remaining mounts for Phase 6.

### Acceptance criteria

- [ ] Permission revocation effective on next request (< 1s), not TTL-bound
- [ ] User suspension returns 401 immediately
- [ ] JWT with stale `av` returns 401 TOKEN_STALE
- [ ] 100% v1/v2 parity for system roles (automated test)
- [ ] Bundle excludes approve keys (SoD safe)
- [ ] Socket invalidation triggers client permission refresh

### Dependencies

Phase 1 (bundles), Phase 2 (SoD service).

### Rollback

Disable `RBAC_V2_RESOLVER` and/or `RBAC_V2_VERSION_HASH` (degraded TTL-only mode).

---

## Phase 4 — Data Scope Security

### Department scope prerequisite (NM2)

**Decision: Option A — table already exists. No Phase 4 schema prerequisite.**

| Item | Status |
|------|--------|
| Table | `payroll_departments` |
| Migration | `database/migrations/021_payroll.sql` |
| Primary key | `payroll_departments.id` |
| Employee FK | `payroll_employees.department_id` → `payroll_departments.id` |
| PO FK | `purchase_orders.department_id` → `payroll_departments.id` (migration `126`) |

Phase 4 **does not** create a new departments table. RBAC scope dimension `department` maps directly to **`payroll_departments.id`**.

**Phase 4 first tasks:** wire `applyDataScope(..., 'department', 'department_id')` on payroll repositories; no blocking migration.

---

### Objective

Implement project / property / owner / **department** scope filtering within tenant (Option A — no company_id).

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Scope tables | `rbac_user_data_scopes`, `rbac_role_data_scopes` |
| DataScopeEngine | `rbacDataScopeResolver.ts` |
| Scope types | `shared/rbac/dataScopeTypes.ts` — includes `department` |
| Scope admin API | `/api/v1/rbac/scopes` |
| Repository helper | `tenantRepositoryScope.ts` → `applyDataScope()` |
| Pilot modules | projects, rental properties, owner contacts, **payroll, employees** |
| Report repositories | All report SQL paths use `applyDataScope()` (H2) |
| Scope admin UI | Settings → Data Scope (incl. department tab) |
| `useDataScope()` hook | Frontend |

### H1 — Department scope tasks

1. Add `department` to `ScopeDimension` type.
2. Apply department scope on payroll routes, employee CRUD, payroll reports.
3. Seed `payroll_officer` and `hr_manager` templates with `assigned` department default.
4. Default: no rows = all departments (migration safe).

### H2 — Report scope tasks

1. Audit all report repository SQL paths.
2. Replace parameter-based scope with `applyDataScope(req.effectiveAccess.scopes, ...)`.
3. Reject client scope-widening parameters at API validation layer.
4. Add `npm run verify:rbac-v2` grep for report `applyDataScope` coverage.

### C3 tasks

1. **Do not** implement `company` dimension or `company_id` scope.
2. Document in admin UI: "Organization = company; switch via Select Company."
3. Multi-org users: scope is per-tenant (each tenant has independent scope grants).
4. Default: no scope rows = `all` within current tenant.

### Scope dimensions (final)

| Dimension | Enforced |
|-----------|----------|
| project | Yes |
| property | Yes |
| owner | Yes |
| department | Yes (payroll, HR, employees) |
| company (in-tenant) | **No — Option A** |

### Acceptance criteria

- [ ] PM with assigned project A cannot access project B data
- [ ] Payroll officer with assigned department X cannot view department Y employees
- [ ] Report query returns scoped rows; client params cannot widen scope (H2)
- [ ] Scope grants are tenant-scoped
- [ ] No `company_id` column added
- [ ] super_admin / company_admin default to all within tenant
- [ ] Scope change increments `users.access_version` (C4)

### Dependencies

Phase 3 (effective context includes scopes).

### Rollback

Disable `RBAC_V2_DATA_SCOPE`.

---

## Phase 5 — Approval Matrix

### Objective

Permission-based approver routing with SoD-aware approver pools.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Matrix rules table | `rbac_approval_matrix_rules` |
| ApprovalMatrixEngine | `rbacApprovalMatrixService.ts` |
| Workflow integration | Replace `resolveApproverUserIds()` |
| Shadow mode | 2 weeks staging diff logging |
| Matrix admin UI | Settings → Approval Matrix |
| Mandatory journal seed | `manual_journal` + `journal_reversal` rules per tenant (H4) |
| Flag | `RBAC_V2_APPROVAL_MATRIX` |

### H4 — Mandatory journal approval tasks

1. Seed `manual_journal` matrix rule on every tenant (non-optional migration).
2. Remove / block workflow setting to disable journal approval.
3. Disable auto-approve for `manual_journal` entity type.
4. Add `journal_reversal` entity type with separate approval rule.
5. Test: unapproved journal cannot post to GL.

### C1 integration

- Approver pool query excludes users whose effective permissions violate SoD for the approve/create pair being exercised.
- Self-approval blocked at service layer.

### Acceptance criteria

- [ ] Shadow mode ≥ 95% approver match with v1
- [ ] Self-approval rejected
- [ ] Matrix uses permissions, not role slugs
- [ ] Manual journal approval cannot be disabled (H4)
- [ ] Default `manual_journal` seed on all tenants
- [ ] Rollback flag restores v1 resolver

### Dependencies

Phases 3–4.

---

## Phase 6 — Migration

### Objective

Migrate tenants to v2 roles, split SoD-violating system roles, complete `financial.write` route decomposition.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Assessment script | `scripts/rbac-assess-tenant.mjs` |
| Snapshot export/restore | RBAC API |
| SoD migration report | Flags users/roles with create+approve pairs |
| Role split templates | `accountant_preparer`, `accountant_approver`, etc. |
| Route migration | All mounts in PERMISSION_MIGRATION_MAP §3–§4 |
| Remove `financial.write` from OR fallbacks | `requireWriteOnMutations` on selling routers |
| Hardcoded role check cleanup | grep-clean `isAdminRole`, role string checks |
| Migration runbook | `docs/security/RBAC_2_MIGRATION_RUNBOOK.md` |

### C1 migration tasks

1. Run SoD report on every tenant — list violations in current effective sets.
2. Propose role splits (admin review required).
3. **Block** migration completion if SoD violations remain.

### C5 migration tasks

1. Replace all 22 `requireFinancialWriteOnMutations` mounts with specific v2 keys.
2. Replace `requireLedgerRole` with `accounting.journals.create` / `.reverse`.
3. Replace frontend `canWriteFinancial` with domain-specific checks.
4. `npm run verify:rbac-v2` confirms zero remaining direct `financial.write` guards (except bundle alias in engine).

### Acceptance criteria

- [ ] Staging tenant migrated with zero SoD violations
- [ ] Zero direct `financial.write` route guards (bundle alias only in engine)
- [ ] Snapshot restore tested
- [ ] Parity report: v2 ⊇ v1 permissions for all users

### Dependencies

Phases 1–5 on staging.

---

## Phase 7 — Production Rollout

### Objective

Gradual production enablement with all security foundations active.

### Rollout flag sequence (per tenant)

```
1. RBAC_V2_SOD
2. RBAC_V2_BREAK_GLASS
3. RBAC_V2_VERSION_HASH
4. RBAC_V2_RESOLVER
5. RBAC_V2_DATA_SCOPE (opt-in tightening)
6. RBAC_V2_APPROVAL_MATRIX
7. RBAC_V2_STRICT_MODE (after 30 days at 100%)
```

### Deliverables

| Deliverable | Purpose |
|-------------|---------|
| Admin training guide | SoD, break-glass, scope assignment |
| Support runbook | Flag disable + snapshot restore |
| Monitoring | 403 rate, SOD_VIOLATION count, break-glass sessions |
| Security review | Scope bypass pen test |
| CI gate | `npm run verify:rbac-v2` on `main` |

### Acceptance criteria

- [ ] 100% tenants on all flags
- [ ] No critical scope bypass findings
- [ ] SoD violations in production: 0 standing assignments
- [ ] Break-glass sessions audited with `actor_type=system_owner`
- [ ] Permission revocation SLA < 1s (C4)

---

## Verification commands

```powershell
npm run build:backend
npm run verify:rbac-catalog          # Phase 1+
npm run test -- rbacSodService       # Phase 2+
npm run test -- rbacBreakGlassService
npm run test -- rbacAccessVersionService  # Phase 3+
npm run test -- rbacPermissionEngine
node scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --sod-report  # Phase 6+
npm run verify:rbac-v2               # Phase 7
```

---

## Critical findings resolution checklist

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| C1 | SoD blocking, no override | 2 | Planned |
| C2 | SYSTEM_OWNER audit, MFA, break-glass, expiry | 2 | Planned |
| C3 | Option A: 1 Tenant = 1 Company | 4 | Planned |
| C4 | role_version_hash, invalidation flows | 3 | Planned |
| C5 | financial.write migration map | 1, 3, 6 | Planned |

---

## Review #3 resolution checklist (A5.1.0.3)

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| H1 | Department scope (payroll/HR) | 4 | Planned |
| H2 | Report `applyDataScope()` enforcement | 4 | Planned |
| H3 | Template instantiation delegation | 2 | Planned |
| H4 | Mandatory journal approval seed | 5 | Planned |
| H6 | Privilege ceiling | 2 | Planned |
| NR1 | Single permissionBundles.ts | 1–3 | Planned |
| NR2 | project_manager subset enumerated | 1 | Planned |
| NH1 | SoD on role permission add (all holders) | 2 | Planned |
| NM1 | Break-glass vendor capability store | 2 | Planned |
| NM2 | payroll_departments prerequisite (exists) | 4 | Planned |
| NM3 | personal.finance removed from bundle | 1, 6 | Planned |

---

## Definition of done (program level)

- [ ] All Critical Findings C1–C5 addressed
- [ ] All Review #3 findings H1, H2, H3, H4, H6, NR1, NR2 addressed
- [ ] All Review #4 findings NH1, NM1, NM2, NM3 addressed
- [ ] [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) complete
- [ ] [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md) §11–§12 complete
- [ ] [`reviews/REVIEW_ACTION_LOG.md`](./reviews/REVIEW_ACTION_LOG.md) published
- [ ] Implementation authorized

---

*End of RBAC 2.0 Implementation Plan V2.*

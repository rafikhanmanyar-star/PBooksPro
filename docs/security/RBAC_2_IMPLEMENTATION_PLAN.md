# RBAC 2.0 Implementation Plan — PBooksPro

**Phase:** A5.1.0 — Architecture & Planning  
**Status:** Draft for review  
**Date:** June 2026  
**Companion:** [`RBAC_2_ARCHITECTURE.md`](./RBAC_2_ARCHITECTURE.md)

---

## Overview

This plan breaks RBAC 2.0 delivery into **seven implementation phases**. Each phase is independently deployable to **staging** (`npm run release:staging`) and validated before the next begins.

**Out of scope for all phases until explicitly scheduled:**

- Modifications to RealtimeDispatchHub, Transactional Entity Queue, or socket event ordering
- Changes to FinancialPostingService / GL logic
- Removal of existing v1 permission keys
- Automatic reassignment of production user permissions without admin review

**Cross-cutting requirements (every phase):**

1. Architecture v2.1 module layout under `backend/src/modules/rbac/`
2. Permission constants in `shared/rbac/` → `npm run build:backend`
3. `withAudit()` / `recordDomainMutation()` on RBAC mutations
4. `emitEntityEvent()` after RBAC commits for client cache invalidation
5. Tenant isolation on all queries
6. Feature flag gating for rollback

---

## Phase summary

| Phase | Name | Duration (est.) | Breaking? |
|-------|------|-----------------|-----------|
| 1 | Permission Catalog | 2–3 weeks | No |
| 2 | Role Management | 2–3 weeks | No |
| 3 | Permission Engine | 2 weeks | No (dual-run) |
| 4 | Data Scope Security | 3–4 weeks | Opt-in |
| 5 | Approval Matrix | 3 weeks | Opt-in |
| 6 | Migration | 2–3 weeks | Per-tenant |
| 7 | Production Rollout | 2–4 weeks | Gradual |

**Total estimated calendar:** 16–22 weeks (parallel work possible on Phases 4–5 after Phase 3).

---

## Phase 1 — Permission Catalog

### Objective

Establish the hierarchical permission registry and expand coverage to all business domains **without changing runtime authorization behavior**.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Permission catalog schema | `shared/rbac/permissionCatalog.ts` |
| Feature / page / action hierarchy | `shared/rbac/permissionCatalog.ts` |
| v1 → v2 alias map | `shared/rbac/permissionAliases.ts` |
| Expanded permission keys (additive) | `shared/rbac/permissions.ts` |
| Catalog API | `GET /api/v1/rbac/permission-catalog` |
| Admin UI — hierarchical catalog view | Extend `PermissionCatalogSection.tsx` |
| Documentation | Permission matrix spreadsheet export from catalog |
| CI verify script | `npm run verify:rbac-catalog` |

### New permission domains (additive keys)

Extend catalog to cover currently ungated domains:

```
rental.{properties,units,agreements,invoices,payments}.{view,create,edit,delete,approve,export,print}
property.{buildings,units,maintenance}.{view,create,edit,delete}
inventory.{items,warehouses,movements}.{view,create,edit,delete}
pos.{registers,sessions,sales}.{view,create,edit}
crm.{contacts,leads,owners,clients}.{view,create,edit,delete}
projects.{projects,boq,ipc,variations,retention}.{view,create,edit,delete,approve}
administration.{users,roles,scopes,settings,backups,billing,audit}.{view,edit,...}
```

**Do not** wire new keys to route guards in Phase 1 — registry and UI only.

### Tasks

1. **Inventory routes** — grep all `requirePermission`, `requireRole`, role string checks; produce coverage matrix.
2. **Define catalog types** — `PermissionDefinition` with layer, feature, page, action, riskLevel.
3. **Map v1 keys** — every existing `ALL_PERMISSIONS` entry gets `aliasOf` / `implies` links.
4. **Bundle definitions** — document `financial.write` expansion set (reference only; no runtime expansion yet).
5. **Build API** — read-only catalog endpoint grouped by feature → page → action.
6. **Update Permission Catalog UI** — tree view with search; read-only badges for unimplemented guards.
7. **CI gate** — fail if new permission added to `permissions.ts` without catalog entry.

### Acceptance criteria

- [ ] All 51 existing permissions have catalog entries with labels and layers
- [ ] ≥ 150 catalog entries covering all 10 business domains (including ungated)
- [ ] No route guard behavior change (regression suite green)
- [ ] `npm run build:backend` passes
- [ ] Staging admin can browse full hierarchy

### Dependencies

None.

### Rollback

Remove catalog API flag; static list UI remains functional.

---

## Phase 2 — Role Management

### Objective

Enable enterprise role templates, improved multi-role UI, and RBAC audit trail — building on existing `rbac_roles` infrastructure.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Role templates table + migration | `database/migrations/NNN_rbac_role_templates.sql` |
| RBAC audit log table + migration | `database/migrations/NNN_rbac_audit_log.sql` |
| Template CRUD service | `modules/rbac/services/rbacTemplateService.ts` |
| Audit service | `modules/rbac/services/rbacAuditService.ts` |
| Industry template seeds | Migration seed data (property_manager, hr_manager, etc.) |
| Delegation enforcement | `modules/rbac/services/rbacDelegationService.ts` |
| New permissions | `permissions.delegate`, `roles.template.*`, `audit_logs.rbac.read` |
| Role Management UI | Extend `RoleManagementSection.tsx` — template picker, multi-role assign |
| User Management UI | Extend `UserManagement.tsx` — multiple role chips |
| Expiry on assignments | `rbac_user_roles.expires_at` column |

### Tasks

1. **Schema** — `rbac_role_templates`, `rbac_audit_log`, `expires_at` on `rbac_user_roles` (per v2 spec).
2. **Template service** — create, publish version, instantiate to `rbac_roles` (copy permissions, not live link).
3. **Audit pipeline** — same transaction as mutation; actor, before/after JSON.
4. **Delegation** — `assertCanDelegate(actor, targetPermissions)` on role create/update and user assign.
5. **Seed templates** — 7 industry templates with permission subsets from catalog.
6. **API routes** — `POST /rbac/templates`, `POST /rbac/templates/:id/instantiate`, `GET /rbac/audit`.
7. **UI** — template gallery, “create role from template”, effective permission preview.
8. **Multi-role assign** — `PUT /rbac/users/:id/roles` accepts array; preserve backward single-role API.
9. **Emit events** — `emitEntityEvent({ type: 'rbac_role', action: 'updated' })` for client invalidation.
10. **Tests** — delegation escalation blocked; audit row on every mutation; template instantiate copies permissions.

### Acceptance criteria

- [ ] Company admin with `permissions.delegate` can create custom role from template
- [ ] Company admin **without** delegate cannot grant permissions they don't hold
- [ ] super_admin can still assign any permission
- [ ] All RBAC mutations produce audit log rows
- [ ] User can hold 2+ roles; effective permissions = union
- [ ] Expired assignments ignored by resolver
- [ ] No change to non-RBAC routes

### Dependencies

Phase 1 catalog (template permission picker uses catalog metadata).

### Rollback

Disable template API; existing role CRUD unchanged. Audit table retained (read-only).

---

## Phase 3 — Permission Engine

### Objective

Replace flat resolution with **PermissionEngine** supporting v1 aliases, bundle expansion, and effective-context API — behind feature flag.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| PermissionEngine | `modules/rbac/services/rbacPermissionEngine.ts` |
| Alias resolver | Uses `permissionAliases.ts` |
| Bundle expander | `financial.write` → v2 key set |
| Effective context API | `GET /api/v1/rbac/effective-context` |
| Extended authMiddleware | Inject `effectiveAccess` on `AuthedRequest` |
| Updated resolver | `rbacPermissionResolver.ts` delegates to engine when flag on |
| Frontend hook | `useEffectiveAccess()` or extend `usePermissions()` |
| Route guard expansion (opt-in) | Pilot: rental module routes only |
| Regression tests | `rbacPermissionEngine.test.ts` — v1/v2 parity |

### Tasks

1. **Engine core** — input: tenantId, userId, legacyRole → output: `Set<PermissionKey>`.
2. **Alias layer** — resolve v1 keys; expand bundles; cache expanded sets.
3. **Dual-run mode** — compare v1 vs v2 resolver output; log mismatches (no deny).
4. **Effective context endpoint** — permissions + roles (scopes empty until Phase 4).
5. **Extend `usePermissions()`** — consume effective-context API; fallback to v1.
6. **Pilot guards** — add `requirePermission('rental.agreements.view')` on rental routes **in addition to** existing checks (OR logic during pilot).
7. **Shadow logging** — 403 that v2 would have blocked but v1 allowed → log only.
8. **Performance** — benchmark resolver with 5 roles × 200 permissions; target < 5ms cached.
9. **Enable flag** — `RBAC_V2_RESOLVER` per tenant after parity report clean.

### Acceptance criteria

- [ ] 100% parity between v1 and v2 for all system role assignments (automated test)
- [ ] Bundle expansion documented and tested for `financial.write`
- [ ] Effective context API returns within authMiddleware cache TTL
- [ ] Pilot rental routes enforce new keys when flag on
- [ ] Zero increase in 403 rate when flag off

### Dependencies

Phase 1 (aliases), Phase 2 (multi-role data).

### Rollback

Disable `RBAC_V2_RESOLVER` — instant revert to v1 resolver.

---

## Phase 4 — Data Scope Security

### Objective

Implement dimensional data filtering so users can be restricted to assigned projects, properties, or owners.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Scope tables migration | `rbac_user_data_scopes`, `rbac_role_data_scopes` |
| DataScopeEngine | `modules/rbac/services/rbacDataScopeResolver.ts` |
| Scope types | `shared/rbac/dataScopeTypes.ts` |
| Scope admin permissions | `administration.scopes.view`, `.edit`, `.delegate` |
| Scope CRUD API | `/api/v1/rbac/scopes` |
| Repository mixin | `backend/src/core/tenantRepositoryScope.ts` |
| Pilot repositories | Projects, rental properties, project agreements |
| Scope admin UI | Settings → Data Scope assignments |
| Frontend hook | `useDataScope()` |
| List filter UX | Project/property pickers respect scope |

### Tasks

1. **Schema** — scope tables with dimension enum, entity_id nullable for `all`.
2. **Resolver** — merge role scopes + user scopes; `all` wins; union assigned IDs.
3. **Repository helper** — `applyScopeFilter(sql, scopes, { dimension, column })`.
4. **Pilot: projects module** — all list/detail queries apply project scope when flag on.
5. **Pilot: rental module** — property/building scope on agreements and invoices.
6. **Pilot: CRM** — owner scope on investor/owner contacts.
7. **Default policy** — no scope rows = `all` (implicit); document opt-in tightening.
8. **Admin UI** — assign projects/properties to user or role; bulk import CSV.
9. **Delegation** — cannot assign entity IDs outside actor's visible set.
10. **Tests** — PM with assigned project A cannot GET project B (404 or empty).
11. **Reports** — pass scope filters to report engine parameters.

### Scope rollout order

1. Projects (construction)
2. Properties / buildings (rental)
3. Owner contacts (investor modules)
4. Company dimension (when org model ready)

### Acceptance criteria

- [ ] Scope enforcement verified by integration tests on pilot modules
- [ ] Flag off → no scope SQL applied (behavior identical to today)
- [ ] Flag on + no scope rows → all data visible (backward compatible)
- [ ] Flag on + assigned scope → filtered lists and 403/404 on out-of-scope detail
- [ ] super_admin / company_admin default to `all` without manual assignment
- [ ] Audit log on scope changes

### Dependencies

Phase 3 (effective context carries scopes).

### Rollback

Disable `RBAC_V2_DATA_SCOPE` — repositories skip scope helper.

---

## Phase 5 — Approval Matrix

### Objective

Replace hardcoded role-slug approver resolution with permission- and scope-aware approval routing.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Matrix rules table | `rbac_approval_matrix_rules` |
| ApprovalMatrixEngine | `modules/rbac/services/rbacApprovalMatrixService.ts` |
| Matrix types | `shared/rbac/approvalMatrixTypes.ts` |
| Capability keys | `approve.payments`, `approve.bills`, etc. |
| Matrix CRUD API | `/api/v1/rbac/approval-matrix` |
| Workflow integration | Replace `resolveApproverUserIds()` in `workflowEngineService.ts` |
| Matrix admin UI | Settings → Approval Matrix (rules by entity type / amount) |
| Shadow mode | Log v1 vs v2 approver diff before cutover |
| Segregation of duties | Requester ≠ approver enforcement |

### Default matrix seeds (per tenant)

| Entity type | Level 1 permission | Level 2 permission | Level 3 permission |
|-------------|-------------------|-------------------|-------------------|
| `purchase_order` | `procurement.purchase_orders.approve` | `procurement.purchase_orders.approve` + amount > threshold | `administration.approvals.final` |
| `payroll_run` | `payroll.runs.approve` | `payroll.runs.approve` | `administration.approvals.final` |
| `rental_agreement` | `rental.agreements.approve` | `rental.agreements.approve` | `administration.approvals.final` |
| `vendor_bill` | `procurement.bills.approve` | `procurement.bills.approve` | `administration.approvals.final` |
| `payment` | `approve.payments` | `approve.payments` | `administration.approvals.final` |

Seeds mirror current informal behavior (accountant → company_admin escalation).

### Tasks

1. **Schema** — matrix rules with JSON conditions, priority ordering.
2. **Engine** — match rules by entity type, amount, project; output approver user IDs.
3. **Approver pool query** — users with required permission + scope covering request context.
4. **Shadow mode** — run both v1 role resolver and v2 matrix; log diffs for 2 weeks staging.
5. **Workflow swap** — feature flag selects resolver implementation.
6. **Admin UI** — rule builder with entity type, amount range, permission picker.
7. **Notifications** — existing `notifyApproversForRequest()` unchanged; new user ID list source.
8. **Tests** — amount escalation, scope-bound approval, self-approval blocked.

### Acceptance criteria

- [ ] Shadow mode shows ≥ 95% approver match with v1 for default seeds
- [ ] Matrix-configured tenant routes approvers correctly
- [ ] Requester cannot approve own request
- [ ] `workflow.approve` still required on approve API
- [ ] Approval queue UI unchanged (same API shape)
- [ ] Rollback flag restores role-slug resolver

### Dependencies

Phase 3 (permissions), Phase 4 (scope on approver pool).

### Rollback

Disable `RBAC_V2_APPROVAL_MATRIX`.

---

## Phase 6 — Migration

### Objective

Migrate existing tenants from v1 role assignments to RBAC 2.0 roles, scopes, and matrix configs with admin review — **no automatic production changes without confirmation**.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Migration assessment script | `scripts/rbac-assess-tenant.mjs` |
| Snapshot export API | `POST /api/v1/rbac/export-snapshot` |
| Snapshot restore API | `POST /api/v1/rbac/restore-snapshot` (super_admin only) |
| Role mapping wizard | Admin UI — map legacy roles → templates |
| Bulk scope import | CSV: user_id, dimension, entity_id |
| Matrix seed script | `scripts/rbac-seed-approval-matrix.mjs` |
| Parity report | Per-tenant v1 vs v2 effective permissions diff |
| Migration runbook | `docs/security/RBAC_2_MIGRATION_RUNBOOK.md` |

### Migration steps (per tenant)

```
1. Export snapshot (rbac_* + users.role)
2. Run assessment — list users, roles, effective permissions
3. Map custom roles to nearest template (admin review)
4. Optional: assign project/property scopes for PMs
5. Seed approval matrix from defaults
6. Run parity report — expect 100% permission superset (v2 ≥ v1)
7. Enable flags in order: RESOLVER → DATA_SCOPE → APPROVAL_MATRIX
8. Monitor 403 rate + support tickets for 72 hours
9. Mark tenant migrated in app_settings
```

### Tasks

1. **Assessment script** — dry-run output: users × permissions matrix.
2. **Snapshot format** — versioned JSON with checksum.
3. **Mapping wizard UI** — side-by-side v1 role vs proposed v2 template.
4. **Automated parity test** — CI job with fixture tenants.
5. **Legacy role string cleanup plan** — document when `users.role` becomes display-only (Phase 7).
6. **Remove hardcoded role checks** — inventory and fix `useInvestorFundAvailability`, `useProjectProfitabilityAnalytics`, `isAdminRole`, Sidebar heuristics.
7. **Staging tenant pilot** — migrate `pBookspro_Staging` first.

### Acceptance criteria

- [ ] Staging tenant migrated with zero permission regression (automated)
- [ ] Snapshot restore tested successfully
- [ ] All hardcoded role checks replaced with permission checks (inventory grep clean)
- [ ] Migration runbook reviewed by ops
- [ ] Admin can complete wizard without developer assistance

### Dependencies

Phases 1–5 complete on staging.

### Rollback

Restore snapshot + disable all RBAC_V2_* flags for tenant.

---

## Phase 7 — Production Rollout

### Objective

Gradual production enablement with monitoring, training, and v1 deprecation timeline.

### Deliverables

| Deliverable | Location |
|-------------|----------|
| Rollout schedule | Per-tenant calendar |
| Admin training guide | `docs/security/RBAC_2_ADMIN_GUIDE.md` |
| Support runbook | Escalation + flag disable procedure |
| Monitoring dashboard | 403 rate, RBAC audit volume, scope deny counts |
| v1 deprecation notice | Release notes + in-app banner |
| Strict mode | `RBAC_V2_STRICT_MODE` — deny unmapped permissions |
| Final verification | `npm run verify:rbac-v2` CI gate |

### Rollout waves

| Wave | Tenants | Flags enabled | Duration |
|------|---------|---------------|----------|
| Wave 0 | Internal / demo | All | 2 weeks |
| Wave 1 | 3 pilot customers (opt-in) | All | 2 weeks |
| Wave 2 | 25% production tenants | All | 2 weeks |
| Wave 3 | 75% production tenants | All | 2 weeks |
| Wave 4 | 100% + strict mode | STRICT_MODE | 4 weeks |

### Tasks

1. **Monitoring** — log `RBAC_DENY` with permission key, route, userId (no PII in logs).
2. **Training** — video + admin guide for role templates and scope assignment.
3. **Release notes** — each production release documents RBAC changes.
4. **In-app banner** — Settings → “RBAC 2.0 enabled” with link to guide.
5. **Strict mode** — after 30 days at 100%, enable strict mode per tenant.
6. **v1 deprecation** — announce 90-day timeline to remove static `ROLE_PERMISSIONS` fallback for tenants with DB assignments.
7. **Post-launch review** — security review, penetration test on scope bypass.
8. **CI gate** — `verify:rbac-v2` required on `main` CI.

### Acceptance criteria

- [ ] 100% production tenants on RBAC 2.0 flags
- [ ] No critical scope bypass findings in security review
- [ ] Support ticket volume within 1.5× baseline during rollout
- [ ] v1 deprecation date communicated
- [ ] Architecture compliance checklist (§10) satisfied for RBAC module

---

## Verification commands (cumulative)

```powershell
# After every phase
npm run build:backend
npm run verify:track-e

# Phase 1+
npm run verify:rbac-catalog        # new script

# Phase 3+
npm run test -- rbacPermissionEngine
npm run test -- rbacMiddleware

# Phase 6+
node scripts/rbac-assess-tenant.mjs --tenant <id> --env staging

# Phase 7
npm run verify:rbac-v2             # new script — full gate
```

---

## Resource estimate

| Role | Involvement |
|------|-------------|
| Backend engineer | Phases 1–5, 6 scripts |
| Frontend engineer | Phases 1–2 UI, 4 scope UI, 5 matrix UI |
| QA | Parity tests, scope integration tests, rollout monitoring |
| Security review | Phase 4 (scope), Phase 7 (pen test) |
| Technical writer | Admin guide, migration runbook |
| Product / ops | Phase 6 wizard UX, Phase 7 rollout scheduling |

---

## Risk register (implementation)

| Phase | Top risk | Mitigation |
|-------|----------|------------|
| 1 | Catalog drift from code | CI verify script |
| 2 | Privilege escalation via delegate | assertCanDelegate + audit |
| 3 | Resolver parity failure | Dual-run logging before enable |
| 4 | Data leak via missed repository | Pilot modules first; grep for unscoped queries |
| 5 | Wrong approver routing | Shadow mode 2 weeks |
| 6 | Tenant lockout | Snapshot restore + flag disable |
| 7 | Support overload | Phased waves; training |

---

## Definition of done (program level)

- [ ] `RBAC_2_ARCHITECTURE.md` approved
- [ ] All seven phases deployed to staging
- [ ] Pilot production tenants migrated successfully
- [ ] No changes to RealtimeDispatchHub, TEQ, or FinancialPostingService
- [ ] Existing v1 permission assignments preserved unless admin opts in
- [ ] super_admin break-glass operational
- [ ] Ready for Claude review

---

## Related documents

| Document | Purpose |
|----------|---------|
| [`RBAC_2_ARCHITECTURE.md`](./RBAC_2_ARCHITECTURE.md) | Target architecture |
| [`docs/rbac/rbac-v2-specification.md`](../rbac/rbac-v2-specification.md) | Prior delegation/audit spec |
| [`doc/ARCHITECTURE.md`](../../doc/ARCHITECTURE.md) | Architecture v2.1 authority |
| [`.cursor/rules/09_permissions_rules.mdc`](../../.cursor/rules/09_permissions_rules.mdc) | Implementation conventions |

---

*End of RBAC 2.0 Implementation Plan.*

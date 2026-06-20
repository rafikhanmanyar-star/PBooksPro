# RBAC V2 Permission Migration Plan

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only  
**Authority:** [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md), [`RBAC_V2_MIGRATION_STRATEGY.md`](./RBAC_V2_MIGRATION_STRATEGY.md)

---

## Purpose

Map legacy v1 permissions to RBAC V2 catalog keys, document downstream impact (routes, reports, approvals, scopes), and rollback risk. Canonical expansion definitions live in `shared/rbac/permissionBundles.ts`.

---

## Migration categories

| Category | v1 keys | v2 approach |
|----------|---------|-------------|
| **Unchanged flat keys** | 55 v1 keys in `ALL_PERMISSIONS` | Retained in catalog; route guards migrate to specific v2 keys over time |
| **Bundle alias** | `financial.write` | Expands to `FINANCIAL_WRITE_BUNDLE` (~73 keys) via PermissionEngine |
| **Role-aware bundle** | `financial.write` for `project_manager` | Expands to `PROJECT_MANAGER_FINANCIAL_BUNDLE` subset only |
| **New v2-only keys** | — | ~99 additional catalog keys (feature/page/action hierarchy) |
| **Restricted keys** | Various | In `restrictedPermissions.ts` — super_admin / break-glass only |

---

## v1 → v2 mapping (summary)

Full mapping: [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md).

### Direct v1 keys (no expansion)

These v1 keys remain first-class in the v2 catalog with the same semantic meaning:

| Legacy permission | RBAC V2 permission | Notes |
|-------------------|------------------|-------|
| `reports.*.read` | Same keys | Report read unchanged |
| `payroll.read` / `payroll.write` | Same + v2 page/action keys | Scope applies to department when enabled |
| `users.read` / `users.manage` | Same + `administration.users.*` | |
| `billing.read` / `billing.manage` | Same | `billing.manage` restricted |
| `audit_logs.read` | Same | |
| `permissions.read/view/manage` | Same + v2 admin keys | Manage restricted |
| `roles.view/manage` | Same + `administration.roles.*` | Restricted |
| `users.role.assign` | Same | Restricted |
| `backups.read/manage` | `backups.*` + `administration.backups.*` | Manage restricted |
| `pev.*` | Same + v2 accounting keys | SoD: create ≠ approve |
| `contracts.retention.*` | Same | override restricted |
| `project_selling.*` | Same + v2 selling keys | |
| `procurement.*` | Same + v2 procurement keys | approve keys SoD-restricted |
| `purchase_order.*` | Same + v2 PO keys | approve SoD-restricted |
| `workflow.*` | Same | admin restricted |
| `goods_receipt.*` | Same | post/close SoD pairs |

### Bundle alias

| Legacy permission | RBAC V2 expansion | Excludes (SoD) |
|-------------------|-------------------|----------------|
| `financial.write` | `FINANCIAL_WRITE_BUNDLE` — accounting, procurement, property, rental, projects, customers, administration settings, reports custom/designer | All `*.approve`, `approve.payments`, `payroll.runs.approve`, `personal.finance.*` (NM3) |

### Personal finance (NM3)

| Legacy | RBAC V2 | Bundle membership |
|--------|---------|-------------------|
| (implicit via financial.write in v1 docs) | `personal.finance.view/create/edit/delete` | **Excluded** from `FINANCIAL_WRITE_BUNDLE` — standalone keys on personal finance routes |

---

## Route impact

| Migration step | Legacy guard | Target v2 guard | Routers affected |
|----------------|--------------|-----------------|------------------|
| Phase 3 pilot | `requireFinancialWriteOnMutations` | Per-domain `requirePermissionV2('domain.page.action')` | Start: `accountsRouter`, `journalRouter` |
| Phase 6 full | All 22 mount-level guards | Specific v2 keys per PERMISSION_MIGRATION_MAP §3 | All listed in §3 |
| Phase 6 | `requireLedgerRole` | `accounting.journals.create`, `.reverse`, `accounting.periods.*` | §4 routes |
| Phase 6 | `requireWriteOnMutations(..., financial.write)` OR | Remove financial.write fallback | Project selling routers §3 |
| Phase 7 | `requirePermission` (legacy) | `requirePermissionV2` only | All migrated routes |

**Rollback risk (route):** If v2 engine disabled while routes use `requirePermissionV2` only → **503 AUTH_MISCONFIGURED**. Rollback requires reverting route guards **or** keeping engine enabled.

---

## Report impact

| Legacy check | v2 check | Scope impact |
|--------------|----------|--------------|
| `reports.*.read` | Same + feature access keys | `RBAC_V2_DATA_SCOPE` filters by project/property/owner/department |
| `canWriteFinancial` / `financial.write` | `reports.custom.create/edit/delete/export`, `reports.designer.edit` | Custom report mutations |
| Report services | `applyDataScope()` | rental, construction, balance sheet, P&L, cash flow, trial balance, payroll config |

**Validation:** Run report suite per role with scope grants; compare row counts pre/post scope enablement.

---

## Approval impact

| Legacy | RBAC V2 | Impact |
|--------|---------|--------|
| `workflow.approve` + role slug resolver | Approval matrix assignments + `canApprove()` | Approver pool from matrix, not hardcoded slugs |
| Direct journal POST | Draft → submit → approve → post | When `RBAC_V2_APPROVAL_MATRIX=true` |
| (none) | `accounting.journals.approve` | Restricted; super_admin assigns approvers |
| (none) | `administration.approvals.final` | Matrix assignment mutations |

**SoD at approval:** Expanded create keys from `financial.write` must not coexist with approve keys on same user.

---

## Scope impact

| Permission domain | Scope dimension when `RBAC_V2_DATA_SCOPE=true` |
|-------------------|------------------------------------------------|
| Projects / construction | `project` |
| Property / rental | `property`, `owner` |
| Payroll / HR | `department` |
| Accounting (tenant-wide) | No scope filter (full tenant) unless grant restricts |
| Reports | Inherited from underlying entity scope |

**Migration:** Assign scope grants in Stage 4 before enabling scope flag for tenant users who previously saw all tenant data.

---

## Parity validation

### Permission loss (blocking)

**Rule:** For every active user, the rbac assignment path must include all v1 permission keys from the legacy static matrix for their `users.role`:

```
legacyV1 = permissionsForRole(users.role)
rbacV1   = union(rbac_role_permissions via rbac_user_roles)
REQUIRE: legacyV1 ⊆ rbacV1
```

**Tool:** `node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --parity`

**Exit code 1** = permission loss detected — **blocks** Stage 2.5, 3, and 6 exit.

### Permission Gain Review (non-blocking, sign-off required)

**Rule:** Flag users whose rbac effective permissions **exceed** the legacy static matrix for their stored role.

| Trigger | Action |
|---------|--------|
| Any extra v1 key in rbac path vs legacy static matrix | Document in gain review log |
| Any **restricted** permission in expanded gain set | **Mandatory** Security Lead review |
| Expanded count delta > `--gain-threshold` | Review before Stage 3 exit |

**Why:** Prevents silent privilege escalation from duplicate assignments, manual DB edits, or bootstrap mapping errors.

**Sign-off:** super_admin or security_administrator records approval in staging cutover log.

**Tool output section:** `Permission Gain Review (human sign-off required)`

---

## Rollback risk by permission type

| Permission change | Rollback difficulty | Notes |
|-------------------|---------------------|-------|
| Catalog registration only | **None** | No runtime change |
| Engine + bundle expand | **Low** | Disable `RBAC_V2_AUTHORIZATION_ENGINE` |
| Route guard migration | **Medium** | Must revert to `requirePermission` if engine off |
| SoD enforcement | **High** | Do not disable post-cutover without security sign-off |
| Data scope | **Low** | Disable `RBAC_V2_DATA_SCOPE` — full tenant visibility returns |
| Approval matrix | **Low** | Disable `RBAC_V2_APPROVAL_MATRIX` — legacy journal post + slug approvers |
| Strict mode | **Low** | Disable `RBAC_V2_STRICT_MODE` — unmapped keys allowed again |

---

## Verification commands

```powershell
npm run verify:rbac-v2
npm run verify:rbac-catalog
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --parity
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --sod-report
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --bootstrap --dry-run
```

See [`RBAC_V2_PARITY_TOOL.md`](./RBAC_V2_PARITY_TOOL.md) for full usage and examples.

---

## Migration sequence (permission layer)

1. **Stage 1** — Catalog live; no guard change.
2. **Stage 2.5** — Bootstrap `rbac_user_roles`; parity loss = 0; gain review signed off.
3. **Stage 3** — Engine expands bundles; dual-run parity logging.
4. **Stage 6** — Role splits; SoD report zero; replace guards.
5. **Stage 7** — `RBAC_V2_STRICT_MODE` — deny unmapped permissions.
6. **Decommission** — Remove bundle alias from engine (30+ days stable).

---

*End of permission migration plan.*

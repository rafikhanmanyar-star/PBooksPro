# RBAC V2 Role Migration Plan

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only  
**Authority:** [`RBAC_2_MIGRATION_STRATEGY.md`](./RBAC_V2_MIGRATION_STRATEGY.md), [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md), [`SoD_MATRIX.md`](./SoD_MATRIX.md)

---

## Purpose

Map every legacy role to its RBAC V2 target, document permission deltas, migration risk, and validation steps. **No automatic production reassignment** — admin review required per tenant.

---

## Legacy alias resolution

Stored `users.role` values normalize via `LEGACY_ROLE_TO_ENTERPRISE` in `shared/rbac/permissions.ts`:

| Legacy stored value | Target enterprise slug | Display name (v2) |
|---------------------|------------------------|-------------------|
| `super_admin` | `super_admin` | Super Administrator |
| `admin`, `manager` | `company_admin` | Company Administrator |
| `accounts` | `accountant` | Accounts Officer → **Accountant** |
| `accountant` | `accountant` | Accountant |
| `project_manager`, `team_lead` | `project_manager` | Project Manager |
| `sales`, `sales_user` | `sales_user` | Sales User |
| `read_only`, `viewer`, `task_contributor` | `read_only` | Read Only User |

Additional seeded roles (no legacy alias): `security_administrator`, `SYSTEM_OWNER`.

---

## Role migration matrix

### super_admin → Super Administrator

| Field | Value |
|-------|-------|
| **Tier** | T1 — Tenant sovereign |
| **Current permissions** | All 55 v1 keys (implicit) |
| **Target permissions** | All catalog keys; unrestricted delegation |
| **Permission differences** | Gains explicit v2 catalog keys (~154); `financial.write` remains alias until strict mode |
| **Migration risk** | **Low** — no effective access reduction |
| **SoD concern** | None — single role holds all; break-glass is session-based, not standing SoD violation |
| **Validation** | Login → `GET /api/v1/rbac/effective-context` → permissions count ≥ v1; assign test role succeeds |

---

### admin / company_admin → Company Administrator

| Field | Value |
|-------|-------|
| **Tier** | T3 (T2 if granted `permissions.delegate` by super_admin) |
| **Current permissions (v1)** | Reports read, payroll r/w, users r/manage, billing r/manage, audit, `financial.write`, permissions.read, backups, PEV, retention (incl. override), procurement, workflow (all), goods receipt |
| **Target permissions (v2)** | Same effective set via `FINANCIAL_WRITE_BUNDLE` expansion + explicit v1 keys retained; **restricted keys remain super_admin-only** per [`PRIVILEGE_CEILING.md`](./PRIVILEGE_CEILING.md) |
| **Permission differences** | **Tightening:** `accounting.journals.approve`, `accounting.periods.close`, `*.approve` keys not grantable by company_admin even with delegate; journal approver assignment requires super_admin (A5.1.5.1 C1) |
| **Migration risk** | **Medium** — users who informally acted as journal approvers via broad admin access must receive explicit approver role/assignment |
| **SoD concern** | **High** — `financial.write` expansion + `workflow.admin` may imply create+approve pairs; migration must split approver duties to separate roles/users |
| **Validation** | Parity report for each user; SoD report zero violations; PO/bill/payroll approve flows tested with matrix |

**Recommended split templates (admin review):**

| Template | Purpose |
|----------|---------|
| `company_admin` (unchanged slug) | Operations admin without approve keys |
| `finance_approver` | `*.approve` + `workflow.approve` only |
| `journal_approver` | `accounting.journals.approve` only (super_admin assigns) |

---

### accounts / accountant → Accountant

| Field | Value |
|-------|-------|
| **Tier** | T4 — Domain role |
| **Current permissions (v1)** | Reports read, payroll r/w, billing.read, audit, `financial.write`, permissions.read, PEV, retention v/e/r, procurement, `workflow.approve`, goods receipt |
| **Target permissions (v2)** | Expanded `financial.write` keys; explicit retain v1 keys during transition |
| **Permission differences** | **Tightening:** `accounting.journals.create` + `accounting.journals.approve` cannot coexist (SoD); `workflow.approve` + expanded create keys may violate SoD on PO/bills |
| **Migration risk** | **High** — classic accountant role often combines preparer + approver |
| **SoD concern** | **Critical** — must split into `accountant_preparer` / `accountant_approver` or multi-role with non-overlapping permission sets |
| **Validation** | Run `rbac-assess-tenant.mjs --sod-report`; verify journal submit requires separate approver when matrix enabled |

**Recommended split:**

| Template | Permissions (summary) |
|----------|----------------------|
| `accountant_preparer` | `financial.write` expansion minus approve keys; `workflow.view` |
| `accountant_approver` | `procurement.bills.approve`, `procurement.purchase_orders.approve`, `workflow.approve`, `accounting.journals.approve` (assigned by super_admin) |

---

### project_manager → Project Manager

| Field | Value |
|-------|-------|
| **Tier** | T4 |
| **Current permissions (v1)** | P&L + cash flow read, project selling read, `financial.write` (PM subset), PEV create, retention v/e/r, procurement quote/PO, workflow view, GRN v/c/e |
| **Target permissions (v2)** | `PROJECT_MANAGER_FINANCIAL_BUNDLE` — **not** full `FINANCIAL_WRITE_BUNDLE` (see PERMISSION_MIGRATION_MAP §11) |
| **Permission differences** | **Neutral/tightening:** explicit exclusion of payroll, billing, backups, trial balance, approve keys |
| **Migration risk** | **Low–Medium** — users relying on full financial.write via legacy resolver may lose access to accounting domains they should not have had |
| **SoD concern** | **Medium** — if `workflow.approve` added manually, check PO create+approve pair |
| **Validation** | PM can create PO but not approve; cannot access payroll; budget/project scope applies when data scope enabled |

---

### sales_user → Sales User

| Field | Value |
|-------|-------|
| **Tier** | T4 |
| **Current permissions (v1)** | `project_selling.*` bundle (read, catalog, marketing, agreements, invoices, payments) |
| **Target permissions (v2)** | Same selling keys; **no** `financial.write` fallback on selling routers after route migration |
| **Permission differences** | **Tightening:** removal of `financial.write` OR fallback on documents/invoices routers |
| **Migration risk** | **Low** if selling keys complete; **Medium** if user relied on financial.write fallback |
| **SoD concern** | Low |
| **Validation** | Sales user can create agreement/invoice; cannot post journal or access procurement admin |

---

### read_only → Read Only User

| Field | Value |
|-------|-------|
| **Tier** | T5 |
| **Current permissions (v1)** | Reports read, payroll.read, audit, PEV read, retention view, price history, PO view, workflow view, GRN view |
| **Target permissions (v2)** | Same read keys + catalog read keys where applicable |
| **Permission differences** | Minimal |
| **Migration risk** | **Low** |
| **SoD concern** | None |
| **Validation** | All mutation endpoints return 403; reports respect data scope when enabled |

---

### security_administrator → Security Administrator

| Field | Value |
|-------|-------|
| **Tier** | T2 |
| **Current permissions (v1)** | `roles.view/manage`, `permissions.view/manage`, `users.role.assign` |
| **Target permissions (v2)** | RBAC admin bundle + v2 keys: `administration.roles.*`, `audit_logs.rbac.read`; **no** business domain write |
| **Permission differences** | Gains v2 administration keys; explicitly excluded from `financial.write` |
| **Migration risk** | **Low** |
| **SoD concern** | Low — cannot hold approve keys by ceiling |
| **Validation** | Can assign roles subject to ceiling; cannot post journal |

---

### SYSTEM_OWNER → System Owner (break-glass only)

| Field | Value |
|-------|-------|
| **Tier** | T0 (session-bound) |
| **Current permissions** | Implicit all (hidden role) |
| **Target permissions** | **No standing assignment** — use break-glass session (`RBAC_V2_BREAK_GLASS`) |
| **Permission differences** | **Tightening:** standing SYSTEM_OWNER role should not be assigned to users; recovery via MFA break-glass |
| **Migration risk** | **Medium** — tenants relying on hidden SYSTEM_OWNER user |
| **Validation** | Break-glass activate → audit `BREAK_GLASS_ACTIVATED`; session expires; no standing SoD violations |

---

## Cross-role migration procedure (Stage 2.5 + Stage 6)

**Stage 2.5** — bootstrap all users into `rbac_user_roles` (see [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md)):

```powershell
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --bootstrap
node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --parity
```

**Stage 6** — role splits and SoD resolution:

1. Export tenant role/assignment snapshot (DB backup or audit export).
2. Run `node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --sod-report`.
3. Propose role splits (tables above) — **admin sign-off**.
4. Backfill `rbac_role_permissions` from static matrix for system roles.
5. Apply multi-role assignments for split personas (accountant_preparer / accountant_approver).
6. Run `--parity` — loss = 0; gain review signed off.
7. Communicate forced re-login when engine enabled (if not already done in Stage 3).

---

## Validation checklist (all roles)

- [ ] Every active user has ≥1 row in `rbac_user_roles`
- [ ] System role slugs match seeded names
- [ ] SoD report: zero standing violations
- [ ] Parity report: no unintentional permission loss
- [ ] Restricted permissions held only by super_admin (or break-glass session)
- [ ] Custom roles reviewed against privilege ceiling

---

*End of role migration plan.*

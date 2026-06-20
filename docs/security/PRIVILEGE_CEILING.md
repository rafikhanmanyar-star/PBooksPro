# Privilege Ceiling — RBAC 2.0

**Phase:** A5.1.0.3 — Final Security Closure (H6)  
**Status:** Architecture policy — no implementation  
**Companion:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md), [`RBAC_DECISIONS.md`](./RBAC_DECISIONS.md)

---

## Purpose

Define **maximum grantable permissions** per administrative role. Prevents privilege escalation via delegation, template instantiation, or role cloning even when SoD checks pass.

**Distinction from SoD:** SoD blocks incompatible pairs (create + approve). Privilege ceiling blocks granting permissions **above the actor's tier**, regardless of SoD compatibility.

---

## Role tiers

| Tier | Roles | May grant permissions up to |
|------|-------|----------------------------|
| **T0 — Platform** | `SYSTEM_OWNER` break-glass, platform admin portal | All (session-bound) |
| **T1 — Tenant sovereign** | `super_admin` | All tenant permissions |
| **T2 — Security admin** | `security_administrator` | RBAC administration bundle only (see §4) |
| **T3 — Company admin** | `company_admin` (with `permissions.delegate`) | Company admin ceiling (see §3) |
| **T4 — Domain roles** | `accountant`, `project_manager`, custom roles | Subset only — **cannot delegate** unless explicitly granted `permissions.delegate` (not default) |
| **T5 — Standard users** | All others | None |

---

## Restricted Permission Registry

Permissions in this registry **cannot be granted** by `company_admin` or `security_administrator`. Only `super_admin` (T1) or break-glass (T0) may assign them.

| Permission key | Reason |
|----------------|--------|
| `permissions.delegate` | Delegation authority itself |
| `roles.manage` | Role definition changes (security_administrator excepted for RBAC roles) |
| `permissions.manage` | Permission matrix edits |
| `users.role.assign` | Role assignment to users |
| `administration.roles.edit` | v2 RBAC role CRUD |
| `administration.scopes.edit` | Data scope assignment |
| `administration.scopes.delegate` | Scope delegation |
| `administration.backups.restore` | Disaster recovery |
| `administration.backups.manage` | Backup run/retry (v1: `backups.manage`) |
| `administration.audit.export` | Bulk audit export |
| `audit_logs.rbac.read` | RBAC audit trail |
| `roles.assign.temporary` | Time-limited elevation |
| `roles.template.create` | Template authoring |
| `roles.template.manage` | Template publish/delete |
| `workflow.admin` | Workflow engine configuration |
| `billing.manage` | Subscription/billing mutations (v1) |
| `approve.payments` (final level) | Payment release above tenant threshold |
| `accounting.journals.approve` | Journal approval (mandatory flow — H4) |
| `accounting.periods.close` | Period close |
| Break-glass activation capability | Not a permission key — gated by bootstrap list + MFA |

**Registry maintenance:** New restricted keys added in `shared/rbac/restrictedPermissions.ts` (implementation phase). CI verifies registry ⊆ `ALL_PERMISSIONS`.

---

## Maximum grantable permissions

### Rule

```
grantable(actor, targetPermission) =
  actor.tier >= requiredTier(targetPermission)
  AND targetPermission ∈ actor.resolvedPermissions
  AND NOT (targetPermission ∈ RESTRICTED AND actor.tier > T1)
  AND assertCanDelegate() passes
  AND assertNoSodViolation() passes
```

`assertCanDelegate()` runs on **every** mutation listed in Architecture V2 §4.7 (role create, assign, clone, template instantiate).

---

## Company Admin ceiling (H6)

**Default `company_admin`** (without `permissions.delegate`): may manage users and tenant settings within existing static matrix — **cannot** create custom roles or assign permissions.

**`company_admin` with `permissions.delegate`** (explicitly granted by `super_admin` only):

### Included in ceiling (may grant to custom roles)

| Domain | Grantable permissions |
|--------|----------------------|
| Reports | All `reports.*.read` |
| Payroll | `payroll.read`, `payroll.write` — **not** `payroll.runs.approve` |
| Users | `users.read`, `users.manage` — **not** `users.role.assign` |
| Billing | `billing.read` only — **not** `billing.manage` |
| Audit | `audit_logs.read` |
| Accounting | All `accounting.*` **except** `accounting.journals.approve`, `accounting.periods.close`, `accounting.journals.reverse` |
| Procurement | All `procurement.*` **except** `*.approve` keys |
| Project selling | All `project_selling.*` except approve keys |
| PEV | `pev.read`, `pev.create`, `pev.post` — **not** `pev.approve` |
| Retention | view, edit, release — **not** override |
| PO / GRN | All except `purchase_order.approve`, `goods_receipt.post`, `goods_receipt.close` |
| Workflow | `workflow.view`, `workflow.approve` — **not** `workflow.admin`, `workflow.manage` |
| Rental / property / projects | All non-approve v2 keys in catalog |
| CRM | All non-admin v2 keys |
| Backups | `backups.read` — **not** `backups.manage` |
| RBAC | `permissions.read` only — **not** roles/permissions manage |

### Explicitly above ceiling (super_admin only)

Everything in **Restricted Permission Registry** plus:

- `permissions.delegate`
- `users.role.assign`
- `roles.manage`, `permissions.manage`
- `billing.manage`, `backups.manage`
- `workflow.admin`
- All `*.approve` permissions for payroll, journals, payments, PO, bills
- `contracts.retention.override`
- `procurement.price_validation.override`

### company_admin cannot become super_admin equivalent

Even with `permissions.delegate`, `company_admin` **cannot**:

- Grant permissions they do not hold
- Grant restricted registry permissions
- Instantiate a template containing any restricted or above-ceiling permission
- Assign `super_admin` or `security_administrator` roles
- Clone a role with permissions above their ceiling

---

## Security Administrator ceiling

**Scope:** RBAC administration only — no business domain write access.

### Included (maximum set)

| Permission | Purpose |
|------------|---------|
| `roles.view` | View roles |
| `roles.manage` | Create/edit custom roles **within tenant** |
| `permissions.view` | View permission catalog |
| `permissions.manage` | Assign permissions to roles **subject to ceiling** |
| `users.role.assign` | Assign roles to users |
| `audit_logs.rbac.read` | RBAC audit trail |
| `administration.roles.view` | v2 role UI |
| `administration.roles.edit` | v2 role CRUD (not system protected slugs) |

### Excluded (cannot grant or hold for business operations)

- `financial.write` and all accounting write keys
- All `*.approve` permissions
- `permissions.delegate` — **super_admin grants this to company_admin, not security_administrator**
- `billing.manage`, `backups.manage`
- `workflow.admin`
- Break-glass activation

### Security administrator delegation rule

When `security_administrator` assigns permissions to a custom role:

```
targetPermissions ⊆ SECURITY_ADMINISTRATOR_PERMISSIONS
  ∪ (permissions already on target role at edit time)
  ∩ ¬RESTRICTED_REGISTRY
```

Security administrator **may** assign any non-restricted permission that exists in the catalog **only if** they also hold it — they typically hold RBAC keys only, so they assign RBAC keys to RBAC delegate roles, not financial keys.

**Escalation path:** Business permission assignment requires `company_admin` with `permissions.delegate` or `super_admin`.

---

## Escalation rules

| Scenario | Handler |
|----------|---------|
| User needs permission above company_admin ceiling | `super_admin` grants directly or elevates role |
| User needs RBAC admin access | `super_admin` assigns `security_administrator` |
| company_admin needs delegation authority | `super_admin` grants `permissions.delegate` |
| Emergency full access | SYSTEM_OWNER break-glass (T0) — not standing assignment |
| Template contains restricted permission | Block at instantiate unless actor is T0/T1 |
| Clone role with above-ceiling permissions | Block unless actor is T0/T1 |
| Temporary elevation | `roles.assign.temporary` — super_admin only; max 30 days |

### HTTP response (implementation phase)

```json
{
  "success": false,
  "error": {
    "code": "PRIVILEGE_CEILING_EXCEEDED",
    "message": "Cannot grant accounting.journals.approve: restricted permission.",
    "details": {
      "permission": "accounting.journals.approve",
      "actorTier": "T3",
      "requiredTier": "T1"
    }
  }
}
```

---

## Enforcement points

| Operation | Checks |
|-----------|--------|
| Role create | `assertCanDelegate` + ceiling + SoD |
| Role update (permissions) | Same |
| Role clone | Same on resulting permission set |
| Template instantiate | Same on template permission set |
| User role assign | Ceiling on union of user's new effective permissions |
| Direct permission grant | Same |

---

## Acceptance criteria (implementation phase)

- [ ] `company_admin` with delegate cannot assign `users.role.assign`
- [ ] `company_admin` cannot instantiate template containing `billing.manage`
- [ ] `security_administrator` cannot assign `financial.write`
- [ ] `super_admin` can assign all non-platform restricted keys
- [ ] Restricted registry enforced in CI (`verify:rbac-ceiling`)
- [ ] Blocked attempts audited as `PRIVILEGE_CEILING_BLOCKED`

---

*End of Privilege Ceiling.*

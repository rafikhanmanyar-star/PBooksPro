# Separation of Duties (SoD) Matrix — RBAC 2.0

**Phase:** A5.1.0.4 — Final Review Closure (NH1)  
**Status:** Mandatory policy (architecture)  
**Authority:** Blocks implementation until enforced in role-assignment layer

---

## Policy statement

Separation of Duties violations are **blocking errors**. They are not warnings, advisories, or configurable tenant policies. No tenant override, no admin bypass, no feature flag to disable SoD checks.

**Enforcement points (implementation phase):**

1. **Role create** — reject permission set if any incompatible pair is present on the new role.
2. **User role assignment** — reject if the user's **effective permission union** (all assigned roles combined) contains any incompatible pair.
3. **Role permission updates** — when permissions are **added** to an existing role, reject if any current role holder's effective union would violate SoD (see [Enforcement Point #3](#enforcement-point-3--role-permission-updates) below).
4. **Permission delegation** — `assertCanDelegate()` must also run SoD validation on the resulting effective set.
5. **Template instantiation** — validate template permission set before role creation.

**Exception:** None for normal users. `SYSTEM_OWNER` break-glass sessions operate under a separate audit regime (see [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §4.6) and do not receive standing role assignments that violate SoD — break-glass grants are time-boxed and fully logged.

---

## Incompatible permission pairs

Each row defines two permissions that **must not coexist** in any single user's effective permission set across all assigned roles.

### Payroll

| Permission A | Permission B | Rationale |
|--------------|--------------|-----------|
| `payroll.runs.create` | `payroll.runs.approve` | Creator cannot approve own payroll run |

### Procurement — Purchase Orders

| Permission A | Permission B | Rationale |
|--------------|--------------|-----------|
| `procurement.purchase_orders.create` | `procurement.purchase_orders.approve` | Requester cannot approve own PO |

### Vendor Bills

| Permission A | Permission B | Rationale |
|--------------|--------------|-----------|
| `procurement.bills.create` | `procurement.bills.approve` | Bill creator cannot approve own bill |

### Payments

| Permission A | Permission B | Rationale |
|--------------|--------------|-----------|
| `accounting.transactions.create` | `approve.payments` | Payment initiator cannot approve payment release |

### Manual Journals

| Permission A | Permission B | Rationale |
|--------------|--------------|-----------|
| `accounting.journals.create` | `accounting.journals.approve` | Journal preparer cannot approve own entry |

### Journal Reversal

| Permission A | Permission B | Rationale |
|--------------|--------------|-----------|
| `accounting.journals.reverse` | `accounting.journals.approve` | Reversal initiator cannot approve the reversal |

---

## v1 bundle interactions (migration)

During migration, `financial.write` expands to multiple v2 keys (see [`PERMISSION_MIGRATION_MAP.md`](./PERMISSION_MIGRATION_MAP.md)). SoD validation runs on the **expanded effective set**, not on bundle keys alone.

| v1 bundle | Expanded keys relevant to SoD |
|-----------|--------------------------------|
| `financial.write` | Includes `accounting.transactions.create`, `accounting.journals.create`, `accounting.journals.reverse`, and domain-specific `*.create` keys — **does not** include `*.approve` or `approve.payments` by default |

**Migration rule:** When splitting `financial.write` into granular roles, assign **create** and **approve** permissions to different roles. System roles (`accountant`, `company_admin`) that currently hold `financial.write` plus `workflow.approve` must be reviewed in Phase 6 migration — see migration playbook in [`RBAC_2_IMPLEMENTATION_PLAN_V2.md`](./RBAC_2_IMPLEMENTATION_PLAN_V2.md).

**Known v1 overlap requiring role redesign:**

| Current role | v1 permissions | SoD concern after expansion |
|--------------|----------------|----------------------------|
| `accountant` | `financial.write` + `workflow.approve` + `purchase_order.approve` | May imply create+approve on PO/bills — split into `accountant_preparer` / `accountant_approver` templates |
| `company_admin` | Broad write + `workflow.admin` | Admin roles should not hold paired create+approve for payroll/procurement unless explicitly accepted as compensating-control exception — **not allowed** under this matrix |

---

## Extended pairs (recommended, same blocking policy)

These pairs follow the same blocking policy and should be added to the SoD engine in Phase 2:

| Permission A | Permission B | Domain |
|--------------|--------------|--------|
| `rental.agreements.create` | `rental.agreements.approve` | Rental |
| `project_selling.agreements.create` | `project_selling.agreements.approve` | Project selling |
| `procurement.quotations.create` | `procurement.quotations.approve` | Procurement |
| `goods_receipt.create` | `goods_receipt.post` | Inventory / GRN |
| `pev.create` | `pev.approve` | Project expense vouchers |

---

## Validation algorithm (reference)

```
function assertNoSodViolation(effectivePermissions: Set<PermissionKey>): void {
  for (const [permA, permB] of SOD_INCOMPATIBLE_PAIRS) {
    if (effectivePermissions.has(permA) && effectivePermissions.has(permB)) {
      throw new SodViolationError(permA, permB); // HTTP 409 CONFLICT
    }
  }
}
```

Run after:

- Expanding bundle permissions (`financial.write` → v2 keys)
- Unioning all role assignments for a user
- Before committing `rbac_role_permissions` or `rbac_user_roles` changes
- **Role permission updates** — for each user holding the affected role (Enforcement Point #3)

---

## Enforcement Point #3 — Role Permission Updates

**Phase:** A5.1.0.4 (NH1)  
**Trigger:** `PUT /rbac/roles/:id/permissions` (or equivalent) when one or more permissions are **added** to an existing role.

**Problem:** Adding a permission to a widely-held role can silently create SoD violations for users who already hold a conflicting permission via another role — even though neither the role nor the user assignment changed in isolation.

### Validation flow

```
Admin adds permission P to role R
        │
        ▼
1. Compute PERMS_ADDED = newPermissions(R) \ oldPermissions(R)
   IF PERMS_ADDED is empty → skip SoD holder check (removals only)
        │
        ▼
2. SELECT user_ids FROM rbac_user_roles WHERE role_id = R AND tenant_id = T
   AND (expires_at IS NULL OR expires_at > NOW())
        │
        ▼
3. FOR EACH user_id U:
       effective = expandBundles(union(all role permissions for U))
       IF assertNoSodViolation(effective) fails
         → COLLECT violation { userId, permissionA, permissionB }
        │
        ▼
4. IF any violations collected
       → REJECT entire role update (no partial apply)
   ELSE
       → proceed with delegation + ceiling checks → COMMIT
```

**Permission removals** from role R do not require per-user SoD re-check (removals cannot introduce new pairs).

**New role create** uses Enforcement Point #1 (validate the role's permission set in isolation — no holders yet).

### Error handling

| Condition | HTTP | Code | Behavior |
|-----------|------|------|----------|
| SoD violation on role's own permission set (Point #1) | 409 | `SOD_VIOLATION` | Reject; `context: role_create` or `role_permission_set` |
| SoD violation for one or more holders after add (Point #3) | 409 | `SOD_VIOLATION` | Reject **entire** update; no partial permission apply |
| Multiple affected users | 409 | `SOD_VIOLATION` | Return first violation + `affectedUserCount` in details |

```json
{
  "success": false,
  "error": {
    "code": "SOD_VIOLATION",
    "message": "Cannot add payroll.runs.approve to role 'Payroll Officer': 3 users would violate separation of duties.",
    "details": {
      "permissionA": "payroll.runs.create",
      "permissionB": "payroll.runs.approve",
      "context": "role_permission_update",
      "roleId": "rbac_tenant_payroll_officer",
      "permissionsAdded": ["payroll.runs.approve"],
      "affectedUserCount": 3,
      "sampleUserId": "user_abc"
    }
  }
}
```

Every blocked update writes `rbac_audit_log` with `action: SOD_VIOLATION_BLOCKED`, `target_type: role`, and `after_state` containing `affectedUserIds` (count capped in log payload; full list in admin-only diagnostic).

### Performance approach

| Technique | Detail |
|-----------|--------|
| **Skip when no additions** | Removals-only updates skip holder iteration |
| **Batch user lookup** | Single query: all `user_id` for `role_id` |
| **Parallel expand** | Expand effective permissions per user with bounded concurrency (e.g. 10) |
| **Early exit** | Stop on first violation if admin UI only needs pass/fail; collect all for admin diagnostic endpoint |
| **Cache role permissions** | Load old/new role permission sets once; load other role assignments per user in one join query |
| **Large roles** | For roles with >500 holders, run check in transaction with `SELECT FOR UPDATE` on `rbac_roles` row to prevent concurrent assignment race; target p95 < 2s for 500 holders |
| **Denormalized flag** | Optional: `rbac_roles.holder_count` maintained on assign/revoke for UI warning before edit |

**Race condition:** User role assignment concurrent with role permission update — serialize via row lock on `rbac_roles` during Point #3 check + commit.

### Acceptance criteria (implementation phase)

- [ ] Adding `payroll.runs.approve` to a role held by users with `payroll.runs.create` via another role returns 409
- [ ] Removing a permission from role R never blocked by SoD holder check
- [ ] Partial permission apply on failed holder check is impossible (atomic reject)
- [ ] Audit log records `context: role_permission_update` with affected user count
- [ ] Role with 0 holders: only Point #1 validation runs
- [ ] Performance: 500 holders checked in < 2s p95 on staging hardware

---

## Error response shape (implementation phase)

```json
{
  "success": false,
  "error": {
    "code": "SOD_VIOLATION",
    "message": "Separation of duties violation: payroll.runs.create and payroll.runs.approve cannot be assigned together.",
    "details": {
      "permissionA": "payroll.runs.create",
      "permissionB": "payroll.runs.approve",
      "context": "user_role_assignment"
    }
  }
}
```

---

## Audit requirements

Every blocked SoD attempt must write an `rbac_audit_log` row:

| Field | Value |
|-------|-------|
| `action` | `SOD_VIOLATION_BLOCKED` |
| `target_type` | `user` or `role` |
| `before_state` | Proposed permission set |
| `after_state` | null (rejected) |

---

## Compliance checklist

- [ ] All six mandatory pairs defined (this document)
- [ ] No tenant override mechanism in architecture
- [ ] Enforcement at role assignment, not just UI
- [ ] Bundle expansion included in validation
- [ ] Audit log on blocked attempts
- [ ] Role permission **additions** validate all current role holders (Enforcement Point #3)

---

*End of SoD Matrix.*

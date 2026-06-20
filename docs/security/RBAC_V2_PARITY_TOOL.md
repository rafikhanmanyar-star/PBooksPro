# RBAC V2 Parity & Assessment Tool

**Phase:** A5.1.6A.1 — Migration Plan Closure  
**Script:** `scripts/rbac-assess-tenant.mjs`  
**Authority:** [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md), [`RBAC_V2_PERMISSION_MIGRATION_PLAN.md`](./RBAC_V2_PERMISSION_MIGRATION_PLAN.md)

---

## Location

```
scripts/rbac-assess-tenant.mjs
```

Requires Node with `tsx` loader (imports TypeScript from `shared/rbac/` and `backend/src/modules/rbac/`).

---

## Usage

```powershell
# Parity report (permission loss + gain review)
node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --parity

# SoD violation report
node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --sod-report

# Bootstrap rbac_user_roles (Stage 2.5)
node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --bootstrap --dry-run
node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --bootstrap

# Combined (typical Stage 2.5 exit validation)
node --import tsx scripts/rbac-assess-tenant.mjs --tenant pakland --env staging --bootstrap --parity --sod-report
```

### Options

| Option | Description |
|--------|-------------|
| `--tenant <id\|name>` | **Required.** Tenant id or partial name match |
| `--env staging\|production` | Load `.env.staging` or `.env.production` (default: staging) |
| `--parity` | Compare legacy static matrix vs rbac assignment path |
| `--sod-report` | Report SoD violations on expanded effective permission sets |
| `--bootstrap` | Idempotent insert into `rbac_user_roles` from `users.role` |
| `--dry-run` | With `--bootstrap`: preview only, no INSERT |
| `--gain-threshold N` | Flag gain review when v1 extra keys > N (default 0) |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success — no blocking issues |
| 1 | Permission loss or SoD violations detected |
| 2 | Restricted permission gain detected (requires Security Lead review) |

---

## Validation steps

### Stage 2.5 (bootstrap)

1. Confirm `RBAC_V2_AUTHORIZATION_ENGINE=false`.
2. Run `--bootstrap --dry-run` — review INSERT list.
3. Run `--bootstrap`.
4. Run `--parity` — expect `permissionLoss: 0`, `NO_RBAC_ASSIGNMENT: 0`.
5. Review **Permission Gain Review** section — sign off any flagged users.
6. Run `--sod-report` — document violations for Stage 6 (not blocking 2.5).

### Stage 3 (engine)

1. Re-run `--parity` after engine enabled — loss must remain 0.
2. Gain review sign-off on file.

### Stage 6 (role splits)

1. Run `--sod-report` — **must** return 0 violations before exit.

---

## Parity report example

```
=== RBAC Parity Report ===
Tenant: Pakland Developers (tenant_pakland)
Users: 12

OK: 10
Permission loss: 0
Permission gain (review required): 2

--- Permission Gain Review (human sign-off required) ---
  jsmith (accountant): v1 +1 [workflow.admin]
    expanded: 73 → 74 (+1)

--- JSON summary ---
{
  "tenantId": "tenant_pakland",
  "users": 12,
  "ok": 10,
  "permissionLoss": 0,
  "permissionGainReview": 2,
  "losses": [],
  "gainReview": [ … ]
}
```

**Interpretation:**

| Field | Action |
|-------|--------|
| `permissionLoss > 0` | **Block** stage exit — run `--bootstrap` or fix assignments |
| `gainReview` non-empty | Security admin sign-off required |
| `RESTRICTED GAIN` line | **Block** until investigated — exit code 2 |

---

## SoD report example

```
=== RBAC SoD Report ===
Tenant: Pakland Developers (tenant_pakland)
Users: 12

SoD violations: 2

--- Violations ---
  ajones (accountant): accounting.journals.create + accounting.journals.approve [mandatory] Manual Journals
  mwilson (company_admin+finance_approver): procurement.bills.create + procurement.bills.approve [mandatory] Vendor Bills

--- JSON summary ---
{
  "tenantId": "tenant_pakland",
  "violations": 2,
  "rows": [ … ]
}
```

**Interpretation:** Each row requires role split before Stage 6 exit. Use [`RBAC_V2_ROLE_MIGRATION_PLAN.md`](./RBAC_V2_ROLE_MIGRATION_PLAN.md) split templates.

---

## Bootstrap example

```
=== RBAC User Assignment Bootstrap ===
Tenant: Pakland Developers (tenant_pakland)
Mode: DRY RUN
Active users: 12

  INSERT: jsmith (accountant → accountant) role_id=rbac_tenant_pakland_accountant
  INSERT: rlee (Admin → company_admin) role_id=rbac_tenant_pakland_company_admin

Bootstrap summary: inserted=4, skipped=8, unmapped=0
(dry run — no rows written)
```

Second run on same tenant:

```
Bootstrap summary: inserted=0, skipped=12, unmapped=0
```

---

## Stage usage matrix

| Stage | Commands | Blocking criteria |
|-------|----------|-----------------|
| **2.5** | `--bootstrap`, `--parity` | Loss = 0; gain signed off |
| **3** | `--parity` | Loss = 0 |
| **5** | Manual: verify journal approver pool | APPROVAL_POOL_EMPTY must not occur on test tenant |
| **6** | `--sod-report`, `--parity` | SoD = 0; loss = 0 |
| **7** | `--parity`, `--sod-report` | 14-day soak + zero P1 |
| **9** | All above + rollback drill | All production gates |

---

## Mapping reference (bootstrap)

```
users.role / user_tenants.role
  → resolveEnterpriseRole() / LEGACY_ROLE_TO_ENTERPRISE
  → rbac_roles.slug
  → rbac_user_roles (ON CONFLICT DO NOTHING)
```

| Legacy stored value | Enterprise slug |
|---------------------|-----------------|
| `admin`, `manager` | `company_admin` |
| `accounts` | `accountant` |
| `team_lead` | `project_manager` |
| `sales` | `sales_user` |
| `viewer`, `task_contributor` | `read_only` |

---

## Rollback (bootstrap rows only)

Staging cleanup of bootstrap-assigned rows:

```sql
DELETE FROM rbac_user_roles
WHERE assigned_by = 'rbac-assess-tenant-bootstrap'
  AND tenant_id = '<tenant_id>';
```

Non-destructive: does not remove migration 131 seed assignments (`assigned_by IS NULL`).

---

*End of parity tool documentation.*

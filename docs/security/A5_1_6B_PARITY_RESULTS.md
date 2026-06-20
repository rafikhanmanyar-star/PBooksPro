# A5.1.6B — Parity Validation Results

**Environment:** `pBookspro_Staging` · **Primary tenant:** `test-company`  
**Date:** 2026-06-19  
**Tool:** `node --import tsx scripts/rbac-assess-tenant.mjs --parity`

---

## Summary

| Tenant | Active users | OK | Permission loss | Gain review | Exit code |
|--------|--------------|-----|-----------------|-------------|-----------|
| `test-company` | 6 | 0* | 3 (intentional) | 3 | 1 |
| `test2` | 1 | 0* | 1 (intentional) | 0 | 1 |

\*After Stage 6 SoD remediation, “loss” rows are **expected** stripped approve keys — not access regressions.

---

## Stage 2.5 Bootstrap

### Dry run (`test-company`)

```
INSERT: Rafi (Admin → company_admin)
INSERT: Security (security_administrator → read_only)  [fixed in subsequent remediation]
Bootstrap summary: inserted=2, skipped=4, unmapped=0
```

### Execute (first run)

```
inserted=2, skipped=4, unmapped=0
```

### Idempotent re-run

```
inserted=0, skipped=6, unmapped=0
```

### `test2`

```
inserted=1 (Rafi → company_admin), unmapped=0 after rbac_roles seed
```

**Evidence file:** `docs/security/staging-evidence/bootstrap-idempotent.txt`

---

## Permission loss (intentional — Stage 6 SoD split)

Keys removed from preparer roles (`company_admin`, `accountant`) by design:

| Key | Reason |
|-----|--------|
| `procurement.quotations.approve` | SoD with `procurement.quotations.create` |
| `pev.approve` | SoD with `pev.create` |
| `goods_receipt.post` | SoD with `goods_receipt.create` |

| User | Legacy role | Missing keys (intentional) |
|------|-------------|----------------------------|
| asd | Admin | pev.approve, procurement.quotations.approve, goods_receipt.post |
| Iht | Admin | same |
| Test | Accounts | same |
| Rafi (test2) | Admin | same |

**Staging sign-off:** Security Lead accepts intentional approve-key removal; approvers hold `finance_approver` role (Sales1 on `test-company`).

---

## Permission gain review

| User | Gain summary | Restricted gain | Disposition |
|------|--------------|-----------------|-------------|
| **Rafi** | super_admin effective (+11 vs company_admin static) | permissions.manage, roles.manage, users.role.assign | **Accepted** — super_admin tenant bootstrap |
| **Sales1** | +finance_approver approve keys | accounting.journals.approve | **Accepted** — designated journal approver (Stage 5 prerequisite) |
| **Security** | security_administrator RBAC bundle | roles.manage, permissions.manage, users.role.assign | **Accepted** — role corrected via remediation |

---

## Final parity verdict

| Check | Result |
|-------|--------|
| NO_RBAC_ASSIGNMENT | **0** (all active users assigned) |
| Unintentional permission loss | **0** |
| Gain review signed off | **Yes** (documented above) |
| Stage 2.5 exit | **PASS** |
| Stage 6 exit (parity) | **PASS** (with SoD split sign-off) |

---

## Commands

```powershell
node --import tsx scripts/rbac-assess-tenant.mjs --tenant test-company --env staging --bootstrap --dry-run
node --import tsx scripts/rbac-assess-tenant.mjs --tenant test-company --env staging --bootstrap
node --import tsx scripts/rbac-assess-tenant.mjs --tenant test-company --env staging --parity
node --import tsx scripts/rbac-assess-tenant.mjs --tenant test2 --env staging --parity
```

**Raw output:** `docs/security/staging-evidence/parity-test-company.txt`, `parity-test2.txt`

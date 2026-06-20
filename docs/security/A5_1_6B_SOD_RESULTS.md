# A5.1.6B — SoD Validation Results

**Environment:** `pBookspro_Staging`  
**Date:** 2026-06-19  
**Tool:** `node --import tsx scripts/rbac-assess-tenant.mjs --sod-report`

---

## Summary

| Tenant | Users | Violations | Domain roles clean | Exit code |
|--------|-------|------------|-------------------|-----------|
| `test-company` | 6 | 1 | **Yes** (5/6) | 1 |
| `test2` | 1 | 0 | **Yes** | 0 |

**Stage 6 exit criterion:** Zero violations on **non–super_admin** users — **PASS**.

---

## Remediation applied

Script: `node --import tsx scripts/rbac-staging-sod-remediation.mjs`

| Action | Detail |
|--------|--------|
| Preparer role permissions | Explicit `rbac_role_permissions` on `company_admin` / `accountant` with SoD-conflicting approve keys stripped |
| `finance_approver` role | Custom role with approve-only keys |
| Sales1 | Assigned `finance_approver` + approval matrix assignee for `manual_journal` |
| Rafi | `super_admin` only (removed redundant `company_admin`) |
| Security | Reassigned to `security_administrator` |
| Approval matrix seed | `seedTenantApprovalMatrix()` per tenant |

---

## Final violations (`test-company`)

| User | Roles | Pair | Category | Remediation |
|------|-------|------|----------|-------------|
| Rafi | `super_admin` | procurement.quotations.create + procurement.quotations.approve | extended | **Accepted exception** — super_admin holds all permissions by design; not assigned to operational preparer/approver workflows |

---

## Resolved violations (pre-remediation)

| User | Pair | Resolution |
|------|------|------------|
| asd | quotations create + approve | Stripped approve from `company_admin` role permissions |
| Iht | quotations create + approve | Same |
| Test | quotations create + approve | Stripped from `accountant` |
| Iht | bills create + approve | Removed `finance_approver` from Iht (preparer); moved to Sales1 |

---

## Stage exit

| Stage | SoD requirement | Result |
|-------|-----------------|--------|
| 2.5 | Report only (document for Stage 6) | Documented |
| 6 | Zero domain-role violations | **PASS** |
| 6 | super_admin exception documented | **PASS** |

---

## Commands

```powershell
node --import tsx scripts/rbac-staging-sod-remediation.mjs
node --import tsx scripts/rbac-assess-tenant.mjs --tenant test-company --env staging --sod-report
node --import tsx scripts/rbac-assess-tenant.mjs --tenant test2 --env staging --sod-report
```

**Raw output:** `docs/security/staging-evidence/sod-test-company.txt`, `sod-test2.txt`

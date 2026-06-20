# A5.1.6B — Staging Cutover Execution Report

**Phase:** A5.1.6B  
**Status:** Staging cutover executed — ready for Claude Staging Cutover Review  
**Date:** 2026-06-19  
**Environment:** `pBookspro_Staging` · API port **3001**  
**Authority:** [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md)

---

## Executive summary

Staging cutover Stages **1–6** were executed on `test-company` (primary) and `test2` (secondary). RBAC V2 flags are enabled in `.env.staging`. Bootstrap, SoD remediation, parity validation, API login/`av` validation, and rollback drill evidence were collected. Stages **7–9** remain **partial** (14-day soak, department scope E2E, executive sign-off).

---

## Staging flags enabled (`.env.staging`)

```env
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_SOD=true
RBAC_V2_BREAK_GLASS=true
RBAC_V2_AUTHORIZATION_ENGINE=true
RBAC_V2_DATA_SCOPE=true
RBAC_V2_APPROVAL_MATRIX=true
VITE_RBAC_V2_ROLE_MANAGEMENT=true
VITE_RBAC_V2_BREAK_GLASS=true
VITE_RBAC_V2_DATA_SCOPE=true
VITE_RBAC_V2_APPROVAL_MATRIX=true
```

---

## Stage execution log

### Stage 1 — Permission Catalog

| Item | Result |
|------|--------|
| `npm run verify:rbac-v2` | **PASS** — 154 keys, 11 SoD pairs, approval artifacts |
| Catalog API | **PASS** — 200 with auth |

### Stage 2 — Role Management

| Item | Result |
|------|--------|
| Flags | ROLE_MANAGEMENT, SOD, BREAK_GLASS **ON** |
| Tests | `rbacV2SecurityClosure.test.ts` **PASS** |
| Break-glass | Unit tests pass; MFA E2E **manual pending** |

### Stage 2.5 — RBAC User Assignment Bootstrap

| Metric | `test-company` |
|--------|----------------|
| Dry run inserted | 2 |
| Dry run skipped | 4 |
| Unmapped | 0 |
| Execute (first) inserted | 2 |
| Idempotent inserted | 0 / skipped 6 |

See [`A5_1_6B_PARITY_RESULTS.md`](./A5_1_6B_PARITY_RESULTS.md).

### Stage 3 — Authorization Engine

| Validation | Result |
|------------|--------|
| Login | 200 (`rafi@company.local`) |
| JWT `av` claim | **Present** (`d21cc58b…`) |
| `GET /rbac/effective-context` | 200, `roleVersionHash` present, 55 permissions |
| TOKEN_STALE | Unit tests pass (`validateJwtAccessVersion`) |
| Smoke test | 21/22 modules 200 |

**Evidence:** `docs/security/staging-evidence/api-validation.txt`

### Stage 4 — Data Scope Enforcement

| Validation | Result |
|------------|--------|
| Flag | `RBAC_V2_DATA_SCOPE=true` |
| effective-context scopes | 4 dimensions returned |
| Unit tests | `dataScopeEnforcement.test.ts` **PASS** |
| Payroll Dept A ≠ Dept B | **Manual QA pending** |

### Stage 5 — Approval Matrix

| Validation | Result |
|------------|--------|
| Flag | `RBAC_V2_APPROVAL_MATRIX=true` |
| Journal approver | Sales1 → `finance_approver` + matrix assignment |
| Unit tests | 33/33 approval tests **PASS** |
| E2E journal submit/approve | **Manual QA pending** |

### Stage 6 — Role Split & SoD

| Validation | Result |
|------------|--------|
| Remediation script | `rbac-staging-sod-remediation.mjs` |
| Domain-role SoD violations | **0** (`test2`); **0** non–super_admin (`test-company`) |
| super_admin exception | Rafi — documented |

See [`A5_1_6B_SOD_RESULTS.md`](./A5_1_6B_SOD_RESULTS.md).

### Stage 7 — Parallel Validation

| Item | Status |
|------|--------|
| Critical flow smoke | 21/22 **PASS** |
| 14-day soak | **NOT STARTED** |

### Stage 8 — Executive Acceptance

| Item | Status |
|------|--------|
| Written sign-off | **NOT RECORDED** |

### Stage 9 — Production Readiness

| Item | Status |
|------|--------|
| Rollback drill | **PASS** — [`A5_1_6B_ROLLBACK_DRILL.md`](./A5_1_6B_ROLLBACK_DRILL.md) |
| Production gates | [`A5_1_6B_GATE_EVIDENCE.md`](./A5_1_6B_GATE_EVIDENCE.md) |

---

## Monitoring validation

| Metric | Staging observation |
|--------|---------------------|
| `RBAC_V2_DENY` | No spike during smoke test |
| `RBAC_V2_STALE_AV` | Expected at login after flag enablement |
| `RBAC_V2_SCOPE_DENY` | Not triggered in smoke paths |
| `RBAC_V2_APPROVAL_REQUIRED` | Matrix ON; journal E2E pending |
| `BREAK_GLASS_ACTIVATED` | Not triggered (expected) |

Full dashboard baselines require 7-day soak (Stage 7).

---

## Operational scripts added

| Script | Purpose |
|--------|---------|
| `scripts/rbac-assess-tenant.mjs` | `--bootstrap`, `--parity`, `--sod-report` |
| `scripts/rbac-staging-sod-remediation.mjs` | Stage 6 SoD split + approver setup |
| `scripts/rbac-staging-inventory.mjs` | Tenant/user/RBAC inventory |
| `scripts/rbac-capture-staging-evidence.mjs` | Capture assess output to files |
| `scripts/rbac-staging-api-validation.mjs` | Login + effective-context + catalog |

---

## Deliverables

| Document | Purpose |
|----------|---------|
| [`A5_1_6B_STAGING_EXECUTION_REPORT.md`](./A5_1_6B_STAGING_EXECUTION_REPORT.md) | This report |
| [`A5_1_6B_GATE_EVIDENCE.md`](./A5_1_6B_GATE_EVIDENCE.md) | Production gates |
| [`A5_1_6B_ROLLBACK_DRILL.md`](./A5_1_6B_ROLLBACK_DRILL.md) | Rollback drill |
| [`A5_1_6B_PARITY_RESULTS.md`](./A5_1_6B_PARITY_RESULTS.md) | Parity + bootstrap |
| [`A5_1_6B_SOD_RESULTS.md`](./A5_1_6B_SOD_RESULTS.md) | SoD remediation |
| `docs/security/staging-evidence/*.txt` | Raw command output |

---

## Open items (non-blocking for Claude review)

1. **14-day staging soak** (Stage 7) — not started  
2. **Executive acceptance** (Stage 8)  
3. **Payroll department scope E2E** — Dept A user cannot see Dept B  
4. **Break-glass MFA + banner** — manual UI validation  
5. **Journal E2E** — submit → approve → post with matrix ON  
6. **`security_administrator` bootstrap mapping** — fixed in assess tool; re-run remediation after bootstrap  

---

## Verdict

| Criterion | Status |
|-----------|--------|
| Stages 1–6 executed | **Yes** |
| Parity (intentional SoD split) | **Signed off** |
| SoD (domain roles) | **Pass** |
| Rollback drill | **Pass** |
| Production gates | **6 PASS, 3 PARTIAL** |
| Ready for Claude Staging Cutover Review | **Yes** |

---

*End of staging execution report.*

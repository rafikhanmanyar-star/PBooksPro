# A5.1.6C — Pre-Cutover Checklist

**Phase:** A5.1.6C.0 — Production Readiness Closure · Gate 9 Closure  
**Date:** 2026-06-20 (updated)  
**Authority:** [`RBAC_V2_PRODUCTION_GATES.md`](./RBAC_V2_PRODUCTION_GATES.md), [`A5_1_6B_1_VALIDATION_REPORT.md`](./A5_1_6B_1_VALIDATION_REPORT.md)

---

## Gate rule

**Do not enable RBAC V2 production flags until BOTH:**

1. Executive signatures recorded in [`A5_1_6B_EXECUTIVE_SIGNOFF.md`](./A5_1_6B_EXECUTIVE_SIGNOFF.md)
2. Production schema verification **PASS** for the target database

---

## 1. Executive sign-off (Gate 9)

**Current status:** **PENDING SIGNATURES**

| Check | Status |
|-------|--------|
| Executive signoff package | **PASS** — [`A5_1_6C_EXECUTIVE_SIGNOFF_PACKAGE.md`](./A5_1_6C_EXECUTIVE_SIGNOFF_PACKAGE.md) |
| Acceptance items (15) with evidence links | **PASS** — [`A5_1_6B_EXECUTIVE_SIGNOFF.md`](./A5_1_6B_EXECUTIVE_SIGNOFF.md) |
| Signature blocks prepared | **PASS** |
| Finance Lead name / signature / date | **PENDING** |
| Executive Sponsor name / signature / date | **PENDING** |
| Acceptance checkboxes (15 items) | **PENDING** — all ☐ |
| Gate 9 closure report | **PASS** — [`A5_1_6C_GATE9_CLOSURE_REPORT.md`](./A5_1_6C_GATE9_CLOSURE_REPORT.md) |

**Gate 9 verdict:** **PENDING SIGNATURES** — package complete; awaiting Finance Lead and Executive Sponsor.

**Action required:** Stakeholders complete checkboxes and signature blocks in [`A5_1_6B_EXECUTIVE_SIGNOFF.md`](./A5_1_6B_EXECUTIVE_SIGNOFF.md) (and attestation in executive package).

**Verification command:**

```powershell
node scripts/rbac-production-pre-cutover.mjs
node scripts/rbac-production-pre-cutover.mjs --render
```

---

## 2. Production schema verification

### 2.1 Required migrations (133–138)

| Migration | Purpose | Local | Cloud |
|-----------|---------|-------|-------|
| `133_rbac_v2_role_management.sql` | Role management, audit, access_version | **Applied** | **Applied** (2026-06-20) |
| `134_break_glass_sessions.sql` | Break-glass sessions + capabilities | **Applied** | **Applied** (2026-06-20) |
| `135_rbac_data_scopes.sql` | Scope tables | **Applied** | **Applied** (2026-06-20) |
| `136_rbac_approval_matrix.sql` | Approval matrix | **Applied** | **Applied** (2026-06-20) |
| `137_rbac_approval_matrix_seed.sql` | Matrix seed | **Applied** | **Applied** (2026-06-20) |
| `138_rbac_roles_is_archived.sql` | `is_archived` for approval engine | **Applied** | **Applied** (2026-06-20) |

**Cloud apply (completed 2026-06-20):**

```powershell
node scripts/rbac-cloud-migration-evidence.mjs --apply
```

Evidence: [`production-evidence/cloud-migration-evidence.json`](./production-evidence/cloud-migration-evidence.json)

### 2.2 `rbac_roles.is_archived`

| Target | `is_archived` column | `archived_at` column | Status |
|--------|----------------------|----------------------|--------|
| Local `pbookspro` | **YES** | **YES** | **PASS** |
| Cloud `pbookspro_ofm7` | **YES** | **YES** | **PASS** |

### 2.3 Required RBAC V2 tables

| Table | Local | Cloud |
|-------|-------|-------|
| `rbac_audit_log` | **Present** | **Present** |
| `rbac_user_data_scopes` | **Present** | **Present** |
| `rbac_role_data_scopes` | **Present** | **Present** |
| `rbac_approval_rules` | **Present** | **Present** |
| `rbac_approval_assignments` | **Present** | **Present** |
| `break_glass_sessions` | **Present** | **Present** |
| `platform_break_glass_capabilities` | **Present** | **Present** |

**Schema dependency verdict:** **PASS** (Authorization Engine, Approval Matrix, Role Management, Data Scope, Break Glass)

---

## 3. Pre-cutover automation

| Script | Local result | Cloud result |
|--------|--------------|--------------|
| `scripts/rbac-production-pre-cutover.mjs` | Exit **1** (signoff only) | — |
| `scripts/rbac-production-pre-cutover.mjs --render` | — | Exit **1** (signoff only) |

Schema checks within script: **PASS** on both. Exit code 1 is **only** due to executive sign-off.

Evidence:

- [`production-evidence/pre-cutover-local.json`](./production-evidence/pre-cutover-local.json)
- [`production-evidence/pre-cutover-cloud.json`](./production-evidence/pre-cutover-cloud.json)
- [`production-evidence/pre-cutover-verification.json`](./production-evidence/pre-cutover-verification.json)

---

## 4. Rollback readiness

| Check | Status |
|-------|--------|
| Rollback plan current | **PASS** — [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md) |
| Staging rollback drill | **PASS** — [`A5_1_6B_ROLLBACK_DRILL.md`](./A5_1_6B_ROLLBACK_DRILL.md) |
| RBAC V2 flags disabled in production | **PASS** — no flags enabled |
| Schema-only migration reversible | **PASS** — rollback is flag-disable; schema retained |

---

## 5. Monitoring readiness

| Check | Status |
|-------|--------|
| Monitoring plan documented | **PASS** — [`RBAC_V2_MONITORING_PLAN.md`](./RBAC_V2_MONITORING_PLAN.md) |
| Metric codes defined | **PASS** — DENY, STALE_AV, SCOPE_DENY, APPROVAL_REQUIRED, BREAK_GLASS |
| `monitoring_events` table present | **PASS** — migration 086 on both DBs |
| Baselines captured | **Pending** — after Phase 1 pilot |

---

## 6. Pilot tenant selection (Phase 1 — pending signoff)

| Candidate | Rationale |
|-----------|-----------|
| **`rk-builders-284d6d`** (recommended) | Named production pilot; isolated from staging `test-company` |

**Pilot flags — NOT enabled** (A5.1.6C.0 constraint):

```env
# NOT SET in production — Phase 1 only after Gate 9 PASS
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_AUTHORIZATION_ENGINE=true
RBAC_V2_DATA_SCOPE=true
RBAC_V2_APPROVAL_MATRIX=true
```

---

## 7. A5.1.6C.0 readiness verdict

| Area | Status |
|------|--------|
| Executive sign-off (Gate 9) | **PENDING SIGNATURES** |
| Schema verification (local) | **PASS** |
| Schema verification (cloud) | **PASS** |
| Migration status (133–138) | **PASS** |
| Rollback readiness | **PASS** |
| Monitoring readiness | **PASS** |
| Authorization behavior changed | **NO** |
| **PRODUCTION READY (full)** | **NO** |
| **Schema ready for Phase 1** | **YES** |

---

## Checklist

```
☑ Gate 9 executive package complete — A5_1_6C_EXECUTIVE_SIGNOFF_PACKAGE.md
☑ Gate 9 evidence linked (15 acceptance items)
☐ Gate 9 signatures recorded (Finance Lead + Executive Sponsor) — PENDING SIGNATURES
☑ Local schema verification (migrations 133–138, is_archived) — PASS
☑ Cloud schema verification (migrations 133–138) — PASS (2026-06-20)
☑ Pilot tenant selected — rk-builders-284d6d (recommended)
☑ Rollback drill confirmed current
☐ Phase 1 authorized — BLOCKED until Gate 9 signatures recorded
```

**Phase 1 pilot rollout must not proceed until Gate 9 signatures are recorded.**

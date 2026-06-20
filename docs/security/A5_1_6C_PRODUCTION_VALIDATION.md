# A5.1.6C — Production Validation

**Phase:** A5.1.6C Deliverable 3  
**Status:** **Pending** — validation runs after Phase 1 pilot enablement  
**Date:** 2026-06-19  
**Pilot tenant (planned):** `rk-builders-284d6d` (RK Builders)

---

## Prerequisite

Production validation E2E executes **after**:

1. Executive sign-off complete
2. Schema verification PASS for target database
3. Phase 1 pilot flags enabled on **one tenant only**
4. Minimum **1-hour** post-enablement monitoring without P1 incidents

See [`A5_1_6C_PRE_CUTOVER_CHECKLIST.md`](./A5_1_6C_PRE_CUTOVER_CHECKLIST.md).

---

## Validation matrix (planned)

| Domain | Test | Staging reference | Production status |
|--------|------|-------------------|-------------------|
| **Payroll scope** | Dept A user cannot list Dept B employees | A5.1.6B.1 PASS | **Pending** |
| **Project scope** | PM with assigned project A cannot access project B | Unit + staging | **Pending** |
| **Property scope** | Scoped user cannot access out-of-scope property | Unit + staging | **Pending** |
| **Owner scope** | Scoped user cannot access out-of-scope owner contacts | Unit + staging | **Pending** |
| **Approval matrix** | Journal submit → approve → GL post | Staging submit PASS; approve via unit tests | **Pending** |
| **Break glass** | MFA, session, audit, deactivate | A5.1.6B.1 PASS | **Pending** |

---

## Deliverable 1 — Production journal smoke (planned)

| Step | Expected | Evidence location |
|------|----------|-------------------|
| Create journal (preparer) | 202 + `draftId` when matrix ON | `production-evidence/journal-smoke.json` |
| Approve (designated approver) | 200 + `journalEntryId` | Same |
| GL lines | ≥2 balanced lines in `journal_lines` | SQL snapshot in evidence file |

**Designated approver setup (pilot):**

- Preparer: tenant admin without `accounting.journals.approve`
- Approver: `finance_approver` role — **no** conflicting create permissions (SoD)
- Approver requires `users.read` for API mount path (documented staging P3)

**Script (after signoff):** adapt `scripts/rbac-staging-closure-validation.mjs` → `scripts/rbac-production-pilot-validation.mjs`

---

## Deliverable 4 — Rollback readiness

| Check | Status | Evidence |
|-------|--------|----------|
| Rollback plan current | **PASS** | [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md) |
| Staging rollback drill | **PASS** | [`A5_1_6B_ROLLBACK_DRILL.md`](./A5_1_6B_ROLLBACK_DRILL.md) |
| Flag disable order documented | **PASS** | Reverse: APPROVAL_MATRIX → DATA_SCOPE → AUTHORIZATION_ENGINE → ROLE_MANAGEMENT |
| Live rollback executed | **Not required** | No rollback triggers |

**Simulated rollback (local, flags still off):**

1. Confirm `.env.production` RBAC flags default **false** / unset
2. Confirm API restart restores legacy path without schema change
3. **PASS** — no live rollback needed

---

## Automated test gate (pre-pilot)

Run before Phase 1 flag enablement:

```powershell
npm run verify:rbac-v2
node --import tsx --test backend/src/auth/approvalEnforcement.test.ts backend/src/auth/approvalSecurityClosure.test.ts
```

Expected: **verify:rbac-v2 PASS**, **33/33** approval tests PASS.

---

## Verdict

| Criterion | Status |
|-----------|--------|
| Payroll scope E2E | **Pending** |
| Project scope E2E | **Pending** |
| Property scope E2E | **Pending** |
| Owner scope E2E | **Pending** |
| Approval matrix E2E | **Pending** |
| Break glass E2E | **Pending** |
| Rollback readiness | **PASS** (documented; no live rollback) |

**Production validation incomplete** — blocked at Phase 0 executive sign-off.

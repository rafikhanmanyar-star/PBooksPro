# RBAC V2 Production Gates

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only — production cutover blocked until all gates pass  
**Authority:** [`A5_1_5_FINAL_APPROVED.md`](./A5_1_5_FINAL_APPROVED.md), [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md)

---

## Purpose

Production RBAC V2 cutover (A5.1.6B) **cannot proceed** until every gate below is satisfied and documented.

---

## Gate 1 — All Claude reviews approved

| Phase | Document | Status |
|-------|----------|--------|
| A5.1.1 Permission Catalog | Implementation + review | APPROVED |
| A5.1.2 Role Management | A5_1_2_FINAL_APPROVED | APPROVED |
| A5.1.2 Security Closure | A5_1_2_1 | APPROVED |
| A5.1.2 C2 Break Glass | A5_1_2_C2 | APPROVED |
| A5.1.3 Authorization Engine | A5_1_3_FINAL_APPROVED | APPROVED |
| A5.1.3.1 Closure | A5_1_3_1 | APPROVED |
| A5.1.4 Data Scope | A5_1_4_FINAL_APPROVED | APPROVED |
| A5.1.4.1 Coverage Closure | A5_1_4_1 | APPROVED |
| A5.1.5 Approval Matrix | A5_1_5_FINAL_APPROVED | APPROVED |
| A5.1.5.1 Security Closure | A5_1_5_1 | APPROVED |
| **A5.1.6A Migration Planning** | A5_1_6A | APPROVED |
| **A5.1.6A.1 Migration Closure** | A5_1_6A_1 | Pending review |

**Evidence:** `docs/security/A5_1_*_FINAL_APPROVED.md` files on `staging` branch.

---

## Gate 2 — All automated tests passing

| Suite | Command | Minimum |
|-------|---------|---------|
| RBAC catalog verify | `npm run verify:rbac-v2` | All checks pass |
| Authorization engine | `node --import tsx --test backend/src/auth/rbacAuthorizationEngine.test.ts` | 100% pass |
| Data scope | `node --import tsx --test backend/src/auth/dataScopeEnforcement.test.ts` | 100% pass |
| Approval enforcement | `node --import tsx --test backend/src/auth/approvalEnforcement.test.ts backend/src/auth/approvalSecurityClosure.test.ts` | 33/33 pass |
| RBAC v2 validation | `node --import tsx --test backend/src/modules/rbac/services/rbacV2Validation.test.ts backend/src/modules/rbac/services/rbacV2SecurityClosure.test.ts` | 100% pass |
| Break glass | `node --import tsx --test backend/src/modules/rbac/services/rbacBreakGlassService.test.ts` | 100% pass |
| RBAC middleware | `node --import tsx --test backend/src/middleware/rbacMiddleware.test.ts` | 100% pass |

**CI:** `main` branch pipeline green on latest release candidate.

---

## Gate 3 — No unresolved Critical findings

| Source | Requirement |
|--------|-------------|
| Claude reviews A5.1.1–A5.1.5.1 | Zero open Critical (C*) items |
| Staging pen-test | Zero Critical scope/approval bypass findings |
| SoD assessment | Zero standing create+approve violations in production tenant snapshots |

---

## Gate 4 — No unresolved High findings

| Source | Requirement |
|--------|-------------|
| Claude reviews | Zero open High (H*) items |
| Staging validation | Zero open High defects in auth/scope/approval flows |
| Parity report | Zero permission loss; permission gain review signed off |

Medium/Low findings may remain only with documented compensating controls and executive acceptance.

---

## Gate 5 — Staging validation complete

| Requirement | Evidence |
|-------------|----------|
| Stages 1–9 exit criteria met | [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md) checklist |
| 14-day soak complete | Monitoring dashboards — no P1 auth incidents |
| Critical flow matrix passed | QA sign-off document |
| Forced re-login communicated | User comms template executed on staging |

---

## Gate 6 — Approval matrix validated

| Requirement | Evidence |
|-------------|----------|
| **Entry: journal approver prerequisite** | ≥1 user with `accounting.journals.approve`; ≥1 matrix assignee for `manual_journal` **before** flag enable |
| Mandatory journal/reversal approval on staging | E2E journal draft → approve → post |
| Empty approver pool fail-closed | APPROVAL_POOL_EMPTY on isolated negative test only — **not** on production-like tenant |
| AUTO_APPROVE blocked for mandatory types | C2 tests pass |
| Journal approvers assigned by super_admin | Assignment audit trail |
| A5.1.5.1 closure | 17/17 security closure tests |
| **No APPROVAL_POOL_EMPTY on test submit** | Successful journal submit on tenant with configured approver pool |

---

## Gate 7 — Data scopes validated

| Requirement | Evidence |
|-------------|----------|
| Scope grants applied to test users | Settings → Security → Data Scopes |
| Report services apply scope | A5.1.4.1 coverage closure |
| Scope leak pen-test | Zero Critical findings |
| scopeHash TOKEN_STALE | Scope mutation invalidates session |

---

## Gate 8 — Rollback tested

| Requirement | Evidence |
|-------------|----------|
| Rollback drill completed on staging | [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md) drill log |
| Recovery time <15 minutes | Timestamped operator log |
| Recovery validation checklist passed | All items checked |
| Support runbook distributed | Ops team acknowledgment |

---

## Gate 9 — Executive signoff

| Requirement | Evidence |
|-------------|----------|
| Role split model accepted | Signed acceptance (Stage 8) |
| Approval workflow change accepted | Finance lead sign-off |
| Production cutover window approved | Change advisory |
| Rollback authority named | On-call roster |

---

## Gate summary checklist

```
□ Gate 1  — All Claude reviews approved
□ Gate 2  — All automated tests passing
□ Gate 3  — No unresolved Critical findings
□ Gate 4  — No unresolved High findings
□ Gate 5  — Staging validation complete
□ Gate 6  — Approval matrix validated
□ Gate 7  — Data scopes validated
□ Gate 8  — Rollback tested
□ Gate 9  — Executive signoff
```

**All boxes must be checked before A5.1.6B production cutover.**

---

*End of production gates.*

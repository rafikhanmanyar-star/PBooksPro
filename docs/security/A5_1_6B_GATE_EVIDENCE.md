# A5.1.6B — Production Gate Evidence

**Date:** 2026-06-19  
**Environment:** Staging (`pBookspro_Staging`, port **3001**)  
**Authority:** [`RBAC_V2_PRODUCTION_GATES.md`](./RBAC_V2_PRODUCTION_GATES.md)

---

## Gate evaluation

| Gate | Description | Status | Evidence |
|------|-------------|--------|----------|
| **1** | All Claude reviews approved | **PASS** | A5_1_1 through A5_1_6A_1 APPROVED / closure complete |
| **2** | All automated tests passing | **PASS** | 88/88 RBAC tests; `npm run verify:rbac-v2` green |
| **3** | No unresolved Critical findings | **PASS** | A5.1.5.1 closure (C1, C2) resolved |
| **4** | No unresolved High findings | **PASS** | A5.1.6A.1 closure (H1) resolved |
| **5** | Staging validation complete | **PARTIAL** | Stages 1–6 executed; Stage 7 **14-day soak pending** |
| **6** | Approval matrix validated | **PASS** | Sales1 approver assigned; 33/33 approval tests; matrix flag ON |
| **7** | Data scopes validated | **PARTIAL** | Engine reports 4 scope dimensions; department E2E **manual QA pending** |
| **8** | Rollback tested | **PASS** | [`A5_1_6B_ROLLBACK_DRILL.md`](./A5_1_6B_ROLLBACK_DRILL.md) |
| **9** | Executive signoff | **PARTIAL** | Stage 8 not yet complete |

---

## Gate 2 — Test inventory

| Suite | Result |
|-------|--------|
| `npm run verify:rbac-v2` | All checks passed |
| `rbacAuthorizationEngine.test.ts` | Pass |
| `dataScopeEnforcement.test.ts` | Pass |
| `rbacV2SecurityClosure.test.ts` | Pass |
| `rbacBreakGlassService.test.ts` | Pass |
| `approvalEnforcement.test.ts` + `approvalSecurityClosure.test.ts` | 33/33 pass |
| **Total** | **88/88** |

---

## Gate 5 — Staging stage completion

| Stage | Status | Evidence |
|-------|--------|----------|
| 1 Permission Catalog | **PASS** | verify:rbac-v2; catalog API 200 |
| 2 Role Management | **PASS** | Flags ON; security closure tests |
| 2.5 Bootstrap | **PASS** | [`A5_1_6B_PARITY_RESULTS.md`](./A5_1_6B_PARITY_RESULTS.md) |
| 3 Authorization Engine | **PASS** | JWT `av` present; effective-context 200 |
| 4 Data Scope | **PARTIAL** | Flag ON; automated scope tests pass; payroll dept E2E pending |
| 5 Approval Matrix | **PASS** | Flag ON; approver pool configured |
| 6 Role split / SoD | **PASS** | [`A5_1_6B_SOD_RESULTS.md`](./A5_1_6B_SOD_RESULTS.md) |
| 7 Parallel validation | **PARTIAL** | Smoke 21/22; 14-day soak not started |
| 8 Executive acceptance | **FAIL** | Not recorded |
| 9 Production readiness | **PARTIAL** | This package |

---

## Gate 6 — Approval matrix

| Requirement | Evidence |
|-------------|----------|
| ≥1 user with `accounting.journals.approve` | Sales1 → `finance_approver` |
| Matrix assignee for `manual_journal` | `rbac_approval_assignments` row for Sales1 |
| Empty pool fail-closed | A5.1.5.1 tests H1 |
| AUTO_APPROVE blocked | C2 tests |

---

## Gate 7 — Data scope

| Dimension | Automated | Runtime |
|-----------|-----------|---------|
| project | `applyProjectScope` tests | effective-context scopes: 4 |
| property | `applyPropertyScope` tests | — |
| owner | resolver tests | — |
| department | `applyDataScope` department IN clause | **Manual:** payroll user Dept A vs B pending |

---

## Gate 8 — Rollback

See [`A5_1_6B_ROLLBACK_DRILL.md`](./A5_1_6B_ROLLBACK_DRILL.md) — **PASS**

---

## Production cutover authorization

| Criterion | Ready? |
|-----------|--------|
| Claude Staging Cutover Review | **Pending** |
| Production cutover (A5.1.6C) | **Blocked** until Gate 5 soak, Gate 7 E2E, Gate 9 signoff |

---

## Checklist

```
✓ Gate 1  — Claude reviews
✓ Gate 2  — Automated tests
✓ Gate 3  — Critical findings
✓ Gate 4  — High findings
◐ Gate 5  — Staging validation (partial)
✓ Gate 6  — Approval matrix
◐ Gate 7  — Data scopes (partial)
✓ Gate 8  — Rollback tested
◐ Gate 9  — Executive signoff (pending)
```

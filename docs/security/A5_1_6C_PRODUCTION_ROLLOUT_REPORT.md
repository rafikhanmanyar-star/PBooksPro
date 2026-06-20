# A5.1.6C — Production Rollout Report

**Phase:** A5.1.6C  
**Status:** **Phase 0 complete — Phases 1–3 BLOCKED** (executive sign-off pending)  
**Date:** 2026-06-19  
**Authority:** [`RBAC_V2_PRODUCTION_GATES.md`](./RBAC_V2_PRODUCTION_GATES.md), [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md), [`RBAC_V2_MONITORING_PLAN.md`](./RBAC_V2_MONITORING_PLAN.md)

---

## Executive summary

Phase 0 pre-cutover verification was executed. **Local production** (`pbookspro`, `.env.production`) passes schema verification after migration `138_rbac_roles_is_archived.sql`. **Cloud production** (`pbookspro_ofm7`, `.env.production.render`) requires migrations **133–138** before any RBAC V2 enablement. **Executive sign-off is not recorded** — signature blocks in [`A5_1_6B_EXECUTIVE_SIGNOFF.md`](./A5_1_6B_EXECUTIVE_SIGNOFF.md) remain blank.

Per rollout gates: **Phases 1–3 did not execute.** No production RBAC V2 flags were enabled.

---

## Phase 0 — Pre-cutover verification

| Check | Local | Cloud | Result |
|-------|-------|-------|--------|
| Executive signatures | **FAIL** | **FAIL** | **BLOCKED** |
| Migrations 133–138 | **PASS** | **FAIL** | Split |
| `rbac_roles.is_archived` | **PASS** | **FAIL** | Split |
| RBAC V2 tables | **PASS** | **FAIL** | Split |

**Actions taken:**

1. Created migration [`138_rbac_roles_is_archived.sql`](../database/migrations/138_rbac_roles_is_archived.sql)
2. Applied to local production: `npm run db:migrate:production`
3. Added verification script: `scripts/rbac-production-pre-cutover.mjs`
4. Documented checklist: [`A5_1_6C_PRE_CUTOVER_CHECKLIST.md`](./A5_1_6C_PRE_CUTOVER_CHECKLIST.md)

Evidence: [`production-evidence/pre-cutover-verification.json`](./production-evidence/pre-cutover-verification.json)

---

## Phase 1 — Pilot tenant rollout

**Status:** **NOT STARTED** (blocked by executive sign-off)

| Item | Plan |
|------|------|
| Pilot tenant | `rk-builders-284d6d` (RK Builders) |
| Flags | ROLE_MANAGEMENT, AUTHORIZATION_ENGINE, DATA_SCOPE, APPROVAL_MATRIX (+ SOD/BREAK_GLASS per plan) |
| Journal E2E | Preparer → submit → approver → GL post |
| Monitor | Minimum 1 hour post-enablement |

**Why blocked:** [`A5_1_6C_PRE_CUTOVER_CHECKLIST.md`](./A5_1_6C_PRE_CUTOVER_CHECKLIST.md) §1 — Finance Lead and Executive Sponsor signatures absent.

---

## Phase 2 — Early adopter rollout

**Status:** **NOT STARTED** (requires Phase 1 PASS)

Planned: limited additional tenants after pilot metrics stable and no P1 incidents.

---

## Phase 3 — Full rollout

**Status:** **NOT STARTED** (requires Phase 2 PASS)

Planned: all production tenants after early adopter validation and gate sign-off.

---

## Deliverables

| Deliverable | Document | Status |
|-------------|----------|--------|
| Pre-cutover checklist | [`A5_1_6C_PRE_CUTOVER_CHECKLIST.md`](./A5_1_6C_PRE_CUTOVER_CHECKLIST.md) | **Complete** |
| Production journal smoke | [`A5_1_6C_PRODUCTION_VALIDATION.md`](./A5_1_6C_PRODUCTION_VALIDATION.md) § Deliverable 1 | **Pending** |
| Metric baselines | [`A5_1_6C_PRODUCTION_BASELINES.md`](./A5_1_6C_PRODUCTION_BASELINES.md) | **Pending** |
| Production validation | [`A5_1_6C_PRODUCTION_VALIDATION.md`](./A5_1_6C_PRODUCTION_VALIDATION.md) | **Pending** |
| Rollback readiness | Same + [`A5_1_6B_ROLLBACK_DRILL.md`](./A5_1_6B_ROLLBACK_DRILL.md) | **PASS** (documented) |
| This report | [`A5_1_6C_PRODUCTION_ROLLOUT_REPORT.md`](./A5_1_6C_PRODUCTION_ROLLOUT_REPORT.md) | **Complete** (Phase 0) |

---

## Environment matrix

| Target | Database | Port | Schema ready? | Rollout started? |
|--------|----------|------|---------------|------------------|
| Local production | `pbookspro` | 3000 | **Yes** | **No** |
| Cloud production | `pbookspro_ofm7` | 3000 | **No** (133–138 pending) | **No** |
| Staging (reference) | `pBookspro_Staging` | 3001 | **Yes** | **Complete** (A5.1.6B) |

---

## Success criteria

| Criterion | Status |
|-----------|--------|
| Executive signoff complete | **FAIL** — signatures blank |
| Schema verified | **PARTIAL** — local PASS, cloud FAIL |
| Pilot tenant successful | **N/A** — not started |
| Journal E2E successful | **N/A** — not started |
| Metrics baselined | **N/A** — not started |
| No P1 incidents | **PASS** (no flags enabled) |
| Production rollout complete | **NO** |
| Ready for A5.1.6D | **NO** |

---

## Next steps (in order)

1. **Obtain signatures** in [`A5_1_6B_EXECUTIVE_SIGNOFF.md`](./A5_1_6B_EXECUTIVE_SIGNOFF.md) (Finance Lead + Executive Sponsor).
2. **Cloud migration window:** apply migrations 133–138 on `pbookspro_ofm7` (includes `138_rbac_roles_is_archived.sql`).
3. Re-run: `node scripts/rbac-production-pre-cutover.mjs` and `--render` — both must exit 0.
4. **Phase 1:** Enable RBAC V2 flags for `rk-builders-284d6d` only; run journal smoke + 1-hour monitor.
5. **Phase 2–3:** Expand per [`RBAC_V2_MIGRATION_STRATEGY.md`](./RBAC_V2_MIGRATION_STRATEGY.md) after pilot PASS.

---

## Verdict

**A5.1.6C Phase 0 is complete.** Production rollout is **intentionally halted** at the executive sign-off gate. No RBAC V2 behavior was changed in production runtime. Proceed to Phase 1 only after sign-off and (for cloud) schema migration completion.

# RBAC V2 Staging Cutover Plan

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only  
**Environment:** Staging (`pBookspro_Staging`, API port **3001**)  
**Authority:** [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md), [`RBAC_V2_MIGRATION_STRATEGY.md`](./RBAC_V2_MIGRATION_STRATEGY.md)

---

## Purpose

Define staged rollout on staging before any production cutover. Each stage is independently rollback-capable. **Do not skip stages.**

---

## Prerequisites (all stages)

- [ ] All A5.1.1–A5.1.5.1 reviews **APPROVED**
- [ ] `npm run verify:rbac-v2` passes on `staging` branch
- [ ] Staging database migrated through migration 137 (approval matrix)
- [ ] `.env.staging` available; **flags remain false until stage entry**

---

## Stage 1 — Permission Catalog

| Item | Detail |
|------|--------|
| **Objectives** | Validate 154 catalog keys; bundle definitions; SoD pair registry; CI gates |
| **Flags** | None required (catalog is code + API; no auth behavior change) |
| **Validation** | `npm run verify:rbac-v2`; `GET /api/v1/rbac/permission-catalog` returns full tree |
| **Rollback criteria** | Catalog API errors blocking admin UI; CI verify failures |
| **Rollback action** | Revert catalog commit; no env change |
| **Exit criteria** | verify:rbac-v2 green; catalog API 200; PERMISSION_MIGRATION_MAP §10 checklist complete |

---

## Stage 2 — Role Management

| Item | Detail |
|------|--------|
| **Objectives** | Custom roles, SoD blocking, privilege ceiling, break-glass, audit log |
| **Flags** | `RBAC_V2_ROLE_MANAGEMENT=true`, `RBAC_V2_SOD=true`, `RBAC_V2_BREAK_GLASS=true` (optional UI: `VITE_RBAC_V2_ROLE_MANAGEMENT=true`) |
| **Validation** | SoD 409 on incompatible pairs; break-glass MFA + session expiry; system role protection; `rbacV2SecurityClosure.test.ts` pass |
| **Rollback criteria** | SoD false positives blocking legitimate assignments; break-glass unavailable during incident |
| **Rollback action** | `RBAC_V2_ROLE_MANAGEMENT=false`; restart API :3001 |
| **Exit criteria** | All Phase 2 acceptance criteria from implementation plan; zero unintended role assignment blocks on test personas |

---

## Stage 2.5 — RBAC User Assignment Bootstrap

| Item | Detail |
|------|--------|
| **Objectives** | Populate `rbac_user_roles` for all active users **before** authorization engine enablement |
| **Flags** | `RBAC_V2_ROLE_MANAGEMENT=true` (from Stage 2). **`RBAC_V2_AUTHORIZATION_ENGINE=false`** — engine remains OFF |
| **Mapping** | `users.role` / `user_tenants.role` → `LEGACY_ROLE_TO_ENTERPRISE` → `rbac_roles.id` → `rbac_user_roles` |
| **Tool** | `node --import tsx scripts/rbac-assess-tenant.mjs --tenant <id> --env staging --bootstrap [--dry-run]` |

### Entry criteria

- [ ] Stage 2 exit criteria met (`RBAC_V2_ROLE_MANAGEMENT=true`)
- [ ] Seeded `rbac_roles` exist for tenant (migration 131+)
- [ ] **`RBAC_V2_AUTHORIZATION_ENGINE=false`** confirmed
- [ ] Legacy authorization still active (default path)

### Validation

- [ ] `--bootstrap --dry-run` shows expected inserts only (no destructive ops)
- [ ] `--parity` reports **zero** `NO_RBAC_ASSIGNMENT` rows
- [ ] Every active user has ≥1 row in `rbac_user_roles` matching enterprise slug from legacy role
- [ ] Re-run bootstrap is idempotent (second run: `inserted=0`, `skipped=N`)
- [ ] **Permission Gain Review** — any flagged users require human sign-off (see M4 below)

### Rollback

| Action | Effect |
|--------|--------|
| Delete bootstrap rows | `DELETE FROM rbac_user_roles WHERE assigned_by = 'rbac-assess-tenant-bootstrap'` (staging only) |
| Or leave rows | Non-destructive — legacy resolver ignores empty assignments; populated assignments used only when role management on |

**Note:** Bootstrap does not change runtime authorization while engine is OFF — legacy `users.role` path remains authoritative for `requirePermission`.

### Exit criteria

- [ ] 100% active users have `rbac_user_roles` assignment
- [ ] `--parity` permission loss count = **0**
- [ ] Permission gain review sign-off recorded for any flagged users
- [ ] `--sod-report` run (violations documented for Stage 6 role splits — not blocking Stage 2.5)

---

## Stage 3 — Authorization Engine

| Item | Detail |
|------|--------|
| **Objectives** | EffectiveAccessContext, JWT `av`, TOKEN_STALE, bundle expansion, version hash |
| **Flags** | `RBAC_V2_AUTHORIZATION_ENGINE=true` (requires **Stage 2.5** complete) |
| **Validation** | Fresh login has `av`; role change → TOKEN_STALE; `rbacAuthorizationEngine.test.ts` pass; parity script vs legacy |
| **Rollback criteria** | Mass 401 TOKEN_STALE without recovery path; permission deny spike > baseline + 200% |
| **Rollback action** | `RBAC_V2_AUTHORIZATION_ENGINE=false`; restart; communicate re-login optional |
| **Exit criteria** | Staging soak 72h; parity report ≥99.9% match; **permission loss = 0**; permission gain review signed off; forced re-login documented |

**Entry criteria (added):**

- [ ] **Stage 2.5 complete** — all users bootstrapped into `rbac_user_roles`
- [ ] `--parity` exit code 0 (or gain review signed off)

**Communication:** All staging users must re-login after enablement.

---

## Stage 4 — Data Scope Enforcement

| Item | Detail |
|------|--------|
| **Objectives** | Scope grants, repository filters, report scope, scopeHash in `av` |
| **Flags** | `RBAC_V2_DATA_SCOPE=true`, `VITE_RBAC_V2_DATA_SCOPE=true` (requires Stage 3) |
| **Validation** | Scoped user sees subset only; scope mutation → TOKEN_STALE; `dataScopeEnforcement.test.ts` pass; report row counts |
| **Rollback criteria** | Scope leak (user sees out-of-scope records); mass 403 on reports |
| **Rollback action** | `RBAC_V2_DATA_SCOPE=false`; restart |
| **Exit criteria** | Pen-test scope bypass: zero critical findings; payroll department scope verified |

---

## Stage 5 — Approval Matrix

| Item | Detail |
|------|--------|
| **Objectives** | Mandatory journal/reversal approval; matrix assignments; approver SoD; empty pool fail-closed |
| **Flags** | `RBAC_V2_APPROVAL_MATRIX=true`, `VITE_RBAC_V2_APPROVAL_MATRIX=true` (requires Stage 3) |
| **Entry criteria** | Stage 3 complete; ≥1 user with `accounting.journals.approve`; ≥1 matrix assignee for `manual_journal`; approver pool non-empty (no `APPROVAL_POOL_EMPTY` on test submit) |
| **Validation** | Journal submit → draft; approve → post; 33/33 approval tests pass; negative empty-pool test only on isolated tenant |
| **Rollback criteria** | Approval bypass (direct GL post); auto-approve on mandatory types |
| **Rollback action** | `RBAC_V2_APPROVAL_MATRIX=false`; restart |
| **Exit criteria** | A5.1.5.1 closure met; journal approvers assigned by super_admin; E2E journal flow without APPROVAL_POOL_EMPTY |

**Note:** Expect one-time TOKEN_STALE spike when approvalHash first participates in `av`.

---

## Stage 6 — Role Split & Custom Role Migration

| Item | Detail |
|------|--------|
| **Objectives** | Apply role splits per [`RBAC_V2_ROLE_MIGRATION_PLAN.md`](./RBAC_V2_ROLE_MIGRATION_PLAN.md); sync `rbac_role_permissions`; resolve SoD violations |
| **Flags** | Stages 2–5 flags remain enabled |
| **Prerequisite** | Stage 2.5 bootstrap complete (initial `rbac_user_roles` population) |
| **Validation** | `--sod-report` zero violations; `--parity` permission loss = 0; permission gain review signed off |
| **Rollback criteria** | Widespread permission loss; unresolved SoD violations |
| **Rollback action** | Restore assignment snapshot; disable engine if needed |
| **Exit criteria** | SoD 0; parity loss 0; admin sign-off on role splits and any gain-review users |

---

## Stage 7 — Parallel Validation

| Item | Detail |
|------|--------|
| **Objectives** | Dual-run legacy vs v2 outcomes on critical flows; route guard migration pilot |
| **Flags** | All v2 flags on; begin migrating route guards on staging routers |
| **Validation** | Critical flow matrix (login, journal, PO, bill, payment, report, payroll); automated + manual QA |
| **Rollback criteria** | Any critical flow regression; parity mismatch >0.1% |
| **Rollback action** | Revert route guard commits; disable strictest flag first (approval → scope → engine) |
| **Exit criteria** | 14-day staging soak with zero P1 auth defects |

---

## Stage 8 — Executive Acceptance

| Item | Detail |
|------|--------|
| **Objectives** | Business sign-off on SoD splits, approval workflow changes, scope restrictions |
| **Flags** | Unchanged from Stage 7 |
| **Validation** | Demo to stakeholders; support runbook review; training materials distributed |
| **Rollback criteria** | Executive rejection of role split model |
| **Rollback action** | Hold production; revise role migration plan |
| **Exit criteria** | Written executive acceptance recorded |

---

## Stage 9 — Production Readiness

| Item | Detail |
|------|--------|
| **Objectives** | Confirm all production gates in [`RBAC_V2_PRODUCTION_GATES.md`](./RBAC_V2_PRODUCTION_GATES.md); rollback drill completed |
| **Flags** | Staging: all on; Production: **still false** until gate sign-off |
| **Validation** | Rollback drill on staging (<15 min recovery); monitoring dashboards configured |
| **Rollback criteria** | Any production gate failed |
| **Rollback action** | Do not proceed to production cutover (A5.1.6B) |
| **Exit criteria** | All 9 production gates green; Claude Migration & Cutover Review approved |

---

## Permission Gain Review (M4)

Parity validation uses **two checks**:

| Check | Rule | Blocking? |
|-------|------|-----------|
| **Permission loss** | Every v1 key in legacy static matrix must exist in rbac path (`v2 ⊇ v1` at v1 key level) | **Yes** — blocks stage exit |
| **Permission gain** | Users with v1 or expanded permissions **beyond** legacy static matrix for their `users.role` | **Review** — human sign-off required |

**Gain triggers:**

- Any v1 key in rbac path not in legacy static matrix for that user's role
- Any **restricted** permission in expanded gain set
- Expanded permission count delta above `--gain-threshold` (default 0)

**Sign-off:** Security administrator or super_admin records approval in staging cutover log before Stage 3/6 exit.

---

## Staging timeline (indicative)

| Stage | Duration |
|-------|----------|
| 1 | 2–3 days |
| 2 | 1 week |
| **2.5** | **1–2 days** |
| 3 | 1 week + 72h soak |
| 4 | 1–2 weeks |
| 5 | 1 week |
| 6 | 3–5 days |
| 7 | 2 weeks |
| 8 | 3–5 days |
| 9 | 3–5 days |

**Total staging:** ~8–10 weeks before production cutover authorization.

---

*End of staging cutover plan.*

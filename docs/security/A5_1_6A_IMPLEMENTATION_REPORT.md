# A5.1.6A — RBAC V2 Migration & Cutover Planning Report

**Phase:** A5.1.6A  
**Status:** Superseded by closure — see [`A5_1_6A_1_IMPLEMENTATION_REPORT.md`](./A5_1_6A_1_IMPLEMENTATION_REPORT.md)  
**Date:** June 2026  
**Scope:** Documentation only — no code, schema, or feature flag changes

---

## Summary

RBAC V2 implementation phases A5.1.1 through A5.1.5.1 are **APPROVED**. This phase produces the migration, cutover, rollback, monitoring, and legacy retirement strategy required before production enablement (A5.1.6B).

All RBAC V2 capabilities remain **feature-flagged and disabled by default** in production.

---

## Files Created

| File | Purpose |
|------|---------|
| [`RBAC_V2_MIGRATION_STRATEGY.md`](./RBAC_V2_MIGRATION_STRATEGY.md) | Current/target state, philosophy, coexistence |
| [`RBAC_V2_ROLE_MIGRATION_PLAN.md`](./RBAC_V2_ROLE_MIGRATION_PLAN.md) | Per-role mapping, SoD splits, validation |
| [`RBAC_V2_PERMISSION_MIGRATION_PLAN.md`](./RBAC_V2_PERMISSION_MIGRATION_PLAN.md) | v1 → v2 keys, route/report/approval/scope impact |
| [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md) | 9-stage staging rollout |
| [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md) | Triggers, flag disable order, recovery validation |
| [`RBAC_V2_PRODUCTION_GATES.md`](./RBAC_V2_PRODUCTION_GATES.md) | 9 go/no-go gates |
| [`RBAC_V2_MONITORING_PLAN.md`](./RBAC_V2_MONITORING_PLAN.md) | Metrics, baselines, thresholds |
| [`RBAC_V2_DECOMMISSION_PLAN.md`](./RBAC_V2_DECOMMISSION_PLAN.md) | Legacy RBAC retirement sequence |
| [`A5_1_6A_IMPLEMENTATION_REPORT.md`](./A5_1_6A_IMPLEMENTATION_REPORT.md) | This report |

---

## Files Updated

| File | Change |
|------|--------|
| *(none)* | Planning phase — no existing files modified |

---

## Migration Strategy Summary

- **Legacy:** 55 v1 permission keys, static `ROLE_PERMISSIONS` matrix, `financial.write` bundle on 22 router mounts, 45s TTL auth cache, role-slug workflow approvers.
- **Target:** 154-key catalog, EffectiveAccessContext + JWT `av`, SoD, data scopes, approval matrix, break-glass sessions.
- **Coexistence:** Feature flags control parallel operation; legacy path remains default until staged enablement.
- **Philosophy:** Zero downtime, rollback without schema drop, parity validation, no permission loss, no security downgrade.

---

## Staging Plan Summary

Nine stages on `pBookspro_Staging` (port 3001):

1. Permission Catalog  
2. Role Management (+ SoD, break-glass)  
3. Authorization Engine  
4. Data Scope Enforcement  
5. Approval Matrix  
6. User Migration  
7. Parallel Validation (14-day soak)  
8. Executive Acceptance  
9. Production Readiness  

Indicative duration: **8–10 weeks** before production cutover authorization.

---

## Rollback Summary

- **No schema rollback** — disable flags + API restart.
- Reverse order: STRICT_MODE → APPROVAL_MATRIX → DATA_SCOPE → AUTHORIZATION_ENGINE → ROLE_MANAGEMENT/SOD.
- **Critical triggers:** unauthorized access, scope leak, approval bypass, mass TOKEN_STALE.
- **Route caveat:** `requirePermissionV2`-only routes need guard revert if engine disabled.
- **Drill target:** <15 minutes flag-to-recovery on staging.

---

## Monitoring Summary

Key metrics from `rbacV2Metrics.ts`:

| Metric | Rollback relevance |
|--------|-------------------|
| `RBAC_V2_DENY` | Legitimate user blocks |
| `RBAC_V2_STALE_AV` | Mass 401 after enablement |
| `RBAC_V2_SCOPE_DENY` | Scope misconfiguration |
| `RBAC_V2_APPROVAL_REQUIRED` | Bypass detection (zero when activity exists) |
| `RBAC_V2_APPROVAL_REJECTED` | Pool empty / SoD blocks |
| `BREAK_GLASS_ACTIVATED` (audit) | Excessive break-glass use |

7-day baseline window after each stage enablement.

---

## Production Gates

Nine gates — all must pass before A5.1.6B:

1. All Claude reviews approved  
2. All automated tests passing  
3. No unresolved Critical findings  
4. No unresolved High findings  
5. Staging validation complete  
6. Approval matrix validated  
7. Data scopes validated  
8. Rollback tested  
9. Executive signoff  

---

## Legacy Retirement Plan

Decommission (A5.1.7+) requires: 30 days stable production, no rollback, no open security findings, 100% user migration, executive approval.

Sequence: disable legacy auth path → observe → remove legacy guards → remove bundle alias / static matrix → archive docs.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Accountant role SoD violations (create+approve) | **Critical** | Mandatory role split before Stage 6; sod-report gate |
| TOKEN_STALE mass logout at engine/approval enablement | **High** | Communicate maintenance window; Stage 3/5 comms |
| Permission loss during parity migration | **High** | Parity script blocks Stage 6 exit |
| Route guard migration with engine off → 503 | **High** | Dual-guard or revert plan in rollback doc |
| Scope leak on partial grant configuration | **Critical** | Pen-test Gate 7; immediate scope flag disable |
| company_admin informal journal approver | **Medium** | super_admin assigns matrix approvers (A5.1.5.1 C1) |
| Legacy `users.role` drift from rbac_user_roles | **Medium** | Backfill assignments; eventual column deprecation |
| Performance — per-request context resolve | **Medium** | Monitor auth p95; cache with version hash |

---

## Recommendations

1. **Run Stage 2–5 on staging in order** — do not enable approval matrix before engine.
2. **Execute SoD report on every production tenant** before Stage 6 user migration (read-only dry-run).
3. **Pre-assign journal approvers** before Stage 5 — avoid APPROVAL_POOL_EMPTY blocking finance teams.
4. **Schedule forced re-login** for Stage 3 and Stage 5 enablement windows.
5. **Complete rollback drill** in Stage 9 before requesting A5.1.6B authorization.
6. **Do not disable SoD post-cutover** without executive + security sign-off.
7. **Build parity script** (`rbac-assess-tenant.mjs`) if not yet present — referenced in implementation plan.

---

## Open Questions

| # | Question | Owner |
|---|----------|-------|
| 1 | Per-tenant vs global flag rollout for production? | Platform / executive |
| 2 | Acceptable parity mismatch threshold (99.9% vs 100%)? | Security + product |
| 3 | Maintenance window duration for production Stage 3/5? | Operations |
| 4 | Compensating controls if tenant refuses accountant role split? | Security (SoD is blocking — no override) |
| 5 | Timeline for `users.role` column deprecation post-decommission? | Engineering |
| 6 | Dashboard tooling for rbacV2Metrics (Datadog vs internal)? | Operations |

---

## Recommended Next Phase

**A5.1.6B — Staging Cutover Execution**

- Execute [`RBAC_V2_STAGING_CUTOVER_PLAN.md`](./RBAC_V2_STAGING_CUTOVER_PLAN.md) Stages 1–9 on `pBookspro_Staging`.
- Enable flags incrementally per stage (staging only).
- Run parity and SoD scripts; collect gate evidence.
- Submit for Claude Migration & Cutover Review.
- Upon gate passage, plan **A5.1.6C — Production Cutover** with executive change window.

---

## Verification (this phase)

| Check | Result |
|-------|--------|
| Code changes | **None** |
| Schema changes | **None** |
| Feature flag changes | **None** |
| All 8 planning documents created | **Yes** |
| Implementation report created | **Yes** |

---

## Program approval status

| Phase | Verdict |
|-------|---------|
| A5.1.1 – A5.1.5.1 | APPROVED |
| A5.1.6A (this phase) | Pending Claude Migration & Cutover Review |

---

*End of A5.1.6A implementation report.*

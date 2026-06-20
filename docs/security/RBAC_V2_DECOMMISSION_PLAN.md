# RBAC V2 Legacy Decommission Plan

**Phase:** A5.1.6A — Migration & Cutover Planning  
**Status:** Planning only — decommission is **post-production** (A5.1.7+)  
**Authority:** [`RBAC_V2_MIGRATION_STRATEGY.md`](./RBAC_V2_MIGRATION_STRATEGY.md), [`RBAC_V2_PRODUCTION_GATES.md`](./RBAC_V2_PRODUCTION_GATES.md)

---

## Purpose

Define when and how to remove legacy RBAC after RBAC V2 is stable in production. **Do not execute until all prerequisites are met.**

---

## Prerequisites (all required)

| # | Requirement | Evidence |
|---|-------------|----------|
| 1 | **30 days stable production** | Zero P1 auth incidents; monitoring baselines normal |
| 2 | **No rollback** | No flag disable events in 30-day window |
| 3 | **No open security findings** | Zero Critical/High from pen-test and Claude reviews |
| 4 | **100% user migration** | Every active user has `rbac_user_roles`; parity report clean |
| 5 | **Executive approval** | Written authorization for legacy retirement |

Additional technical gates:

- [ ] `RBAC_V2_STRICT_MODE=true` for ≥14 days
- [ ] Zero direct `financial.write` route guards (verify:rbac-v2)
- [ ] All routes use `requirePermissionV2` (no legacy-only guards)
- [ ] Frontend uses `usePermissions()` / effective-context only (no raw role strings)

---

## Legacy components to retire

| Component | Location | Retirement action |
|-----------|----------|---------------------|
| Static `ROLE_PERMISSIONS` matrix | `shared/rbac/permissions.ts` | Remove after DB is source of truth |
| `LEGACY_ROLE_TO_ENTERPRISE` alias map | `shared/rbac/permissions.ts` | Keep read-only migration period; remove after `users.role` deprecated |
| `requirePermission` (legacy) | `backend/src/auth/authorize.ts` | Remove when all routes on v2 |
| `requireFinancialWriteOnMutations` | `rbacMiddleware.ts` | Remove mount-level bundle guards |
| `requireLedgerRole` / `requireFinancialWriteRole` | auth/rbac middleware | Replace with v2 keys (already planned) |
| 45s TTL auth cache as correctness mechanism | `authMiddleware` | TTL remains performance-only; version hash is correctness |
| `users.role` / JWT role slug | users table, JWT payload | Deprecate column; JWT carries userId + tenantId only |
| `canWriteFinancial` OR checks | `hooks/usePermissions.ts` | Domain-specific v2 checks |
| Raw role string UI checks | Various components | grep-clean `isAdminRole`, role comparisons |
| Legacy RBAC docs | `docs/rbac/rbac-v2-specification.md` § static matrix | Archive |

**Not removed:** `rbac_roles`, `rbac_user_roles`, `rbac_role_permissions` — these **are** RBAC V2.

---

## Decommission sequence

Execute in order. **Observe ≥7 days between major steps** unless incident requires pause.

### Phase D1 — Disable legacy authorization path

| Step | Action |
|------|--------|
| D1.1 | Confirm `RBAC_V2_AUTHORIZATION_ENGINE=true` on 100% tenants ≥30 days |
| D1.2 | Confirm no route calls `requirePermission` without v2 equivalent |
| D1.3 | Set internal `LEGACY_AUTH_DISABLED=true` (future flag — A5.1.7) to log-only warn on legacy path |
| D1.4 | Monitor `RBAC_V2_DENY` + 503 rate for 7 days |

### Phase D2 — Observe

| Step | Action |
|------|--------|
| D2.1 | Run weekly parity script — expect 100% match |
| D2.2 | Review support tickets for access issues |
| D2.3 | Confirm break-glass sessions audited |

### Phase D3 — Remove legacy guards

| Step | Action |
|------|--------|
| D3.1 | Delete `requirePermission` usages from route handlers |
| D3.2 | Remove `requireFinancialWriteOnMutations` from `mountVersionedApi.ts` |
| D3.3 | Remove `ROLE_PERMISSIONS` fallback in permission resolver |
| D3.4 | `npm run verify:rbac-v2` + full test suite |

### Phase D4 — Remove legacy permission matrix

| Step | Action |
|------|--------|
| D4.1 | Remove `financial.write` bundle alias from PermissionEngine (strict catalog only) |
| D4.2 | Remove v1 `ALL_PERMISSIONS` flat list if fully superseded by catalog |
| D4.3 | Migration to drop `users.role` column (separate approved migration — **not A5.1.6A**) |

### Phase D5 — Archive legacy docs

| Step | Action |
|------|--------|
| D5.1 | Move superseded docs to `docs/security/archive/` |
| D5.2 | Update `doc/ARCHITECTURE.md` RBAC section to v2-only |
| D5.3 | Publish decommission completion report |

---

## Rollback during decommission

If issues arise during D3–D4:

1. Re-enable legacy resolver code from git tag (pre-decommission release).
2. Set `RBAC_V2_STRICT_MODE=false`.
3. Do **not** drop database columns — restore code path only.

Full rollback plan: [`RBAC_V2_ROLLBACK_PLAN.md`](./RBAC_V2_ROLLBACK_PLAN.md).

---

## Success criteria

- [ ] No production code references `ROLE_PERMISSIONS` static matrix
- [ ] No `requirePermission` (legacy) in `backend/src/modules/`
- [ ] `financial.write` not used in route guards
- [ ] verify:rbac-v2 passes with strict legacy-retirement checks
- [ ] Executive sign-off on decommission completion

---

*End of decommission plan.*

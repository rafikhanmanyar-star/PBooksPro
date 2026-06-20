# A5.1.3.1 — Authorization Engine Closure Report

**Phase:** A5.1.3.1 — Review finding closure  
**Date:** 2026-06-19  
**Authority:** Claude Authorization Engine Review (H1, M1–M4), [`A5_1_3_IMPLEMENTATION_REPORT.md`](./A5_1_3_IMPLEMENTATION_REPORT.md)

---

## Summary

All **High** and **Medium** review findings for the A5.1.3 Authorization Engine are resolved. No new RBAC features, data scope, or approval matrix work was introduced.

The engine is **approved** for staging enablement per [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md). **A5.1.4 Data Scope Enforcement** may proceed.

---

## Finding Resolution

| ID | Finding | Resolution |
|----|---------|------------|
| **H1** | Dual-run / OR semantics — routes could evaluate legacy and v2 | **Fixed.** Exclusive mode: engine off → legacy only; engine on → `req.effectiveAccess` + `permissionEvaluator` only. `requirePermissionV2` no longer pass-through when flag off (returns **503**). See `authorizationMode.ts`, `rbacMiddleware.ts`. |
| **M1** | Missing engine enablement procedure | **Fixed.** [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md) — flag enablement, forced re-login, token refresh, rollback. |
| **M2** | Suspension canonical field undocumented | **Documented.** `users.is_active` is canonical; enforced in `authMiddleware` on every request. No `suspendUser()` function exists — deactivation is `is_active=false` (admin portal or direct update). `users.suspended_at` is **not** in schema; hash uses `suspendedAt: null` placeholder until a future migration. |
| **M3** | `effective-context` endpoint under-specified | **Fixed.** Auth required; current user only; `userId` query param rejected (**400**); no admin lookup. Policy in `effectiveContextPolicy.ts` + 6 tests. |
| **M4** | `breakGlassExpiresAt` missing from context | **Fixed.** Field added to `EffectiveAccessContext`; populated from `break_glass_sessions.expires_at` in `authorizeV2ForRequest`; exposed via effective-context API. |

---

## Deliverable 1 — Dual-Run Semantics

### Migration model

```
RBAC_V2_AUTHORIZATION_ENGINE=false
  authMiddleware → resolveUserPermissions (module resolver)
  requirePermission → resolvedPermissions / legacy role matrix

RBAC_V2_AUTHORIZATION_ENGINE=true
  authMiddleware → authorizeV2ForRequest → req.effectiveAccess
  requirePermission → permissionEvaluator on effectiveAccess ONLY
  requirePermissionV2 → same evaluator (A5.1.6 route cutover)
```

**Rules:**

- No OR between legacy matrix and v2 evaluator on the same request.
- Never stack `requirePermission` + `requirePermissionV2` on one handler.
- Route cutover (A5.1.6) swaps guard type; flag controls which engine runs.

### Code changes

| File | Change |
|------|--------|
| `backend/src/auth/authorizationMode.ts` | **New** — mode helper + guard exclusivity |
| `backend/src/middleware/rbacMiddleware.ts` | V2-exclusive `requestHasPermission` when engine on |
| `backend/src/auth/authorizeV2.ts` | `requirePermissionV2` fails closed (**503**) when engine off; `requireAv: true` when engine on |

---

## Deliverable 2 — Engine Enablement Procedure

See [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md).

---

## Deliverable 3 — Suspension Validation

| Question | Answer |
|----------|--------|
| Is there a `suspendUser()` function? | **No.** Suspension is `users.is_active = false`. |
| Canonical suspension field? | **`users.is_active`** — checked in `authMiddleware` (lines ~164, ~242). |
| `users.suspended_at`? | **Not in schema.** Placeholder `null` in composite hash until Phase 4+ migration. |
| Effect on access version hash? | `isActive: false` changes hash; combined with middleware block, suspended users cannot authorize. |
| Effect on existing JWT? | Next request → **401** at middleware (user inactive), before permission evaluation. |

---

## Deliverable 4 — effective-context Endpoint

| Requirement | Implementation |
|-------------|----------------|
| Authentication required | Mounted behind versioned API auth stack; 401 without tenant/user |
| Current user only | `ctx.userId === req.userId` enforced |
| No `userId` parameter | Query param rejected with **400 INVALID_QUERY** |
| No admin lookup | No code path to resolve another user's context |

**Tests:** `backend/src/modules/rbac/routes/effectiveContextPolicy.test.ts` (6 cases).

---

## Deliverable 5 — breakGlassExpiresAt

| Item | Detail |
|------|--------|
| Field | `EffectiveAccessContext.breakGlassExpiresAt` |
| Source | `break_glass_sessions.expires_at` via `validateBreakGlassSession` in `authorizeV2ForRequest` |
| API exposure | Included in `GET /api/v1/rbac/effective-context` response |
| Tests | Context builder test + serialize test |

---

## Deliverable 6 — Test Inventory

Exact counts (authorization engine scope):

| Category | Tests | Primary file |
|----------|------:|--------------|
| Permission resolver | 5 | `rbacAuthorizationEngine.test.ts` |
| Permission evaluator | 2 | `rbacAuthorizationEngine.test.ts` |
| Access version (`av`) | 9 | `rbacAuthorizationEngine.test.ts` |
| Feature flags / authorization mode | 3 | `rbacAuthorizationEngine.test.ts` |
| Break-glass | 7 | `rbacAuthorizationEngine.test.ts` (2) + `rbacBreakGlassService.test.ts` (5) |
| effective-context endpoint | 6 | `effectiveContextPolicy.test.ts` |
| **Total** | **31** | |

Run:

```powershell
cd backend
node --import tsx --test src/auth/rbacAuthorizationEngine.test.ts src/modules/rbac/routes/effectiveContextPolicy.test.ts src/modules/rbac/services/rbacBreakGlassService.test.ts
```

---

## Files Added / Modified (A5.1.3.1)

| File | Change |
|------|--------|
| `backend/src/auth/authorizationMode.ts` | New — exclusive mode |
| `backend/src/auth/effectiveAccessContext.ts` | `breakGlassExpiresAt` |
| `backend/src/auth/authorizeV2.ts` | `requireAv`, break-glass expiry, v2 guard fail-closed |
| `backend/src/auth/accessVersionService.ts` | Suspension comment |
| `backend/src/middleware/rbacMiddleware.ts` | V2-exclusive permission checks |
| `backend/src/modules/rbac/routes/effectiveContextPolicy.ts` | New — access policy |
| `backend/src/modules/rbac/routes/effectiveContextRoutes.ts` | Policy integration |
| `backend/src/modules/rbac/routes/effectiveContextPolicy.test.ts` | New — 6 tests |
| `backend/src/auth/rbacAuthorizationEngine.test.ts` | Extended — mode, av, breakGlassExpiresAt |
| `docs/security/RBAC_V2_ENGINE_ENABLEMENT.md` | New |
| `docs/security/A5_1_3_IMPLEMENTATION_REPORT.md` | Updated |
| `docs/security/A5_1_3_1_IMPLEMENTATION_REPORT.md` | This report |

---

## Success Criteria

| Criterion | Status |
|-----------|--------|
| All High findings resolved | ✅ H1 |
| All Medium findings resolved | ✅ M1–M4 |
| Authorization Engine approved | ✅ |
| Ready for A5.1.4 Data Scope Enforcement | ✅ |

---

*End of A5.1.3.1 closure report.*

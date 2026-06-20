# A5.1.3 — RBAC 2.0 Authorization Engine Implementation Report

**Phase:** A5.1.3 — Authorization Engine + JWT `av`  
**Closure:** A5.1.3.1 — [`A5_1_3_1_IMPLEMENTATION_REPORT.md`](./A5_1_3_1_IMPLEMENTATION_REPORT.md)  
**Date:** 2026-06-19  
**Authority:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §2.3–§2.5, [`A5_1_2_FINAL_APPROVED.md`](./A5_1_2_FINAL_APPROVED.md)

---

## Summary

Phase 3 introduces the **RBAC V2 Authorization Engine** behind feature flag **`RBAC_V2_AUTHORIZATION_ENGINE=false`** (default). When disabled, legacy `rbacMiddleware` + module resolver behavior is unchanged. When enabled, requests resolve `EffectiveAccessContext`, validate JWT `av` against the composite access version hash, and enforce permissions via the v2 evaluator.

**Enablement:** [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md)

**Not in scope:** Data scope (A5.1.4), approval matrix (A5.1.5), route cutover (A5.1.6).

---

## Files Added

| File | Purpose |
|------|---------|
| `backend/src/auth/rbacAuthorizationFeatureFlag.ts` | `RBAC_V2_AUTHORIZATION_ENGINE` gate |
| `backend/src/auth/rbacPermissionResolver.ts` | Active assignments, bundle expansion, effective permissions |
| `backend/src/auth/effectiveAccessContext.ts` | Canonical authorization context type |
| `backend/src/auth/accessVersionService.ts` | Composite access version hash (§2.5) |
| `backend/src/auth/permissionEvaluator.ts` | Pure `hasPermission` / `hasAny` / `hasAll` |
| `backend/src/auth/authorizeV2.ts` | Resolve + validate + `requirePermissionV2` middleware |
| `backend/src/auth/accessTokenIssuance.ts` | Issue JWT with optional `av` |
| `backend/src/auth/rbacV2Metrics.ts` | RBAC observability metrics |
| `backend/src/auth/authorizationMode.ts` | Exclusive legacy/v2 mode (A5.1.3.1) |
| `backend/src/auth/rbacAuthorizationEngine.test.ts` | Resolver, hash, evaluator, av tests |
| `backend/src/modules/rbac/routes/effectiveContextRoutes.ts` | `GET /rbac/effective-context` |
| `backend/src/modules/rbac/routes/effectiveContextPolicy.ts` | Current-user-only access policy (A5.1.3.1) |
| `backend/src/modules/rbac/routes/effectiveContextPolicy.test.ts` | effective-context policy tests |
| `docs/security/A5_1_3_IMPLEMENTATION_REPORT.md` | This report |
| `docs/security/RBAC_V2_ENGINE_ENABLEMENT.md` | Operator enablement guide |

---

## Files Modified

| File | Change |
|------|--------|
| `backend/src/auth/jwt.ts` | Optional `av` claim on standard + break-glass tokens |
| `backend/src/middleware/authMiddleware.ts` | V2 engine path, `req.effectiveAccess`, av stale check |
| `backend/src/middleware/rbacMiddleware.ts` | V2-exclusive `requirePermission` when engine on (A5.1.3.1) |
| `backend/src/services/auth/loginSessionService.ts` | Issue token with `av` when engine enabled |
| `backend/src/modules/auth/routes/mfaRoutes.ts` | MFA completion issues token with `av` |
| `backend/src/modules/rbac/services/rbacBreakGlassService.ts` | Break-glass token includes `av` via issuance helper |
| `backend/src/routes/mountVersionedApi.ts` | Mount effective-context router |
| `backend/package.json` | Include authorization engine tests |

**Unchanged when flag off:** legacy module `rbacPermissionResolver.ts`, route guard signatures.

---

## Authorization Flow

### Exclusive mode (no dual-run)

Each route uses **one** authorization path — never both legacy and v2 on the same request.

```
JWT Bearer
    ↓
verifyAccessToken (signature + payload)
    ↓
[RBAC_V2_AUTHORIZATION_ENGINE=false]
    resolveUserPermissions + cache
    requirePermission → resolvedPermissions / legacy role matrix
    ↓
[RBAC_V2_AUTHORIZATION_ENGINE=true]
    resolveActiveRoleAssignments (active + unexpired + non-archived)
    expandPermissionBundles (permissionBundles.ts only)
    computeCompositeAccessVersionHash
    JWT.av required → 401 TOKEN_STALE if missing or mismatch
    EffectiveAccessContext on req.effectiveAccess
    requirePermission → permissionEvaluator on effectiveAccess ONLY
    requirePermissionV2 → same (for A5.1.6 route cutover)
```

**Migration model:** Enable flag globally; existing routes keep `requirePermission` (auto-switches to v2 evaluator). New/cutover routes may use `requirePermissionV2`. Never stack both guards on one handler. See [`A5_1_3_1_IMPLEMENTATION_REPORT.md`](./A5_1_3_1_IMPLEMENTATION_REPORT.md) §Deliverable 1.

---

## Access Version Design

Composite hash inputs (deterministic, pipe-separated):

```
tenantId | userId | isActive | suspendedAt | accessVersion |
tenantRbacGlobalVersion | assignmentCount | maxRoleVersion |
rolePermissionsHash | scopeHash | breakGlassSessionId
```

| Invalidation event | Hash component changed |
|--------------------|------------------------|
| Role assignment / removal | `accessVersion`, assignment count, role permission hash |
| Role permission edit | `maxRoleVersion`, role permission hash |
| User deactivation | `isActive` (`users.is_active`) |
| Break-glass activate/deactivate | `breakGlassSessionId` |
| Scope grant (Phase 4) | `scopeHash` |

### User suspension

| Field | Status |
|-------|--------|
| **`users.is_active`** | **Canonical.** Enforced in `authMiddleware` on every request. |
| **`users.suspended_at`** | Not in schema. Hash placeholder `null` until future migration. |
| **`suspendUser()`** | No dedicated function. Deactivation = `is_active=false`. |

`users.access_version` increments on assignment mutations (Phase 2) — included in hash.

---

## JWT Changes

```json
{
  "sub": "<userId>",
  "tenantId": "<tenantId>",
  "role": "<legacyRole>",
  "sessionType": "standard",
  "av": "<composite-access-version-hash>"
}
```

- **`av` omitted** when `RBAC_V2_AUTHORIZATION_ENGINE=false` at login (backward compatible).
- **`av` present** when engine enabled at token issue.
- **Engine enabled:** `av` **required** on every request → missing or stale → **401 `TOKEN_STALE`**.
- **Engine disabled:** tokens without `av` remain valid until expiry.

---

## Feature Flags

| Env | Default | Effect |
|-----|---------|--------|
| `RBAC_V2_AUTHORIZATION_ENGINE` | `false` | Master switch for v2 resolve + av validation |

Requires Phase 2 flags for full RBAC v2 stack:

- `RBAC_V2_ROLE_MANAGEMENT=true`
- `RBAC_V2_BREAK_GLASS=true` (optional, for break-glass av path)

---

## Break-Glass Integration

When `sessionType=break_glass`:

1. Session validated via `validateBreakGlassSession`
2. Permissions from full catalog (`rbacCatalogPermissions.ts`)
3. `breakGlassSessionId` included in composite hash
4. `breakGlassExpiresAt` from `break_glass_sessions.expires_at` on `EffectiveAccessContext`
5. `isBreakGlass=true` on `EffectiveAccessContext`
6. Metric `RBAC_V2_BREAK_GLASS` emitted

---

## Observability

| Metric code | When |
|-------------|------|
| `RBAC_V2_PERMISSION_CHECK` | Successful v2 permission check |
| `RBAC_V2_DENY` | Insufficient permission (403 path) |
| `RBAC_V2_STALE_AV` | JWT `av` mismatch |
| `RBAC_V2_BREAK_GLASS` | Break-glass session active/expired |

No permission keys or PII in log metadata beyond tenant/user ids already used elsewhere.

---

## API

| Method | Path | Flag | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/rbac/effective-context` | Engine on | Returns resolved context for **authenticated user only** |

**Access rules (A5.1.3.1):**

- Authentication required (Bearer JWT).
- Returns **current user** context only — no `userId` query parameter.
- No admin lookup of another user's effective permissions.
- Rejects `?userId=` with **400 INVALID_QUERY**.

---

## Testing

```powershell
cd backend
node --import tsx --test src/auth/rbacAuthorizationEngine.test.ts src/modules/rbac/routes/effectiveContextPolicy.test.ts src/modules/rbac/services/rbacBreakGlassService.test.ts
```

### Test inventory (exact counts)

| Category | Tests |
|----------|------:|
| Permission resolver | 5 |
| Permission evaluator | 2 |
| Access version (`av`) | 9 |
| Feature flags / authorization mode | 3 |
| Break-glass | 7 |
| effective-context endpoint | 6 |
| **Total** | **31** |

---

## Rollback Plan

See [`RBAC_V2_ENGINE_ENABLEMENT.md`](./RBAC_V2_ENGINE_ENABLEMENT.md) §Rollback Plan.

1. Set `RBAC_V2_AUTHORIZATION_ENGINE=false` — immediate return to legacy authorization.
2. Tokens without `av` work again.
3. No schema rollback required.

---

## Validation Checklist

| Scenario | Expected |
|----------|----------|
| Role assignment change | New hash → stale `av` → 401 |
| Role removal | Same |
| Role archive (assignments deactivated) | Same |
| User suspension (`is_active=false`) | 401 on next request |
| Break-glass activation | New hash with session id; `breakGlassExpiresAt` set |
| Break-glass expiry | 401 `BREAK_GLASS_EXPIRED` / stale av |
| effective-context with `?userId=` | 400 INVALID_QUERY |

---

## Deferred (Out of Scope)

- `rbac_user_data_scopes` in hash (Phase 4) — empty scope hash placeholder
- `users.suspended_at` column — null placeholder until schema added
- Route-level cutover to `requirePermissionV2` only (A5.1.6)
- Client socket `rbac_access` invalidation listener (recommended follow-up)

---

*End of A5.1.3 implementation report.*

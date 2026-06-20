# RBAC V2 Authorization Engine — Enablement Procedure

**Phase:** A5.1.3 / A5.1.3.1  
**Audience:** Platform operators, release engineers  
**Authority:** [`A5_1_3_IMPLEMENTATION_REPORT.md`](./A5_1_3_IMPLEMENTATION_REPORT.md), [`A5_1_3_1_IMPLEMENTATION_REPORT.md`](./A5_1_3_1_IMPLEMENTATION_REPORT.md)

---

## Prerequisites

Before enabling the authorization engine:

| Prerequisite | Env var | Required |
|--------------|---------|----------|
| Phase 2 role management | `RBAC_V2_ROLE_MANAGEMENT=true` | **Yes** |
| Break-glass (optional) | `RBAC_V2_BREAK_GLASS=true` | Only if break-glass is used |
| Staging validation | — | Run engine tests on staging first |

---

## Feature Flag Enablement

### Staging

1. Set in `.env.staging` (or deployment environment):

   ```env
   RBAC_V2_ROLE_MANAGEMENT=true
   RBAC_V2_AUTHORIZATION_ENGINE=true
   ```

2. Restart the API server (port **3001**).

3. Verify health: `GET http://127.0.0.1:3001/health`

4. Confirm effective-context (authenticated):

   ```http
   GET /api/v1/rbac/effective-context
   Authorization: Bearer <token-with-av>
   ```

   Expected: **200** with `roleVersionHash`, `permissions`, optional `breakGlassExpiresAt`.

### Production

1. Complete staging soak (see checklist below).
2. Set in `.env.production`:

   ```env
   RBAC_V2_ROLE_MANAGEMENT=true
   RBAC_V2_AUTHORIZATION_ENGINE=true
   ```

3. Restart production API (port **3000**).
4. Monitor `RBAC_V2_STALE_AV`, `RBAC_V2_DENY`, and auth 401 rates.

---

## Forced Re-Login

When the engine is **enabled**, all access tokens **must** include a valid JWT `av` (access version) claim.

| Token state | Engine off | Engine on |
|-------------|------------|-----------|
| No `av` claim | Valid until expiry | **401 `TOKEN_STALE`** |
| Stale `av` (role/assignment changed) | N/A | **401 `TOKEN_STALE`** |
| Matching `av` | Valid | Valid |

**Enablement steps:**

1. Enable `RBAC_V2_AUTHORIZATION_ENGINE=true` on the API.
2. **All users must sign out and sign back in** (or wait for natural session expiry).
3. Login, MFA completion, and break-glass activation all issue fresh tokens with current `av`.

There is no silent backfill of `av` onto existing sessions. Plan a maintenance window or user communication if enabling on a live tenant.

---

## Token Refresh

| Event | Action |
|-------|--------|
| Standard login | `loginSessionService` issues JWT with `av` when engine enabled |
| MFA step-up | `mfaRoutes` issues JWT with `av` when engine enabled |
| Break-glass activate | `rbacBreakGlassService` issues break-glass JWT with `av` |
| Role assignment change | `users.access_version` increments → hash changes → existing tokens stale |
| User deactivation (`is_active=false`) | Next request **401** at auth middleware (before permission check) |
| Break-glass expiry | **401 `BREAK_GLASS_EXPIRED`** or stale `av` |

**Client guidance:** On **401 `TOKEN_STALE`**, redirect to login. Do not retry with the same token.

---

## Rollback Plan

Immediate rollback (no schema change required):

1. Set `RBAC_V2_AUTHORIZATION_ENGINE=false`.
2. Restart API.
3. Legacy authorization resumes:
   - `requirePermission` uses module resolver + legacy role matrix.
   - Tokens without `av` work again.
   - `GET /rbac/effective-context` returns **503 FEATURE_DISABLED**.

**No database rollback** is required. Phase 2 schema (`access_version`, RBAC tables) remains compatible.

If routes were migrated to `requirePermissionV2` only (A5.1.6), revert those routes to `requirePermission` before disabling the engine — `requirePermissionV2` returns **503 AUTH_MISCONFIGURED** when the flag is off.

---

## Staging Soak Checklist

- [ ] Fresh login receives JWT with `av` claim
- [ ] `GET /rbac/effective-context` returns current user context only
- [ ] Role assignment change invalidates prior token (`TOKEN_STALE`)
- [ ] User deactivation blocks next request
- [ ] Break-glass session includes `breakGlassExpiresAt` in effective context
- [ ] No route stacks `requirePermission` + `requirePermissionV2` on the same handler
- [ ] `npm run test:staging` smoke pass on critical flows

---

## Related Flags (Do Not Confuse)

| Flag | Purpose |
|------|---------|
| `RBAC_V2_ROLE_MANAGEMENT` | Phase 2 — custom roles, assignments, SoD |
| `RBAC_V2_AUTHORIZATION_ENGINE` | Phase 3 — runtime v2 resolve + `av` enforcement |
| `RBAC_V2_BREAK_GLASS` | Phase 2 C2 — break-glass sessions |
| `RBAC_V2_ROLE_MANAGEMENT_UI` | Frontend role management panel |

---

*End of enablement procedure.*

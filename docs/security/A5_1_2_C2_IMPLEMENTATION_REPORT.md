# A5.1.2 C2 — Break-Glass Implementation Report

**Phase:** A5.1.2 C2 — SYSTEM_OWNER break-glass sessions  
**Date:** 2026-06-19  
**Authority:** [`RBAC_2_ARCHITECTURE_V2.md`](./RBAC_2_ARCHITECTURE_V2.md) §4.6

---

## Summary

Implements vendor-gated, MFA-required, time-boxed **break-glass sessions** that grant full catalog permissions with `actor_type = system_owner` audit attribution. Behind **`RBAC_V2_BREAK_GLASS=true`** (requires **`RBAC_V2_ROLE_MANAGEMENT=true`**).

---

## Schema (migration 134)

| Table | Purpose |
|-------|---------|
| `platform_break_glass_capabilities` | Vendor-controlled activation allow-list (max 2 users/tenant) |
| `break_glass_sessions` | Active/expired session rows |
| `rbac_audit_log` extensions | `session_id`, `ip_address`, `user_agent` |

---

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/rbac/break-glass/status` | Standard JWT | Current user's active session |
| `POST` | `/api/v1/rbac/break-glass/activate` | Standard JWT + MFA | Returns short-lived break-glass JWT |
| `POST` | `/api/v1/rbac/break-glass/deactivate` | Standard or break-glass JWT | End session early |

**Activate body:** `{ totpCode?, recoveryCode?, durationMinutes? }` — default **15 min**, max **60 min**.

**Errors:** `CAPABILITY_DENIED`, `MFA_REQUIRED`, `MFA_INVALID`, `SESSION_ALREADY_ACTIVE`, `BREAK_GLASS_EXPIRED`.

---

## Session lifecycle

1. User must appear in `platform_break_glass_capabilities` (`revoked_at IS NULL`).
2. MFA must be enabled; TOTP/recovery verified at activation.
3. Max **1 active session per tenant** (another user's session blocks activation).
4. Session row created; `BREAK_GLASS_ACTIVATED` audit with `actor_type=system_owner`, IP, UA.
5. Short JWT issued: `sessionType: break_glass`, `breakGlassSessionId`.
6. `authMiddleware` validates session row + grants **all catalog permissions**.
7. RBAC security mutations audit with `actor_type=system_owner` when `sessionType=break_glass`.
8. Expiry (JWT TTL + DB `expires_at`) or manual deactivate → `BREAK_GLASS_EXPIRED`.

---

## Feature flags

| Env | Default | Purpose |
|-----|---------|---------|
| `RBAC_V2_BREAK_GLASS` | `false` | Enable break-glass API |
| `VITE_RBAC_V2_BREAK_GLASS` | `false` | Show break-glass banner in client |

---

## Vendor capability grant (dev/staging)

```powershell
node scripts/grant-break-glass-capability.mjs --tenant pakland --user admin@example.com --env staging
```

Tenants **cannot** self-grant capability (no Settings UI, no RBAC permission key).

---

## Files added

- `database/migrations/134_break_glass_sessions.sql`
- `backend/src/modules/rbac/repositories/BreakGlassRepository.ts`
- `backend/src/modules/rbac/services/rbacBreakGlassService.ts`
- `backend/src/modules/rbac/routes/breakGlassRoutes.ts`
- `backend/src/modules/rbac/services/rbacAuditMeta.ts`
- `backend/src/modules/rbac/services/rbacCatalogPermissions.ts`
- `backend/src/utils/requestContext.ts`
- `backend/src/modules/rbac/services/rbacBreakGlassService.test.ts`
- `services/api/breakGlassApi.ts`
- `hooks/useBreakGlassSession.ts`
- `components/security/BreakGlassBanner.tsx`
- `scripts/grant-break-glass-capability.mjs`

---

## Testing

```powershell
cd backend
node --import tsx --test src/modules/rbac/services/rbacBreakGlassService.test.ts src/modules/rbac/services/rbacV2Validation.test.ts src/modules/rbac/services/rbacV2SecurityClosure.test.ts
```

---

## Enable for staging test

```powershell
# .env.staging
RBAC_V2_ROLE_MANAGEMENT=true
RBAC_V2_BREAK_GLASS=true

# Client
VITE_RBAC_V2_ROLE_MANAGEMENT=true
VITE_RBAC_V2_BREAK_GLASS=true

npm run db:migrate:staging
node scripts/grant-break-glass-capability.mjs --tenant <id> --user <email> --env staging
```

---

*End of A5.1.2 C2 report.*

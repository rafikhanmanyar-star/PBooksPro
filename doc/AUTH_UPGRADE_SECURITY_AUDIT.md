# Authentication Upgrade — Security Audit Report

**Date:** 2026-06-12  
**Scope:** Email-based global login identity (Desktop + Cloud)

## Summary

Authentication now uses a **globally unique email** as the primary identity. Usernames remain optional display labels within an organization. Password verification, MFA, organization approval, and license checks are unchanged in enforcement order.

## Identity & Uniqueness

| Control | Implementation |
|--------|----------------|
| Global email uniqueness | PostgreSQL partial unique index `idx_users_email_global_lower` (migration 099); SQLite equivalent on desktop |
| Email normalization | Lowercase + trim via `normalizeUserEmail` / `userIdentityService` |
| New user email required | `POST /users` validates `z.string().email()`; conflicts return HTTP 409 |
| Placeholder migration emails | `*@company.local` flagged `email_requires_update = TRUE` |

## Authentication Flow

1. Client sends `{ email, password }` to `POST /api/v1/auth/login`
2. `EmailPasswordProvider` resolves accounts by email only (username lookup removed post-migration)
3. Password verified with bcrypt; organization access and MFA policies applied before JWT issuance
4. Session payload includes `userId`, `email`, `organizationId`, `role`

## Login Audit

Existing `login_events` table records: email, tenant, user, IP (`x-forwarded-for` / socket), user agent, status (`success` / `failed`), timestamp. No regression introduced.

## Password Reset Framework

| Endpoint | Behavior |
|----------|----------|
| `POST /auth/forgot-password` | Rate-limited; always returns generic success (no account enumeration) |
| `POST /auth/reset-password` | Validates token hash, expiry, single use; enforces password policy |

Tokens stored as SHA-256 hashes. Raw tokens returned only in non-production when `PASSWORD_RESET_EMAIL_ENABLED` is false (development convenience).

## Email Verification (future-ready)

- Column: `users.email_verified` (default `FALSE`)
- Table: `email_verification_tokens` (schema only; sender not wired)

## Residual Risks & Recommendations

1. **Placeholder emails** — Administrators must replace `@company.local` addresses before enabling external email or SSO.
2. **JWT payload** — Still carries `sub`, `tenantId`, `role` only; email is in API user object. Consider adding `email` claim when rotating JWT format.
3. **Desktop offline reset** — No SMTP; reset remains administrator-mediated via User Management.
4. **Google / Microsoft** — Provider slots reserved; not enabled. See `doc/AUTH_GOOGLE_LOGIN_READINESS.md`.

## Compliance Notes

- Passwords remain bcrypt-hashed; plaintext never stored
- Failed login attempts logged per organization when account email is known
- Rate limiting on login, forgot-password, and registration endpoints unchanged or strengthened

# Google Login Readiness Assessment

## Current state: **Prepared, not enabled**

### Provider architecture

```
backend/src/services/auth/providers/
├── types.ts              # AuthProvider interface, AuthCredentials union
├── EmailPasswordProvider.ts   # ✅ Implemented
├── index.ts              # getAuthProvider(), authenticateWithProvider()
└── (future) GoogleProvider.ts, MicrosoftProvider.ts
```

Registration pattern in `providers/index.ts`:

```typescript
const providers = {
  email_password: emailPasswordProvider,
  google: undefined,      // slot reserved
  microsoft: undefined,   // slot reserved
};
```

### Prerequisites already in place

| Requirement | Status |
|-------------|--------|
| Globally unique email per user | ✅ Migration 099 + 116 |
| `email_verified` column | ✅ Schema ready |
| Email verification token table | ✅ Schema ready |
| Session model includes email | ✅ Login user payload + `/auth/me` |
| Username decoupled from auth | ✅ Lookup by email only |

### Work remaining for Google Sign-In

1. **GoogleProvider** implementing `AuthProvider` — verify Google ID token, map `sub` + email to `users` row
2. **Account linking** — table or columns for `google_sub`, `auth_provider` per user
3. **UI** — enable "Login with Google" button (currently disabled placeholder on `ApiLoginScreen`)
4. **OAuth client IDs** — environment configuration per staging/production
5. **Email verification policy** — require `email_verified = TRUE` or trust Google `email_verified` claim
6. **Desktop** — Google login typically cloud-only; offline SQLite would remain email/password

### Recommended integration path

1. Implement `GoogleProvider.authenticate()` calling Google tokeninfo / JWKS
2. On first login: find user by email → link Google `sub`; else optional JIT provisioning behind feature flag
3. Issue same JWT / session path as `completeLoginForAccount`
4. Add `POST /auth/login/google` delegating to `authenticateWithProvider` with extended credential type

### Risk notes

- Placeholder `@company.local` accounts must not use Google until real email is set
- Multi-organization users: same email across tenants already deduplicated globally — company picker flow remains valid

**Verdict:** Architecture supports extension without redesign. Estimated incremental effort: provider implementation + OAuth config + UI enablement (no auth core rewrite).

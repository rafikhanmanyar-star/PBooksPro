# Cloud Edition — Email Auth Migration Report

## Applying the migration

```powershell
npm run db:migrate:staging    # pBookspro_Staging
npm run db:migrate:production # pbookspro
```

Migration file: `database/migrations/116_email_auth_upgrade.sql`  
Depends on: `099_users_global_login_identity_unique.sql`

## What the migration does

1. Adds `email_verified`, `email_requires_update` to `users`
2. Creates `password_reset_tokens`, `email_verification_tokens`, `auth_migration_reports`
3. Backfills missing emails to `{username}@company.local` with collision handling
4. Inserts a summary row into `auth_migration_reports` (`edition = cloud`)

## Preserved data

| Item | Status |
|------|--------|
| Users | Preserved |
| `password_hash` | Preserved |
| `user_tenants` memberships | Preserved |
| Roles / RBAC | Preserved |

## Post-migration verification

```sql
-- Users still missing email (should be zero)
SELECT id, username FROM users WHERE email IS NULL OR TRIM(email) = '';

-- Placeholders needing admin update
SELECT id, username, email FROM users WHERE email_requires_update = TRUE;

-- Duplicate emails (should return no rows)
SELECT LOWER(TRIM(email)), COUNT(*) FROM users
WHERE email IS NOT NULL AND TRIM(email) <> ''
GROUP BY 1 HAVING COUNT(*) > 1;

-- Latest migration report
SELECT * FROM auth_migration_reports ORDER BY run_at DESC LIMIT 1;
```

## API changes

| Endpoint | Change |
|----------|--------|
| `POST /auth/login` | Body: `{ "email", "password" }` (`username` deprecated) |
| `GET /auth/me` | Returns `id`, `email`, `username`, `fullName`, `organizationId`, `role` |
| `POST /auth/forgot-password` | `{ "email" }` |
| `POST /auth/reset-password` | `{ "token", "newPassword" }` |
| `POST /users` | `email` required |

## Staging test

After `db:seed:staging`, sign in with the seeded user's email (or placeholder if seed predates migration). Update seed scripts to set explicit emails where needed.

## Rollback

No automatic rollback. Restore database backup taken before migration if required. Removing unique index without deduplicating emails will fail.

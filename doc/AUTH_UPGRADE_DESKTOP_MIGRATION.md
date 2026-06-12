# Desktop Edition — Email Auth Migration Report

## Automatic migration

On first launch after upgrade:

1. SQLite schema version bumps to **24** (`services/database/schema.ts`)
2. `runEmailAuthMigrationSqlite` / `electron/emailAuthMigration.cjs` executes per company database
3. Users without email receive `{username}@company.local` (disambiguated if globally duplicate within that DB)
4. `email_requires_update = 1` marks placeholders for administrator review
5. Summary written to `auth_migration_reports` table (when available)

## Multi-company (Electron)

`companyManager.cjs` runs the same backfill when:

- Checking company credentials (`checkCredentials`)
- Signing in (`company:login`)

## Preserved data

| Item | Status |
|------|--------|
| User records | Preserved |
| Password hashes | Preserved |
| Roles & permissions | Preserved |
| Company databases | In-place ALTER; no re-install required |

## Default admin after upgrade

If the built-in admin had username `admin` and no email:

```
admin@company.local
```

(empty password behavior unchanged until administrator sets a password)

## Administrator actions

1. Open **Administration → Users**
2. Filter mentally for `@company.local` addresses
3. Set real email addresses (must remain globally unique within that company DB)
4. Communicate new sign-in email to each user

## Viewing migration report (SQLite)

```sql
SELECT * FROM auth_migration_reports ORDER BY run_at DESC LIMIT 5;
```

## Login UI changes

- Company login screen: **Email Address** + **Password**
- Legacy single-DB `LoginPage`: email-based (if used)
- **Forgot password** directs users to administrator (no SMTP in offline mode)

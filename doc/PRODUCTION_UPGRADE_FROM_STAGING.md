# Production Upgrade from Staging — Safe, Backward-Compatible Guide

This guide ensures **schema parity** between staging and production, **no data loss**, and **backward-compatible** upgrades when promoting staging to production.

---

## 1. Overview

- **Goal:** Upgrade production from staging after many changes, with both databases having the same schema.
- **Principle:** All migrations run on startup are **additive only** (ADD COLUMN, CREATE TABLE IF NOT EXISTS). No `DROP TABLE`, `DROP COLUMN`, or business-data `DELETE` in production.
- **Migrations** run automatically when the API starts (Render deploy). You do **not** run SQL manually unless a migration fails.

---

## 2. Migrations That Run Automatically on Startup

These run in `run-migrations-on-startup.ts` when the API starts (e.g. after deploy):

| Order | Migration | Purpose |
|-------|-----------|---------|
| 1 | `postgresql-schema.sql` | Base schema (tenants, users, accounts, etc.) |
| 2 | `add-payment-tables.sql` | payments, payment_webhooks, subscriptions |
| 3 | `add-bill-version-column.sql` | bills.version for optimistic locking |
| 4 | `add-p2p-tables.sql` | P2P, purchase_orders, p2p_invoices, p2p_bills, etc. |
| 5 | `add-target-delivery-date.sql` | purchase_orders.target_delivery_date |
| 6 | `add-user-id-to-transactions.sql` | transactions.user_id |
| 7 | (inline) | license_history.payment_id, audit_log user_id nullable, tenant supplier columns |
| 8 | `add-org-id-to-rental-agreements.sql` | rental_agreements.org_id |
| 9 | `add-contact-id-to-rental-agreements.sql` | rental_agreements.contact_id |
| 10 | `add-tasks-schema.sql` | tasks, task_updates, task_performance_* |
| 11 | `add-is-supplier-to-tenants.sql` | tenants.is_supplier |
| 12 | `add-whatsapp-integration.sql` | whatsapp_configs, whatsapp_messages |
| 13 | `increase-max-users-to-20.sql` | max_users 5 → 20 |
| 14 | `add-installment-plan-fields.sql` | installment_plans fields + status |
| 15 | `add-sale-recognized-status.sql` | installment_plans status 'Sale Recognized' |
| 16 | `add-installment-plan-to-project-agreements.sql` | project_agreements.installment_plan |
| 17 | `add-unit-fields.sql` | units.type, units.area, units.floor |

All of these use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` or equivalent, so they are **idempotent** and safe to run multiple times.

---

## 3. Migrations That Must **NEVER** Run on Production

These migrations **drop tables**, **delete data**, or **recreate schemas**. They must **never** be run against the production database.

| File | Risk |
|------|------|
| `remove-payroll-tables.sql` | DROPs payroll tables (payslips, payroll_cycles, etc.) |
| `remove-payroll-departments-table.sql` | DROPs payroll_departments |
| `remove-payroll-test-data.sql` | DELETEs payroll_employees, payroll_runs, payslips |
| `recreate-tasks-schema.sql` | DROPs tasks / task_updates / task_performance_* and recreates |
| `debug-whatsapp-verify-token.sql` | DELETE FROM whatsapp_configs |

They are **not** invoked by the migration runner. Do not run them manually on production.

**Payroll schema:** If production has **legacy** payroll tables (`payroll_cycles`, `payslips`, `employees`, etc.) and staging uses the **new** payroll schema (`payroll_runs`, `payroll_employees`, etc.), we do **not** run `remove-payroll-*` or `add-payroll-*` on production to avoid data loss. Staging and production may differ on payroll tables; that is intentional.

---

## 4. Pre-Upgrade Checklist

Before merging staging → production:

- [ ] **Staging tested:** All critical flows (login, registration, P2P, tasks, WhatsApp, etc.) work on staging.
- [ ] **Backup production DB:** Use Render Dashboard → Database → Backups, or `pg_dump` if you have direct access.
- [ ] **Clean git state:** No uncommitted changes. `git status` is clean.
- [ ] **Staging up to date:** `git checkout staging && git pull origin staging`.
- [ ] **Production DB reachable:** Health check and API work against production (optional but recommended).

---

## 5. Upgrade Steps

### Option A: Use the merge script (recommended)

```powershell
.\merge-to-production.ps1
```

This will:

1. Check for uncommitted changes  
2. Update `staging` and create a backup tag on `main`  
3. Merge `staging` into `main`  
4. Push `main` and tags  

### Option B: Manual git flow

```powershell
git checkout staging
git pull origin staging

git checkout main
git pull origin main
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
git tag "backup-before-merge-$ts"
git merge staging --no-ff -m "Merge staging to production: $ts"
git push origin main
git push origin --tags
```

### After merge

1. **Deploy:** Render (or your host) deploys from `main`. The API restarts.
2. **Migrations:** On startup, the API runs all migrations in §2 against the **production** database. No manual SQL.
3. **Verify:** See §6.

---

## 6. Post-Upgrade Verification

### 6.1 Server logs

Check API startup logs for:

```
✅ Database migrations completed successfully
✅ Payment tables migration completed
✅ P2P migration completed
…
✅ org_id migration completed
✅ contact_id migration completed
```

Any `⚠️ … already exists (skipping)` is normal for already-migrated DBs.

### 6.2 Rental agreements migration

```bash
cd server
npm run verify-rental-migration
```

Expect:

```
✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY
   - org_id column exists with all constraints and indexes
   - contact_id column exists with all constraints and indexes
   ...
```

### 6.3 Schema verification (optional)

To compare staging vs production schema (tables, columns):

```bash
cd server
npm run verify-schema-parity
```

Requires `DATABASE_URL` (staging) and `PRODUCTION_DATABASE_URL` in `.env`. See §7.

### 6.4 Generate and run production upgrade SQL (when production is behind)

If production is **not fully upgraded** and missing tables/columns that staging has:

```bash
cd server
npm run generate-production-upgrade        # generate SQL only
npm run generate-production-upgrade -- --run   # generate + run on production (prompt)
```

This compares staging vs production, writes `migrations/production-upgrade-from-staging.sql` (additive only), and optionally runs it on production. **Backup production first.** See `doc/PRODUCTION_UPGRADE_SCRIPT.md`.

### 6.5 Smoke tests

- [ ] `GET /health` → `{"status":"ok","database":"connected"}`
- [ ] Login (admin and tenant users)
- [ ] Key APIs: e.g. rental agreements, transactions, tasks, P2P, WhatsApp (as applicable)

---

## 7. Schema Parity Verification Script

A script `verify-schema-parity` (see `server/scripts/verify-schema-parity.ts`) compares **staging** and **production**:

- Same tables in `public`
- Same columns per table (name, type, nullable)
- Reports missing tables/columns in production vs staging

**Usage:**

1. Set in `.env` (or environment):
   - `DATABASE_URL` = staging DB URL  
   - `PRODUCTION_DATABASE_URL` = production DB URL  
2. Run:

   ```bash
   cd server
   npm run verify-schema-parity
   ```

Run **before** upgrade (to see what will change) and **after** (to confirm parity).

---

## 8. Backward Compatibility and Data Safety

- **No destructive migrations in startup:** Only additive changes (new tables, new columns, new indexes, constraint updates that add allowed values).
- **Existing rows preserved:** `ADD COLUMN IF NOT EXISTS` with defaults where needed; backfills (e.g. `org_id`, `contact_id`) use `UPDATE`, not `DELETE`.
- **user_sessions cleanup:** The base schema may deduplicate `user_sessions` (keep newest per user/tenant). This removes duplicate sessions only, not business data.
- **Rollback:** If you need to revert, use the backup tag and restore the DB from your pre-upgrade backup. See §9.

---

## 9. Rollback

If something goes wrong after the upgrade:

1. **Code rollback:**

   ```powershell
   git revert -m 1 <merge-commit-hash>
   git push origin main
   ```

   Then redeploy so production runs the previous code.

2. **Database rollback:** Restore the production database from the backup you created in §4. Migrations are additive, but if you need to undo schema changes, restore is the safe option.

3. **Backup tag:**

   ```powershell
   git checkout backup-before-merge-YYYYMMDD-HHMMSS
   git checkout -b hotfix-rollback
   git push origin hotfix-rollback
   ```

   Use this to restore or compare the pre-merge codebase.

---

## 10. Summary

| Topic | Action |
|-------|--------|
| **Schema parity** | Same code + same migrations on both environments. Startup migrations are additive and idempotent. |
| **No data loss** | No `DROP TABLE` / `DROP COLUMN` / business `DELETE` in production. Never run `remove-*`, `recreate-tasks-schema`, or `debug-whatsapp-verify-token` on production. |
| **Backward compatibility** | New columns have defaults or are nullable; existing APIs continue to work. |
| **Upgrade process** | Merge staging → main, deploy, let migrations run on startup, then verify. |
| **Safety** | Backup production first; use `verify-schema-parity` and `verify-rental-migration` to confirm. |

---

**Last updated:** 2026-01-24

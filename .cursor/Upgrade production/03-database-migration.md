# Database Migration — Production Upgrade

How database schema is updated when upgrading production from staging.

---

## 1. Automatic migrations (on startup)

Migrations run when the API starts (e.g. after Render deploy). See `server/scripts/run-migrations-on-startup.ts`.

**Order (examples):**

1. `postgresql-schema.sql`
2. `add-payment-tables.sql`
3. `add-bill-version-column.sql`
4. `add-p2p-tables.sql`
5. `add-target-delivery-date.sql`
6. `add-user-id-to-transactions.sql`
7. Inline: `license_history.payment_id`, audit_log `user_id` nullable
8. `add-org-id-to-rental-agreements.sql`
9. `add-contact-id-to-rental-agreements.sql`
10. `add-tasks-schema.sql`
11. `add-is-supplier-to-tenants.sql`
12. `add-whatsapp-integration.sql`
13. `increase-max-users-to-20.sql`
14. `add-installment-plan-fields.sql`
15. `add-sale-recognized-status.sql`
16. `add-installment-plan-to-project-agreements.sql`
17. `add-unit-fields.sql`

All use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — idempotent and safe to re-run.

---

## 2. Generate custom migration (optional)

When staging has tables/columns production does not:

```bash
cd server
npm run generate-production-upgrade
```

- Reads `DATABASE_URL` (staging) and `PRODUCTION_DATABASE_URL`
- Outputs `migrations/production-upgrade-from-staging.sql`
- Additive only: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`

**Run on production (with prompt):**

```bash
cd server
npm run generate-production-upgrade -- --run
```

---

## 3. Manual run of generated SQL

```bash
# 1. Backup production first
# 2. Review migrations/production-upgrade-from-staging.sql
# 3. Run
psql "$PRODUCTION_DATABASE_URL" -f server/migrations/production-upgrade-from-staging.sql
```

---

## 4. Migrations never run on production

| File | Risk |
|------|------|
| `remove-payroll-tables.sql` | DROPs payroll tables |
| `remove-payroll-departments-table.sql` | DROPs payroll_departments |
| `remove-payroll-test-data.sql` | DELETEs payroll data |
| `recreate-tasks-schema.sql` | DROPs tasks and recreates |
| `debug-whatsapp-verify-token.sql` | DELETE FROM whatsapp_configs |

Do **not** run these manually on production.

---

## 5. Verification scripts

```bash
cd server

# Schema parity (staging vs production)
npm run verify-schema-parity

# Rental agreements migration
npm run verify-rental-migration
```

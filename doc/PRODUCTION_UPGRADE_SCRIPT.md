# Production Upgrade Script (Staging vs Production)

This doc describes how to **compare** staging and production cloud databases and **generate** (and optionally **run**) a SQL script that adds **missing tables and columns** to production so it matches staging. Additive only, no `DROP`/`DELETE`.

---

## 1. Script: `generate-production-upgrade-from-staging`

**Location:** `server/scripts/generate-production-upgrade-from-staging.ts`

**What it does:**

- Connects to **staging** (source) and **production** (target) using `DATABASE_URL` and `PRODUCTION_DATABASE_URL`.
- Compares tables and columns.
- Finds:
  - **Tables in staging but missing in production** → generates `CREATE TABLE IF NOT EXISTS` from staging.
  - **Columns in staging but missing in production** (for tables that exist in both) → generates `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Writes SQL to `server/migrations/production-upgrade-from-staging.sql`.
- Optionally runs that SQL on production when used with `--run` (after a confirmation prompt).

**Output:** Additive, idempotent migration. Safe to re-run.

---

## 2. Prerequisites

- **Node** (and `npm`) in `server/`.
- **Env vars** (e.g. in `server/.env` or project `.env`):
  - `DATABASE_URL` or `STAGING_DATABASE_URL` → staging DB URL.
  - `PRODUCTION_DATABASE_URL` → production DB URL.

Use **external** DB URLs (e.g. Render “External Database URL”) so the script can reach both DBs.

---

## 3. Usage

### Generate SQL only (no execution)

```bash
cd server
npm run generate-production-upgrade
```

This:

1. Connects to staging and production.
2. Prints a **comparison** (missing tables/columns in production).
3. Writes `migrations/production-upgrade-from-staging.sql`.

### Generate and run on production (with prompt)

```bash
cd server
npm run generate-production-upgrade -- --run
```

Same as above, plus a prompt: **Run this migration on PRODUCTION now? [y/N]**  
Answer `y` to execute the generated SQL against production.

---

## 4. Manual run of the generated SQL

1. **Back up production** (e.g. Render backups or `pg_dump`).
2. Review `server/migrations/production-upgrade-from-staging.sql`.
3. Run it against production, e.g.:

   ```bash
   psql "$PRODUCTION_DATABASE_URL" -f server/migrations/production-upgrade-from-staging.sql
   ```

   Or use your DB UI (DBeaver, etc.) to run the file.

---

## 5. Typical output

Example:

```
=== COMPARISON (staging vs production) ===
Staging: 53 tables, Production: 57 tables

Tables in STAGING but MISSING in PRODUCTION:
  - payroll_departments
  - payroll_employees
  - ...

Tables in PRODUCTION but not in staging (legacy, unchanged):
  - attendance_records
  - employees
  - ...

Columns in STAGING but MISSING in PRODUCTION:
  payslips: payroll_run_id, basic_pay, ...

=== GENERATED ===
Migration written to: .../production-upgrade-from-staging.sql
  Tables to create: 6
  Columns to add:   10
```

- **Missing in production:** what the script will add (tables/columns).
- **Extra in production:** legacy tables left as-is; no drops.

---

## 6. Notes

- **Additive only:** no `DROP TABLE`, `DROP COLUMN`, or `DELETE`. Existing production data is not removed.
- **Idempotent:** uses `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` and guard clauses. Safe to run multiple times.
- **Legacy payroll:** Production may keep old payroll tables (`payroll_cycles`, `employees`, etc.). The script adds **new** payroll_* tables and **new** columns (e.g. on `payslips`) from staging. Both old and new can coexist.
- **Order:** Missing tables are created in dependency order when possible; on circular FKs, creation order falls back to alphabetical.
- **Verification:** Use `npm run verify-schema-parity` before and after to confirm staging vs production schema alignment.

---

## 7. See also

- `doc/PRODUCTION_UPGRADE_FROM_STAGING.md` — full upgrade flow (backup, merge, deploy, verify).
- `server/migrations/README.md` — list of migrations and “never run on production” files.

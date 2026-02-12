# Staging vs Production DB Schema Comparison

**Last compared:** 2026-02-12  
**Goal:** Production DB schema must match staging.

## Current summary

| Metric   | Staging | Production |
|----------|---------|-------------|
| Tables   | 114     | 114        |

Production has the same tables as staging. No tables or columns are missing in production.

## Differences (current)

### Production has everything staging has
- All 114 tables exist in both.
- Every column that exists in staging exists in production.

### Extra in production only (legacy – not in staging)

These **columns** exist in production but not in staging. Dropping them would make the schemas identical but is optional and data-destructive.

**Table: `payslips`** (38 extra columns in production):
- user_id, payroll_cycle_id, month, issue_date, pay_period_start, pay_period_end  
- basic_salary, allowances, bonuses, total_bonuses, overtime, total_overtime  
- commissions, total_commissions, deductions, tax_deductions, total_tax  
- statutory_deductions, total_statutory, loan_deductions, total_loan_deductions  
- gross_salary, taxable_income, net_salary, cost_allocations  
- is_prorated, proration_days, proration_reason, status  
- paid_amount, payment_date, payment_account_id  
- generated_at, generated_by, approved_at, approved_by, notes, snapshot  

**Table: `tasks`** (3 extra columns in production):
- text, completed, priority  

To make production match staging exactly, use the drop-production-only-columns script (see below).

## Removing extra columns from production

To drop columns that exist in production but **not** in staging (e.g. legacy payslips/tasks columns):

1. **Back up production** before running (data in these columns will be lost).
2. **Dry run** (generates SQL only, does not execute):
   ```bash
   cd server
   npm run drop-production-only-columns
   ```
   Review `server/migrations/drop-production-only-columns.sql`.
3. **Execute on production** (prompts for confirmation):
   ```bash
   npm run drop-production-only-columns -- --run
   ```
   Type `yes` when prompted.

## Migration to add missing items (when production was behind)

When production lacked tables/columns that staging had, the upgrade script was used:

**File:** `server/migrations/production-upgrade-from-staging.sql`

**How to apply** (only if parity check reports “missing in production”):

1. **Back up production.**
2. **Option A:** `cd server && npm run generate-production-upgrade -- --run` (then answer `y` when prompted).
3. **Option B:** `psql $PRODUCTION_DATABASE_URL -f server/migrations/production-upgrade-from-staging.sql`
4. Re-run: `npm run verify-schema-parity`

## Removing extra tables from production

To drop tables that exist in production but **not** in staging (e.g. legacy payroll tables):

1. **Back up production** before running.
2. **Dry run** (generates SQL only, does not execute):
   ```bash
   cd server
   npm run drop-production-only-tables
   ```
   Review `server/migrations/drop-production-only-tables.sql`.
3. **Execute on production** (prompts for confirmation):
   ```bash
   npm run drop-production-only-tables -- --run
   ```
   Type `yes` when prompted to run the script on production.

The script uses `DROP TABLE ... CASCADE` so dependent objects (e.g. foreign keys, views) are dropped as well.

## Re-running the comparison

- **Verify parity only:**  
  `cd server && npm run verify-schema-parity`
- **Regenerate migration from current staging:**  
  `cd server && npm run generate-production-upgrade`
- **Generate script to drop production-only tables:**  
  `cd server && npm run drop-production-only-tables`
- **Generate script to drop production-only columns:**  
  `cd server && npm run drop-production-only-columns`

Requires `DATABASE_URL` (staging) and `PRODUCTION_DATABASE_URL` (production) in `server/.env`.

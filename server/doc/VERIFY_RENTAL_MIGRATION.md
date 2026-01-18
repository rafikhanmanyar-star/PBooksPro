# Verify Rental Agreements Migration

This guide helps you verify that the rental agreements migration has completed successfully after deploying to production.

## Quick Verification

After deploying to production, run:

```bash
cd server
npm run verify-rental-migration
```

Or directly:

```bash
npx tsx scripts/verify-rental-agreements-migration.ts
```

## What the Script Checks

The verification script checks:

### 1. Column Existence
- ✅ `org_id` column exists
- ✅ `contact_id` column exists  
- ⚠️ `tenant_id` column should NOT exist (legacy)

### 2. Constraints
- ✅ Unique constraint on `(org_id, agreement_number)`
- ✅ Foreign key constraint on `org_id` → `tenants(id)`
- ✅ Foreign key constraint on `contact_id` → `contacts(id)`

### 3. Indexes
- ✅ Index on `org_id` (`idx_rental_agreements_org_id`)
- ✅ Index on `contact_id` (`idx_rental_agreements_contact_id`)

### 4. Data Integrity
- ✅ No NULL `org_id` values
- ✅ No NULL `contact_id` values
- ✅ All `contact_id` values reference valid contacts
- ✅ Total row count

## Expected Output

### ✅ Success Output
```
🔍 Verifying rental_agreements migration status...

✅ rental_agreements table exists

📋 Column Status:
   org_id: ✅ EXISTS
   contact_id: ✅ EXISTS
   tenant_id: ✅ NOT FOUND (expected)

🔗 Constraint Status:
   org_id unique (org_id, agreement_number): ✅ EXISTS
   org_id foreign key: ✅ EXISTS
   contact_id foreign key: ✅ EXISTS

📊 Index Status:
   idx_rental_agreements_org_id: ✅ EXISTS
   idx_rental_agreements_contact_id: ✅ EXISTS

📊 Data Integrity:
   Total rental agreements: 10
   NULL org_id values: 0 ✅
   NULL contact_id values: 0 ✅
   Invalid contact_id references: 0 ✅

📋 Migration Status Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ALL MIGRATIONS COMPLETED SUCCESSFULLY
   - org_id column exists with all constraints and indexes
   - contact_id column exists with all constraints and indexes
   - No legacy tenant_id column
   - All data integrity checks passed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### ⚠️ Issues Detected Output
```
📋 Migration Status Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  MIGRATION INCOMPLETE OR ISSUES DETECTED
   ❌ org_id column is missing - run add-org-id-to-rental-agreements.sql
   ❌ contact_id constraints/indexes are missing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Manual Verification (Alternative)

If you prefer to check manually using SQL:

```sql
-- Check columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'rental_agreements'
ORDER BY ordinal_position;

-- Check constraints
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'rental_agreements';

-- Check indexes
SELECT indexname
FROM pg_indexes
WHERE tablename = 'rental_agreements';

-- Check data integrity
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE org_id IS NULL) as null_org_ids,
  COUNT(*) FILTER (WHERE contact_id IS NULL) as null_contact_ids,
  COUNT(*) FILTER (WHERE org_id IS NOT NULL AND contact_id IS NOT NULL) as complete_records
FROM rental_agreements;
```

## Troubleshooting

### If org_id is missing:
Run the migration manually:
```bash
psql $DATABASE_URL -f server/migrations/add-org-id-to-rental-agreements.sql
```

### If contact_id is missing:
Run the migration manually:
```bash
psql $DATABASE_URL -f server/migrations/add-contact-id-to-rental-agreements.sql
```

### If there are NULL values:
This might indicate data migration didn't complete. Check:
- Are there rental agreements with `tenant_id` that weren't migrated?
- Do you need to manually backfill the data?

## Environment Variables

The script uses `DATABASE_URL` from environment variables. Make sure it's set:

```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
```

For production on Render, the `DATABASE_URL` is automatically set in the environment.

## Exit Codes

- `0` - All checks passed ✅
- `1` - Issues detected or errors occurred ❌

This makes it suitable for CI/CD pipelines and automated checks.

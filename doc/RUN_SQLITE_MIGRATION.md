# Running SQLite Migration: tenant_id → contact_id

This guide explains how to run the migration that renames `tenant_id` to `contact_id` in the `rental_agreements` table for local SQLite databases.

## What This Migration Does

- Renames `rental_agreements.tenant_id` column to `contact_id`
- Preserves all existing data
- Updates foreign key constraints
- Recreates indexes

## Method 1: Automatic Migration (Recommended)

The migration will run automatically when the app loads if:
1. The database is initialized
2. The `rental_agreements` table exists
3. The table has `tenant_id` column but not `contact_id`

The migration is integrated into the database initialization process.

## Method 2: Manual Migration via Browser Console

If you need to run it manually:

1. Open your browser's Developer Console (F12)
2. Navigate to the Console tab
3. Run this code:

```javascript
// Import the migration function
const { runRentalTenantIdToContactIdMigration } = await import('./services/database/migrations/migrate-rental-tenant-id-to-contact-id.js');

// Run the migration
const result = await runRentalTenantIdToContactIdMigration();
console.log(result);
```

Expected output:
```
✅ Successfully migrated tenant_id to contact_id in rental_agreements table
```

## Method 3: Using Node.js Script (Development)

If you're running the app in a Node.js environment:

```bash
npx ts-node scripts/run-rental-migration.ts
```

## Verification

After running the migration, verify it worked:

1. Open browser DevTools → Application → IndexedDB (or OPFS)
2. Check the database structure
3. Or run this in console:

```javascript
const dbService = getDatabaseService();
const columns = dbService.query("PRAGMA table_info(rental_agreements)");
console.log('Columns:', columns.map(c => c.name));
// Should show 'contact_id' and NOT 'tenant_id'
```

## Troubleshooting

### Migration Already Completed
If you see: `"Migration already completed - contact_id column exists"`
- This is normal if the migration already ran
- No action needed

### Table Doesn't Exist
If you see: `"Table rental_agreements does not exist, nothing to migrate"`
- The table will be created with the correct schema when you create your first rental agreement
- No action needed

### Migration Failed
If the migration fails:
1. Check the error message
2. Ensure the database is not corrupted
3. Try creating a backup first
4. Contact support if issues persist

## Notes

- This migration is **safe** and **reversible** (data is preserved)
- The migration runs in a transaction (all-or-nothing)
- No data loss will occur
- The migration is idempotent (safe to run multiple times)

# Bill/Contract Record Sync Error Fix

## Issue Summary
When creating and paying invoices and bills in the rental section, records were not syncing to the cloud database. The error occurred:

```
SQL execution failed: Error: table bills has no column named document_path
```

Also, there was a missing `version` column in the bills table that was recently added to PostgreSQL for optimistic locking.

## Root Cause
There was a **schema mismatch** between:
- **Cloud PostgreSQL database**: Has `document_path` column in `bills` and `contracts` tables, and `version` column in `bills` table
- **Local SQLite database**: Missing both `document_path` and `version` columns

When the cloud database sent bill/contract data via WebSocket sync, the local database attempted to insert/update records with these fields, causing SQL errors because the columns didn't exist.

## Fix Applied

### 1. Updated Local Schema (schema.ts)
- Incremented `SCHEMA_VERSION` from `2` to `3`
- Added `document_path TEXT` column to `bills` table (line 234)
- Added `version INTEGER NOT NULL DEFAULT 1` column to `bills` table (line 237)
- Added `document_path TEXT` column to `contracts` table (line 441)

### 2. Created Migration Script
Created `services/database/migrations/add-document-path-to-bills.ts` to:
- Check if `document_path` column exists in `bills` table
- Add column if missing using `ALTER TABLE bills ADD COLUMN document_path TEXT`
- Check if `version` column exists in `bills` table
- Add column if missing using `ALTER TABLE bills ADD COLUMN version INTEGER NOT NULL DEFAULT 1`
- Check if `document_path` column exists in `contracts` table
- Add column if missing using `ALTER TABLE contracts ADD COLUMN document_path TEXT`
- Handle cases where columns already exist (idempotent)

### 3. Integrated Migration into Database Service
Updated `services/database/databaseService.ts` to:
- Run the migration when upgrading from schema version 2 to 3
- Execute migration before updating schema version metadata
- Save database after successful migration

### 4. Updated Type Definitions
Updated `types.ts`:
- Added `version?: number;` to `Bill` interface (line 402)

### 5. Updated Realtime Sync Handler
Updated `services/sync/realtimeSyncHandler.ts`:
- Added normalization for `version` field in `normalizeBill()` function (line 363)

## How It Works

### For New Installations
- The `CREATE_SCHEMA_SQL` includes all required columns in both tables
- No migration needed, tables created with correct schema

### For Existing Installations
1. On app startup, database service checks schema version
2. If current version < 3, migration runs automatically
3. Migration adds missing columns to existing tables
4. Schema version updated to 3
5. Future syncs work correctly with the new columns

## Files Modified

1. **services/database/schema.ts**
   - Updated `SCHEMA_VERSION` to 3
   - Added `document_path` to `bills` table definition
   - Added `version` to `bills` table definition
   - Added `document_path` to `contracts` table definition

2. **services/database/databaseService.ts**
   - Added version-specific migration check for v2 -> v3
   - Imports and executes `migrateAddDocumentPathToBills()`

3. **services/database/migrations/add-document-path-to-bills.ts** (NEW)
   - Created migration function
   - Handles `bills` table: adds `document_path` and `version` columns
   - Handles `contracts` table: adds `document_path` column
   - Idempotent (safe to run multiple times)

4. **types.ts**
   - Added `version?: number;` to `Bill` interface

5. **services/sync/realtimeSyncHandler.ts**
   - Added `version` field normalization in `normalizeBill()` function

## Type Definitions
TypeScript interfaces now include:
- `Bill` interface: Has `documentPath?: string` and `version?: number` (types.ts lines 401-402)
- `Contract` interface: Has `documentPath?: string` (types.ts line 539)

## Testing Recommendations

1. **New Installation Test**
   - Clear browser data
   - Login and create test bills/contracts
   - Verify records sync to cloud database

2. **Existing Installation Test**
   - Don't clear browser data (to test migration)
   - Refresh the app
   - Check console for migration success message
   - Create test bills/contracts
   - Verify records sync without errors

3. **Verify Migration**
   - Open browser DevTools console
   - Look for: `[Migration] ✅ Successfully completed schema migration`
   - Check that no SQL errors occur when creating/updating bills or contracts

## Expected Console Output
```
[Migration] Starting: Add document_path and version to bills, document_path to contracts
[Migration] ✅ Added document_path column to bills table
[Migration] ✅ Added version column to bills table
[Migration] ✅ Added document_path column to contracts table
[Migration] ✅ Successfully completed schema migration
✅ Schema migration completed successfully
```

## Notes
- Migration is **backward compatible** - existing data is preserved
- Migration is **idempotent** - safe to run multiple times
- The `document_path` field is **optional** - existing records don't need values
- The `version` field defaults to **1** for all existing bills
- Both desktop and mobile platforms benefit from this fix (desktop uses local SQLite, mobile uses cloud directly)

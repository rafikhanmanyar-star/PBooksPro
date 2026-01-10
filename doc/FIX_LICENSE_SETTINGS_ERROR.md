# Fix License Settings tenant_id Error

## Issue

Console errors when testing staging client app:
```
Failed to load license settings: Error: no such column: tenant_id
Failed to save device ID: Error: no such column: tenant_id
Failed to save install date: Error: no such column: tenant_id
```

## Root Cause

The `license_settings` table is a global table (no tenant_id column), but something is trying to query it with tenant_id. This could be:
1. Old database schema that had tenant_id
2. Database not fully initialized when queries run
3. Query wrapping logic adding tenant_id filters

## Solution

The `license_settings` table should NOT have `tenant_id` column (it's a global table for app-level settings, not tenant-specific).

### What Was Fixed

1. Added check in `databaseService.ts` to verify `license_settings` doesn't have `tenant_id`
2. Added error handling in `useDatabaseLicense.ts` to handle table initialization

### If Error Persists

If you still see the error, try:

1. **Clear browser storage**:
   - Open DevTools (F12)
   - Application tab → Storage → Clear site data
   - This will reset the local SQLite database

2. **Check database schema**:
   - In DevTools Console, run:
     ```javascript
     const db = await import('./services/database/databaseService').then(m => m.getDatabaseService());
     await db.initialize();
     const columns = db.query('PRAGMA table_info(license_settings)');
     console.log('License settings columns:', columns);
     ```
   - Should NOT show `tenant_id` column

3. **Manual fix** (if needed):
   - If database has tenant_id in license_settings, you may need to:
     - Clear browser storage, OR
     - Manually drop and recreate the table

## Note

This is a client-side (browser) SQLite database issue. It doesn't affect the server-side PostgreSQL database. The staging environment on Render uses PostgreSQL, not SQLite.

The error is from the client app's local database initialization, not the staging deployment itself.

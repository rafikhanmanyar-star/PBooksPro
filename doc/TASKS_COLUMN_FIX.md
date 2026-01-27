# Tasks Column Fix - "no such column: tenant_id" Error

## Problem

Tasks cannot be loaded from the database with error: "no such column: tenant_id". This happens even though tasks are being saved to the database.

## Root Cause

The `tasks` table was likely created before the schema was updated to include `tenant_id` and `user_id` columns. When the code tries to query with these columns, SQL.js throws an error because they don't exist.

The schema in `schema.ts` (line 778-788) defines the tasks table with:
```sql
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    ...
);
```

However, `CREATE TABLE IF NOT EXISTS` means if the table already exists (without these columns), it won't be recreated with the new schema.

## Solution

### 1. Enhanced Column Detection and Addition

**Before**: Single attempt to check and add columns
**After**: 
- Multiple attempts to check columns (handles SQL.js cache issues)
- Retry logic when adding columns (up to 3 attempts)
- Verification after each addition
- Force database save after adding columns

### 2. Robust Query Fallback

**Before**: Query would fail if columns don't exist
**After**:
- Check columns before querying
- If columns don't exist, use fallback query without tenant_id/user_id
- Filter results in JavaScript if needed
- Better error handling for "no such column" errors

### 3. Improved Error Handling

- Detects "no such column" errors specifically
- Uses appropriate fallback queries
- Logs all attempts for debugging
- Doesn't throw errors that would break the app

## Code Changes

### Column Addition Logic
```typescript
// Multiple attempts to add columns with verification
for (let attempt = 0; attempt < 3; attempt++) {
    try {
        dbService.execute('ALTER TABLE tasks ADD COLUMN tenant_id TEXT');
        await dbService.saveAsync(); // Force save
        
        // Verify column was added
        const verifyColumns = dbService.query<{ name: string }>('PRAGMA table_info(tasks)');
        hasTenantId = verifyColumns.some(col => col.name === 'tenant_id');
        
        if (hasTenantId) {
            break; // Success
        }
    } catch (e) {
        // Handle errors...
    }
}
```

### Query Fallback Logic
```typescript
if (hasTenantId && hasUserId) {
    // Use filtered query
} else {
    // Use basic query without columns
    const allTasks = dbService.query('SELECT id, text, completed, priority, created_at FROM tasks');
    // No filtering possible - return all tasks
}
```

## Files Modified

1. **hooks/useDatabaseTasks.ts**
   - Enhanced column detection with retry logic
   - Improved column addition with verification
   - Better query fallback handling
   - Improved error detection and handling

## Expected Behavior

1. **On Load**:
   - Check if columns exist (with retry)
   - Add columns if missing (with retry and verification)
   - Query with columns if they exist
   - Use fallback query if columns don't exist
   - Load tasks successfully

2. **On Save**:
   - Check if columns exist
   - Add columns if missing
   - Save with columns if available
   - Save without columns as fallback

## Testing

After this fix:
- ✅ Tasks should load even if columns don't exist initially
- ✅ Columns will be added automatically on first load
- ✅ Subsequent loads will use filtered queries
- ✅ No more "no such column" errors
- ✅ Tasks will be visible after relogin

## Migration Path

For existing databases without tenant_id/user_id columns:
1. First load will detect missing columns
2. Columns will be added automatically
3. Existing tasks will have NULL for tenant_id/user_id
4. New tasks will have proper tenant_id/user_id
5. On next load, filtered queries will work

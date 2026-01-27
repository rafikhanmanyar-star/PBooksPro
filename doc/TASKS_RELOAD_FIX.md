# Tasks Reload Fix

## Problem

Tasks were being saved to the database but were not visible after relogin. Tasks should be stored in both local and cloud databases and loaded correctly on relogin.

## Root Causes

1. **Timing Issue**: The load effect was running before authentication was fully complete, causing tasks to not load or load with wrong IDs.

2. **ID Normalization Inconsistency**: Different normalization methods were used in load vs save:
   - Load: `tenantId?.trim() || null` (could be null)
   - Save: `String(tenantId).trim()` (always string)
   - This mismatch could cause queries to not find saved tasks

3. **Dependency Array Issues**: The useEffect dependency array included `user` and `tenant` objects, which might not trigger reloads when IDs change but objects are the same reference.

4. **No Retry Logic**: If the initial load failed (e.g., due to timing), there was no retry mechanism.

## Solution

### 1. Consistent ID Normalization

**Before**:
```typescript
// Load
const normalizedTenantId = tenantId?.trim() || null;
const normalizedUserId = userId?.trim() || null;

// Save
const normalizedTenantId = String(tenantId).trim();
const normalizedUserId = String(userId).trim();
```

**After**:
```typescript
// Both Load and Save use same normalization
const normalizedTenantId = String(tenantId).trim();
const normalizedUserId = String(userId).trim();
```

### 2. Improved Load Timing

- Added delay before load (300ms if authenticated, 100ms otherwise) to ensure auth state is settled
- Added ID verification during load to abort if IDs change
- Added retry logic (up to 3 retries) if load fails

### 3. Better Dependency Array

**Before**:
```typescript
}, [tenantId, userId, user, tenant, isAuthenticated]);
```

**After**:
```typescript
}, [tenantId, userId, isAuthenticated, platform, user?.id, tenant?.id]);
```

- Removed `user` and `tenant` objects (can cause unnecessary re-renders)
- Added `user?.id` and `tenant?.id` to catch ID changes
- Kept `platform` to handle platform-specific logic

### 4. Enhanced Error Handling

- Added retry mechanism with exponential backoff
- Better logging to track load attempts
- ID verification to prevent loading with stale IDs

## Files Modified

1. **hooks/useDatabaseTasks.ts**
   - Fixed ID normalization consistency
   - Added retry logic
   - Improved timing with delays
   - Better dependency array
   - Enhanced error handling and logging

## Testing

After this fix:
- ✅ Tasks should load correctly after relogin
- ✅ Tasks saved with one ID format will be found when loading with same format
- ✅ Load will retry if it fails initially
- ✅ Load will wait for authentication to complete
- ✅ Better logging to debug any remaining issues

## Expected Behavior

1. **On Login**:
   - Wait 300ms for auth state to settle
   - Load tasks from local database using normalized IDs
   - If authenticated, also load from cloud API and merge
   - Sync merged tasks back to local database

2. **On Save**:
   - Normalize IDs using same method as load
   - Save to local database with normalized IDs
   - If authenticated, save to cloud API
   - Both use same ID format for consistency

3. **On Reload**:
   - If load fails, retry up to 3 times
   - Verify IDs haven't changed during load
   - Log all attempts for debugging

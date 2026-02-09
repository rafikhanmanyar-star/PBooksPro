# Vendor Loading Issue Troubleshooting

## Problem Description
New vendors are created in the vendor directory and recorded in the database, but they are not loaded in the client app on next login.

## Data Flow Analysis

### 1. Vendor Creation Flow
When a vendor is created:
1. `VendorDirectoryPage.tsx` dispatches `ADD_VENDOR` action (line 47)
2. `AppContext.tsx` reducer handles `ADD_VENDOR` (lines 529-540)
   - Adds vendor to `state.vendors` array
   - If vendor exists, updates it; otherwise adds new vendor
3. `AppContext.tsx` syncs vendor to API (lines 1820-1833)
   - Calls `apiService.saveVendor(vendor)`
4. `appStateApi.ts` `saveVendor()` method (lines 813-850)
   - Checks if vendor exists using `vendorsRepo.exists()`
   - Calls `vendorsRepo.create()` or `vendorsRepo.update()`
5. `vendorsApi.ts` `create()` method (lines 35-42)
   - POSTs vendor to `/vendors` endpoint

### 2. Vendor Loading Flow
On login/refresh:
1. `AppContext.tsx` loads state from API (lines 1301-1426)
2. `appStateApi.ts` `loadState()` method (lines 110-767)
   - Line 228-231: Loads vendors from API via `vendorsRepo.findAll()`
   - Line 761: Includes vendors in returned state
3. Vendors are merged with offline data (lines 1312, 1344-1347, 1381)
4. State is saved to local database (line 1398)
5. `appStateRepository.ts` `saveState()` (line 799)
   - Saves vendors to local database

## Potential Issues

### Issue 1: API Not Returning Vendors
**Symptom**: Vendors are created but not returned by `/vendors` endpoint

**Check**:
1. Open browser DevTools → Network tab
2. Login and watch for `/vendors` API call
3. Check if response includes the newly created vendor

**Fix**: Check backend `/vendors` endpoint implementation

### Issue 2: Vendor Not Synced to API
**Symptom**: Vendor created locally but never sent to API

**Check**:
1. Open browser console
2. Create a vendor
3. Look for log: `🔄 Starting sync for ADD_VENDOR: {name} ({id})`
4. Look for log: `✅ Synced vendor to API: {name} ({id})`
5. If you see `❌ FAILED to sync vendor`, check the error

**Fix**: Check network connectivity and API authentication

### Issue 3: Vendors Filtered by Tenant
**Symptom**: Vendors exist in database but filtered out for current tenant

**Check**:
1. Check if `vendors` table has `tenant_id` column
2. Verify vendor records have correct `tenant_id`
3. Check if current user's `tenant_id` matches vendor's `tenant_id`

**Fix**: Ensure tenant_id is correctly set when creating vendors

### Issue 4: Local Database Not Saving Vendors
**Symptom**: Vendors loaded from API but not persisted to local database

**Check**:
1. Open browser console
2. After login, look for log: `💾 Saving state to database:`
3. Check if vendors count is shown
4. Look for log: `✅ Saved {count} vendors` (should be after line 799)

**Fix**: Check if `vendorsRepo.saveAll()` is being called

## Debugging Steps

### Step 1: Check Browser Console Logs
```
1. Open DevTools → Console
2. Filter for "vendor" (case-insensitive)
3. Look for these key logs:
   - "🔄 Starting sync for ADD_VENDOR"
   - "✅ Synced vendor to API"
   - "📡 Loading state from API..."
   - "✅ Loaded from API: ... vendors: X"
   - "💾 Saving state to database"
```

### Step 2: Check Network Tab
```
1. Open DevTools → Network tab
2. Filter for "vendors"
3. Create a new vendor
4. Check for POST /vendors request
5. Verify response status is 200/201
6. On next login, check GET /vendors request
7. Verify response includes the new vendor
```

### Step 3: Check Local Database
```javascript
// Run in browser console
const db = getDatabaseService();
const vendors = db.query('SELECT * FROM vendors');
console.log('Vendors in local DB:', vendors);
```

### Step 4: Check State
```javascript
// Run in browser console after login
// (Requires access to AppContext)
console.log('Vendors in state:', state.vendors);
```

## Common Fixes

### Fix 1: Clear Local Database and Re-sync
```javascript
// Run in browser console
localStorage.clear();
sessionStorage.clear();
// Then refresh the page
```

### Fix 2: Force Vendor Sync
If vendor exists in API but not loading:
1. Check browser console for sync errors
2. Verify API authentication token is valid
3. Check if tenant_id is correctly set

### Fix 3: Manual Database Repair
If vendors exist in local DB but not in state:
```javascript
// Check if vendors table exists
const db = getDatabaseService();
const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='vendors'");
console.log('Vendors table exists:', tables.length > 0);

// If table exists, check data
if (tables.length > 0) {
  const vendors = db.query('SELECT * FROM vendors');
  console.log('Vendors in DB:', vendors);
}
```

## Resolution Checklist

- [ ] Vendor created successfully (check browser console)
- [ ] Vendor synced to API (check network tab for POST /vendors)
- [ ] Vendor returned by API on login (check network tab for GET /vendors)
- [ ] Vendor loaded into state (check console log: "✅ Loaded from API")
- [ ] Vendor saved to local database (check console log: "💾 Saving state")
- [ ] Vendor appears in vendor directory on next login

## Next Steps

If issue persists after checking all above:
1. Check backend logs for `/vendors` endpoint
2. Verify database schema has `vendors` table
3. Check if RLS (Row Level Security) is blocking vendor access
4. Verify tenant_id is correctly set on vendor records

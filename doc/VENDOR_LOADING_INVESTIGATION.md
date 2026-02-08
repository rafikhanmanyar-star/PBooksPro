# Vendor Loading Issue - Investigation Summary

## Changes Made

I've added enhanced logging to help diagnose why vendors are not loading on next login. The logging will help identify at which stage vendors are being lost.

### 1. Enhanced API Loading Logs (`services/api/appStateApi.ts`)
- Added detailed logging when vendors are loaded from the API
- Shows vendor IDs and names if vendors are found
- Shows warning if no vendors are returned from API

### 2. Enhanced State Merge Logs (`context/AppContext.tsx`)
- Added logging after merging API and offline vendor data
- Shows total vendor count in merged state
- Shows sample vendor data (first 3 vendors)
- Warns if no vendors exist after merge

### 3. Fixed Unnecessary 404 Errors (`services/api/appStateApi.ts`)
- Removed the `vendorsRepo.exists()` check in `saveVendor()`
- This check was causing a `GET /api/vendors/:id` call which resulted in `404 Not Found` (HTML error) for new vendors
- The system now correctly uses the "POST handles upsert" pattern, which is more efficient and silent

## How to Diagnose the Issue

### Step 1: Create a New Vendor
1. Open the vendor directory
2. Create a new vendor
3. Check browser console for these logs:
   ```
   🔄 Starting sync for ADD_VENDOR: {vendor_name} ({vendor_id})
   ✅ Synced vendor to API: {vendor_name} ({vendor_id})
   ```

### Step 2: Check Network Tab
1. Open DevTools → Network tab
2. Filter for "vendors"
3. Look for POST request to `/vendors`
4. Verify response status is 200/201
5. Check response body contains the vendor data

### Step 3: Logout and Login Again
1. Logout from the application
2. Login again
3. Check browser console for these NEW logs:
   ```
   📋 Vendors loaded from API: [{id: '...', name: '...'}, ...]
   ✅ Loaded from API: { ..., vendors: X }
   📦 Vendors in merged state: X
   📋 Sample vendors: [{id: '...', name: '...'}, ...]
   ```

### Step 4: Check Vendor Directory
1. Navigate to vendor directory
2. Check if the newly created vendor appears

## Possible Scenarios

### Scenario A: Vendor Not Synced to API
**Symptoms:**
- No log: `✅ Synced vendor to API`
- OR log shows: `❌ FAILED to sync vendor`

**Cause:** Network issue or API error

**Solution:** Check network connectivity and API endpoint

### Scenario B: API Not Returning Vendors
**Symptoms:**
- Log shows: `⚠️ No vendors returned from API`
- OR `✅ Loaded from API: { ..., vendors: 0 }`

**Cause:** Backend issue - vendors table empty or RLS blocking access

**Solution:** 
1. Check backend database - verify vendor was saved
2. Check RLS policies on `vendors` table
3. Verify `tenant_id` is correctly set on vendor records

### Scenario C: Vendors Lost During Merge
**Symptoms:**
- `✅ Loaded from API: { ..., vendors: X }` shows X > 0
- BUT `📦 Vendors in merged state: 0`

**Cause:** Bug in merge logic

**Solution:** Check merge logic in AppContext.tsx (lines 1312, 1344-1347)

### Scenario D: Vendors Not Saved to Local DB
**Symptoms:**
- `📦 Vendors in merged state: X` shows X > 0
- But vendors don't appear after page refresh

**Cause:** Local database save issue

**Solution:** Check `appStateRepository.ts` line 799 - ensure vendors are being saved

## Expected Log Sequence

When everything works correctly, you should see:

### On Vendor Creation:
```
🔄 Starting sync for ADD_VENDOR: Test Vendor (vendor_1234567890)
💾 Syncing vendor (POST upsert): vendor_1234567890 - Test Vendor
✅ Synced vendor to API: Test Vendor (vendor_1234567890)
```

### On Next Login:
```
📡 Loading state from API...
📋 Vendors loaded from API: [{id: 'vendor_1234567890', name: 'Test Vendor'}, ...]
✅ Loaded from API: {
  accounts: 5,
  contacts: 10,
  vendors: 1,
  ...
}
✅ Merged offline data with API data: {
  vendors: 1
}
📦 Vendors in merged state: 1
📋 Sample vendors: [{id: 'vendor_1234567890', name: 'Test Vendor'}]
💾 Saving state to database: {
  vendors: 1
}
✅ Loaded and merged data from API + offline sync queue
```

## Next Steps

1. **Test the logging**: Create a vendor and check the console logs
2. **Identify the failure point**: Find which log is missing or shows 0 vendors
3. **Report back**: Share the console logs showing where vendors are lost
4. **Check backend**: If vendors aren't returned by API, check backend database and RLS policies

## Files Modified

1. `services/api/appStateApi.ts` - Added vendor loading logs
2. `context/AppContext.tsx` - Added vendor merge logs
3. `doc/VENDOR_LOADING_TROUBLESHOOTING.md` - Comprehensive troubleshooting guide

## Additional Resources

See `doc/VENDOR_LOADING_TROUBLESHOOTING.md` for detailed troubleshooting steps and common fixes.

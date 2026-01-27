# Testing in Production/Deployed Environments

## Problem: Module Import Failures

When running tests in a **production** or **deployed** environment (like Render), the code is **bundled** and modules are not available as individual files. Direct imports like:

```javascript
import('./services/database/databaseService')
```

Will fail with:
```
404 (Not Found) - Failed to fetch dynamically imported module
```

## Solution: Use Production-Ready Test Scripts

We've created **production-ready test scripts** that work without direct module imports.

---

## ✅ Recommended: Production Test Script

**File:** `test-pm-cycle-allocations-production.js`

This script:
- ✅ Works in production/bundled environments
- ✅ Uses localStorage for verification
- ✅ Tests via API endpoints
- ✅ Doesn't require direct module imports

### How to Use:

1. Open your application in browser (logged in)
2. Open DevTools Console (F12)
3. Copy the entire content of `test-pm-cycle-allocations-production.js`
4. Paste into console (if pasting enabled) or use snippets (see below)
5. Review results

### What It Tests:

- ✅ Tenant ID and User ID availability in localStorage
- ✅ Database initialization (localStorage/OPFS check)
- ✅ API endpoint accessibility
- ✅ Authentication token validity
- ✅ AppState structure verification
- ✅ Manual testing instructions

---

## Alternative: React Context Test

**File:** `test-pm-cycle-via-react-context.js`

Attempts to access application state through React DevTools/Fiber.

### How to Use:

1. Install React DevTools extension (recommended)
2. Open DevTools → Components tab
3. Run the script in console
4. Inspect React component tree for AppContext

---

## Alternative: Test via UI (Recommended for Production)

The most reliable way to test in production:

### 1. Manual PM Cycle Allocation Creation Test

1. Login to your application
2. Navigate to **Project Management** section
3. Go to **PM Configuration**
4. Click **Run Cycle Allocation**
5. Verify allocation appears in the list
6. Check **Network tab** (F12) for:
   - ✅ POST request to `/api/pm-cycle-allocations`
   - ✅ Request includes `X-Tenant-ID` header
   - ✅ Request includes `Authorization` header
   - ✅ Response status 200/201

### 2. Tenant Isolation Test

1. **Login as Tenant A**
2. Create 1-2 PM Cycle Allocations
3. **Logout**
4. **Login as Tenant B**
5. Verify Tenant A's allocations are **NOT visible**
6. **Logout**
7. **Login back as Tenant A**
8. Verify your allocations are **still there**

### 3. User ID Tracking Test

1. **Login as User 1**
2. Create a PM Cycle Allocation
3. Check Network tab → Request payload
4. Verify `user_id` field is included
5. **Logout**
6. **Login as User 2** (same or different tenant)
7. Create another allocation
8. Verify different `user_id` in request

---

## Quick Production Test (Console)

If you just want a quick check, paste this in console:

```javascript
// Quick Production Test
console.log('🧪 Quick Test...');
console.log('Tenant ID:', localStorage.getItem('tenant_id') || '❌ Not found');
console.log('User ID:', localStorage.getItem('user_id') || '⚠️ Not found');
console.log('Auth Token:', localStorage.getItem('auth_token') || localStorage.getItem('token') || '⚠️ Not found');

// Test API endpoint
(async () => {
    const tenantId = localStorage.getItem('tenant_id');
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    const apiBase = 'https://pbookspro-api.onrender.com/api';
    
    if (tenantId && token) {
        try {
            const res = await fetch(`${apiBase}/pm-cycle-allocations`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Tenant-ID': tenantId
                }
            });
            console.log('API Status:', res.status, res.ok ? '✅' : '❌');
            if (res.ok) {
                const data = await res.json();
                console.log('PM Cycle Allocations:', data.length || 0);
            }
        } catch (e) {
            console.log('API Error:', e.message);
        }
    } else {
        console.log('⚠️ Cannot test API: Not logged in');
    }
})();
```

---

## Using Browser Snippets (Best for Long Scripts)

Since console pasting may be disabled, use **Snippets**:

1. Open DevTools (F12)
2. Go to **Sources** tab (or **Debugger** in Firefox)
3. Find **Snippets** in left sidebar
4. Click **+ New snippet**
5. Name it "PM Cycle Test"
6. Paste `test-pm-cycle-allocations-production.js` content
7. Save (Ctrl+S)
8. Right-click → **Run** (or Ctrl+Enter)

**Advantages:**
- ✅ Works with long scripts
- ✅ Can save and reuse
- ✅ Syntax highlighting
- ✅ Easy to edit

---

## Network Tab Testing (Recommended)

The Network tab provides excellent visibility:

### 1. Filter by "pm-cycle"
- Shows all PM Cycle Allocation API calls

### 2. Inspect Request Headers
- ✅ `Authorization: Bearer <token>`
- ✅ `X-Tenant-ID: <tenant-id>`
- ✅ `Content-Type: application/json`

### 3. Inspect Request Payload
- ✅ `tenant_id` present
- ✅ `user_id` present
- ✅ All required fields present

### 4. Inspect Response
- ✅ Status 200/201 for success
- ✅ Response contains created/updated data

---

## Verification Checklist for Production

### Schema & Database
- [ ] Cannot verify directly in production (bundled)
- [ ] Verify via API responses instead
- [ ] Check localStorage for `finance_db` data
- [ ] Verify tenant/user IDs in localStorage

### Repository & CRUD
- [ ] Test via API endpoints
- [ ] Use Network tab to verify requests
- [ ] Create allocation via UI → check API call
- [ ] Update allocation → check PUT/POST API call
- [ ] Delete allocation → check DELETE API call

### Tenant Isolation
- [ ] Login as Tenant A → create allocation
- [ ] Login as Tenant B → verify cannot see Tenant A's
- [ ] Check Network tab → verify `X-Tenant-ID` header
- [ ] Verify API returns only current tenant's data

### User Tracking
- [ ] Check Network tab → request payload has `user_id`
- [ ] Login as different users → verify different `user_id`
- [ ] Verify `user_id` matches current logged-in user

### Cloud Sync
- [ ] Create allocation → check Network tab for POST
- [ ] Verify request succeeds (200/201)
- [ ] Refresh page → verify allocation persists
- [ ] Open in different browser/tab → verify sync

---

## Troubleshooting Production Tests

### Issue: "Cannot find module"
**Cause:** Code is bundled in production
**Solution:** Use production-ready test script or test via UI/Network tab

### Issue: "API 401 Unauthorized"
**Cause:** Token expired or invalid
**Solution:** Logout and login again

### Issue: "API 404 Not Found"
**Cause:** Endpoint doesn't exist or wrong URL
**Solution:** Verify API base URL in Network tab

### Issue: "CORS error"
**Cause:** API server doesn't allow requests from client origin
**Solution:** Check API server CORS configuration

### Issue: "No data in localStorage"
**Cause:** Using OPFS or IndexedDB instead
**Solution:** This is OK - data may be stored differently

---

## Summary

**For Production Testing:**
1. ✅ Use `test-pm-cycle-allocations-production.js` (no module imports)
2. ✅ Use Network tab to verify API calls
3. ✅ Test via UI and monitor Network tab
4. ✅ Use browser Snippets for long scripts
5. ✅ Verify tenant/user isolation manually

**For Development Testing:**
- Original test scripts with direct imports work fine
- Full database access available
- All tests can run

---

## Quick Reference

| Test Type | Production | Development |
|-----------|-----------|-------------|
| Direct DB access | ❌ Bundled | ✅ Available |
| API testing | ✅ Works | ✅ Works |
| localStorage check | ✅ Works | ✅ Works |
| Module imports | ❌ 404 Error | ✅ Works |
| Network tab | ✅ Best option | ✅ Works |
| UI testing | ✅ Recommended | ✅ Works |

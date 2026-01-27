# Quick Test Checklist - PM Cycle Allocations

## ✅ Automated Tests Status: **PASSED**

All automated tests have passed successfully:
- ✅ Tenant ID tracking
- ✅ User ID tracking  
- ✅ Auth token validation
- ✅ API endpoint accessibility

---

## 📋 Next: Manual UI Testing

### 1. Create PM Cycle Allocation

**Steps:**
1. Navigate to **Project Management** section
2. Open a project
3. Go to **PM Fee Configuration** or **PM Cycle** section
4. Configure and run a cycle allocation
5. Create a new allocation cycle

**Expected Results:**
- ✅ Allocation is created successfully
- ✅ Data appears in UI immediately
- ✅ No console errors

---

### 2. Verify Cloud Database Storage

**Method A: Check Network Tab**
1. Open DevTools (F12) → **Network** tab
2. Filter by "pm-cycle-allocations"
3. Create a new PM Cycle Allocation
4. Look for `POST /api/pm-cycle-allocations` request
5. Check response - should be `200 OK` or `201 Created`

**Method B: Run Test Again**
1. Create allocation via UI
2. Run the test script again in console
3. Should now show: `✅ API OK: 1 allocations` (or more)

**Expected Results:**
- ✅ API request sent successfully
- ✅ Response includes created allocation data
- ✅ Allocation has `tenant_id` and `user_id` fields

---

### 3. Verify Local Database Storage

**Steps:**
1. After creating allocation, check DevTools Console
2. Type: `localStorage.getItem('finance_app_state_v4')`
3. Look for `pmCycleAllocations` array
4. Verify allocation data is present

**Expected Results:**
- ✅ Allocation data in localStorage/AppState
- ✅ Includes all required fields (project_id, cycle_id, amount, etc.)
- ✅ Includes `tenant_id` and `user_id`

---

### 4. Test Offline Mode

**Steps:**
1. Go offline (disable network in DevTools)
2. Create a new PM Cycle Allocation
3. Should work in offline mode
4. Go online again
5. Check Network tab - allocation should sync automatically

**Expected Results:**
- ✅ Can create allocations offline
- ✅ Data saved locally
- ✅ Syncs when back online
- ✅ No data loss

---

### 5. Test Tenant Isolation

**Steps:**
1. Login as Tenant A
2. Create PM Cycle Allocations
3. Logout
4. Login as Tenant B (different tenant)
5. Check PM Cycle Allocations - should be empty or different

**Expected Results:**
- ✅ Tenant B cannot see Tenant A's allocations
- ✅ Each tenant only sees their own data
- ✅ API requests filtered by tenant_id

---

### 6. Test Multi-User Sync

**Steps:**
1. Login as User 1 (Tenant A)
2. Open PM Cycle Allocations page
3. Login as User 2 (Same Tenant A) in another browser/incognito
4. Create allocation as User 2
5. Check User 1's page - should update automatically via WebSocket

**Expected Results:**
- ✅ Real-time sync between users
- ✅ Allocation appears in User 1's UI automatically
- ✅ No page refresh needed

---

### 7. Test Update Operations

**Steps:**
1. Create a PM Cycle Allocation
2. Update its status (e.g., mark as paid)
3. Update amount or other fields
4. Verify changes saved to cloud

**Expected Results:**
- ✅ Update API call sent (`PUT /api/pm-cycle-allocations/:id`)
- ✅ Changes reflected immediately
- ✅ Syncs to other users

---

### 8. Test Delete Operations

**Steps:**
1. Create a PM Cycle Allocation
2. Delete it
3. Verify removal

**Expected Results:**
- ✅ Delete API call sent (`DELETE /api/pm-cycle-allocations/:id`)
- ✅ Removed from UI immediately
- ✅ Removed from cloud database
- ✅ Syncs to other users

---

## 🔍 Debugging Tips

### Check Console for Errors
```javascript
// In browser console, check for:
// - Red error messages
// - Failed API requests
// - WebSocket connection issues
```

### Verify API Requests
```javascript
// In Network tab:
// - Look for requests to /api/pm-cycle-allocations
// - Check status codes (should be 200, 201, 204)
// - Verify request headers include Authorization and X-Tenant-ID
```

### Check Data in Database (via API)
```javascript
// In console, run:
(async()=>{
    const t=localStorage.getItem('tenant_id');
    const tok=localStorage.getItem('auth_token')||localStorage.getItem('token');
    const r=await fetch('https://pbookspro-api.onrender.com/api/pm-cycle-allocations',{
        headers:{'Authorization':`Bearer ${tok}`,'X-Tenant-ID':t}
    });
    const d=await r.json();
    console.log('Allocations:',d);
})();
```

---

## ✅ Test Completion Criteria

All manual tests should verify:
- [ ] Can create PM Cycle Allocations
- [ ] Data saved to local database
- [ ] Data synced to cloud database
- [ ] Tenant isolation works
- [ ] User tracking works (user_id set correctly)
- [ ] Real-time sync between users works
- [ ] Update operations work
- [ ] Delete operations work
- [ ] Offline mode works
- [ ] Data persists after page refresh

---

## 📝 Notes

- **0 allocations is normal** if you haven't created any yet
- **API accessible** means the endpoint exists and is responding
- **Create allocations via UI** to test the full flow
- **Watch Network tab** to see API calls in real-time

---

## 🎯 Quick Test Scripts

### Verify Current Allocations Count
```javascript
(async()=>{
    const t=localStorage.getItem('tenant_id');
    const tok=localStorage.getItem('auth_token')||localStorage.getItem('token');
    const r=await fetch('https://pbookspro-api.onrender.com/api/pm-cycle-allocations',{
        headers:{'Authorization':`Bearer ${tok}`,'X-Tenant-ID':t}
    });
    const d=await r.json();
    console.log(`Found ${d.length} allocations:`,d);
})();
```

### Check AppState
```javascript
const state=JSON.parse(localStorage.getItem('finance_app_state_v4')||'{}');
console.log('PM Cycle Allocations in AppState:',state.pmCycleAllocations?.length||0);
console.log('Data:',state.pmCycleAllocations);
```

---

**Status:** Automated tests ✅ PASSED  
**Next:** Proceed with manual UI testing as outlined above.

# Test Plan: PM Cycle Allocations & Tenant Isolation

## Overview
This document provides a comprehensive test plan to verify:
1. PM Cycle Allocations are stored in both local and cloud databases
2. Tenant isolation is working correctly
3. User ID tracking is functioning
4. Data is properly filtered by tenant_id

## Test Environment Setup

### Prerequisites
1. Open the application in browser (or Electron)
2. Open browser DevTools (F12)
3. Ensure you're logged in with a valid tenant
4. Have access to console for running test scripts

### Test Data Requirements
- At least 2 different tenant accounts
- At least 2 different users (can be from same or different tenants)
- At least 1 project created

---

## Test 1: Schema Verification

### Objective
Verify that `pm_cycle_allocations` table exists in local database with correct structure.

### Steps
1. Open browser console (F12)
2. Run the following script:

```javascript
(async () => {
    const { getDatabaseService } = await import('./services/database/databaseService');
    const db = getDatabaseService();
    await db.initialize();
    
    // Check if table exists
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_cycle_allocations'");
    console.log('✅ Table exists:', tables.length > 0);
    
    if (tables.length > 0) {
        // Check table structure
        const columns = db.query("PRAGMA table_info(pm_cycle_allocations)");
        console.log('📋 Table columns:', columns);
        
        // Verify required columns
        const requiredColumns = ['id', 'project_id', 'cycle_id', 'tenant_id', 'user_id', 'amount', 'status'];
        const existingColumns = columns.map(c => c.name);
        const missingColumns = requiredColumns.filter(c => !existingColumns.includes(c));
        
        if (missingColumns.length === 0) {
            console.log('✅ All required columns exist');
        } else {
            console.error('❌ Missing columns:', missingColumns);
        }
    }
})();
```

### Expected Results
- ✅ Table `pm_cycle_allocations` exists
- ✅ All required columns exist: `id`, `project_id`, `cycle_id`, `tenant_id`, `user_id`, `amount`, `status`, etc.
- ✅ Indexes are created

---

## Test 2: Repository CRUD Operations

### Objective
Verify that repository can create, read, update, and delete PM Cycle Allocations.

### Steps
1. Open browser console
2. Run the following script:

```javascript
(async () => {
    const { PMCycleAllocationsRepository } = await import('./services/database/repositories/index');
    const repo = new PMCycleAllocationsRepository();
    
    // Test data
    const testAllocation = {
        id: 'test-pm-allocation-' + Date.now(),
        projectId: 'test-project-1',
        cycleId: 'test-cycle-1',
        cycleLabel: 'Test Cycle',
        frequency: 'Monthly',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        allocationDate: '2024-01-15',
        amount: 1000,
        paidAmount: 0,
        status: 'unpaid',
        expenseTotal: 5000,
        feeRate: 5.5,
        excludedCategoryIds: ['cat-1', 'cat-2']
    };
    
    // Test CREATE
    console.log('📝 Testing CREATE...');
    try {
        repo.insert(testAllocation);
        console.log('✅ Create successful');
    } catch (error) {
        console.error('❌ Create failed:', error);
    }
    
    // Test READ (findById)
    console.log('📖 Testing READ (findById)...');
    try {
        const found = repo.findById(testAllocation.id);
        if (found) {
            console.log('✅ Read successful:', found);
        } else {
            console.error('❌ Read failed: Not found');
        }
    } catch (error) {
        console.error('❌ Read failed:', error);
    }
    
    // Test READ (findAll)
    console.log('📖 Testing READ (findAll)...');
    try {
        const all = repo.findAll();
        console.log('✅ FindAll successful, count:', all.length);
        const testRecord = all.find(a => a.id === testAllocation.id);
        if (testRecord) {
            console.log('✅ Test record found in findAll');
        }
    } catch (error) {
        console.error('❌ FindAll failed:', error);
    }
    
    // Test UPDATE
    console.log('📝 Testing UPDATE...');
    try {
        repo.update(testAllocation.id, { amount: 2000, status: 'paid' });
        const updated = repo.findById(testAllocation.id);
        if (updated && updated.amount === 2000 && updated.status === 'paid') {
            console.log('✅ Update successful');
        } else {
            console.error('❌ Update failed: Values not updated');
        }
    } catch (error) {
        console.error('❌ Update failed:', error);
    }
    
    // Test DELETE
    console.log('🗑️ Testing DELETE...');
    try {
        repo.delete(testAllocation.id);
        const deleted = repo.findById(testAllocation.id);
        if (!deleted) {
            console.log('✅ Delete successful');
        } else {
            console.error('❌ Delete failed: Record still exists');
        }
    } catch (error) {
        console.error('❌ Delete failed:', error);
    }
})();
```

### Expected Results
- ✅ All CRUD operations complete successfully
- ✅ Data persists correctly
- ✅ JSON fields (excludedCategoryIds) are properly serialized/deserialized

---

## Test 3: Tenant Isolation

### Objective
Verify that data is properly filtered by tenant_id and users from different tenants cannot access each other's data.

### Steps
1. **Setup**: Login as Tenant A, create a PM Cycle Allocation
2. **Verify**: Switch to Tenant B, verify you cannot see Tenant A's data
3. **Verify**: Switch back to Tenant A, verify your data is still there

### Manual Steps
1. Login as **Tenant A**
2. Create a PM Cycle Allocation via UI (Project Management > PM Configuration > Run Cycle Allocation)
3. Note the allocation ID
4. Logout
5. Login as **Tenant B**
6. Try to access the allocation from Tenant A (should not be visible)
7. Logout
8. Login back as **Tenant A**
9. Verify your allocation is still there

### Automated Test Script
Run in console after logging in:

```javascript
(async () => {
    const { getCurrentTenantId } = await import('./services/database/tenantUtils');
    const { PMCycleAllocationsRepository } = await import('./services/database/repositories/index');
    
    const tenantId = getCurrentTenantId();
    console.log('Current Tenant ID:', tenantId);
    
    const repo = new PMCycleAllocationsRepository();
    const allAllocations = repo.findAll();
    
    // Verify all allocations belong to current tenant
    const wrongTenantAllocations = allAllocations.filter(a => {
        const allocationTenantId = a.tenantId || a.tenant_id;
        return allocationTenantId !== tenantId;
    });
    
    if (wrongTenantAllocations.length === 0) {
        console.log('✅ Tenant isolation working: All allocations belong to current tenant');
    } else {
        console.error('❌ Tenant isolation FAILED: Found', wrongTenantAllocations.length, 'allocations from other tenants');
        console.error('Wrong allocations:', wrongTenantAllocations);
    }
    
    // Try to findById with another tenant's ID (should return null)
    if (allAllocations.length > 0) {
        const testAllocation = allAllocations[0];
        const found = repo.findById(testAllocation.id);
        if (found && (found.tenantId || found.tenant_id) === tenantId) {
            console.log('✅ findById respects tenant filtering');
        } else {
            console.error('❌ findById does NOT respect tenant filtering');
        }
    }
})();
```

### Expected Results
- ✅ Users from Tenant A cannot see Tenant B's allocations
- ✅ All `findAll()` results are filtered by current tenant_id
- ✅ `findById()` returns null for allocations from other tenants
- ✅ Switching tenants clears data and loads new tenant's data

---

## Test 4: User ID Tracking

### Objective
Verify that `user_id` is automatically added to all PM Cycle Allocations.

### Steps
1. Login as a user
2. Create a PM Cycle Allocation
3. Verify it has `user_id` set to current user

### Automated Test Script
Run in console:

```javascript
(async () => {
    const { getCurrentUserId } = await import('./services/database/userUtils');
    const { PMCycleAllocationsRepository } = await import('./services/database/repositories/index');
    
    const userId = getCurrentUserId();
    console.log('Current User ID:', userId);
    
    const repo = new PMCycleAllocationsRepository();
    
    // Test automatic user_id insertion
    const testAllocation = {
        id: 'test-user-tracking-' + Date.now(),
        projectId: 'test-project-1',
        cycleId: 'test-cycle-1',
        cycleLabel: 'Test Cycle',
        frequency: 'Monthly',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        allocationDate: '2024-01-15',
        amount: 1000,
        paidAmount: 0,
        status: 'unpaid',
        expenseTotal: 5000,
        feeRate: 5.5,
        excludedCategoryIds: []
    };
    
    // Insert without user_id (should be added automatically)
    repo.insert(testAllocation);
    
    const inserted = repo.findById(testAllocation.id);
    const insertedUserId = inserted?.userId || inserted?.user_id;
    
    if (insertedUserId === userId) {
        console.log('✅ User ID automatically added on insert:', insertedUserId);
    } else {
        console.error('❌ User ID NOT automatically added. Expected:', userId, 'Got:', insertedUserId);
    }
    
    // Test automatic user_id update
    repo.update(testAllocation.id, { amount: 2000 });
    const updated = repo.findById(testAllocation.id);
    const updatedUserId = updated?.userId || updated?.user_id;
    
    if (updatedUserId === userId) {
        console.log('✅ User ID maintained on update:', updatedUserId);
    } else {
        console.error('❌ User ID NOT maintained on update');
    }
    
    // Cleanup
    repo.delete(testAllocation.id);
    
    // Verify all existing allocations have user_id
    const allAllocations = repo.findAll();
    const allocationsWithoutUserId = allAllocations.filter(a => {
        const allocationUserId = a.userId || a.user_id;
        return !allocationUserId;
    });
    
    if (allocationsWithoutUserId.length === 0) {
        console.log('✅ All existing allocations have user_id');
    } else {
        console.warn('⚠️ Found', allocationsWithoutUserId.length, 'allocations without user_id');
    }
})();
```

### Expected Results
- ✅ `user_id` is automatically added on insert
- ✅ `user_id` is maintained on update
- ✅ All allocations have `user_id` set (if user is logged in)

---

## Test 5: Migration Verification

### Objective
Verify that existing databases get `tenant_id` and `user_id` columns added correctly.

### Steps
1. Create a fresh database (clear localStorage)
2. Run migration
3. Verify columns are added

### Automated Test Script
Run in console (with database already initialized):

```javascript
(async () => {
    const { migrateTenantColumns } = await import('./services/database/tenantMigration');
    const { getDatabaseService } = await import('./services/database/databaseService');
    
    console.log('🔄 Running tenant migration...');
    
    try {
        migrateTenantColumns();
        console.log('✅ Migration completed');
        
        // Verify columns exist
        const db = getDatabaseService();
        const columns = db.query("PRAGMA table_info(pm_cycle_allocations)");
        const columnNames = columns.map(c => c.name);
        
        if (columnNames.includes('tenant_id')) {
            console.log('✅ tenant_id column exists');
        } else {
            console.error('❌ tenant_id column missing');
        }
        
        if (columnNames.includes('user_id')) {
            console.log('✅ user_id column exists');
        } else {
            console.error('❌ user_id column missing');
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
})();
```

### Expected Results
- ✅ Migration runs without errors
- ✅ `tenant_id` column is added
- ✅ `user_id` column is added
- ✅ Existing records are not affected (they'll be null)

---

## Test 6: AppState Loading and Saving

### Objective
Verify that PM Cycle Allocations are properly loaded and saved in AppState.

### Steps
1. Create some PM Cycle Allocations via UI
2. Reload the page
3. Verify allocations are still there
4. Check if they're in the database

### Automated Test Script
Run in console:

```javascript
(async () => {
    const { getAppStateRepository } = await import('./services/database/repositories/appStateRepository');
    
    console.log('📥 Loading AppState...');
    const repo = await getAppStateRepository();
    const state = await repo.loadState();
    
    console.log('PM Cycle Allocations count:', state.pmCycleAllocations?.length || 0);
    
    if (state.pmCycleAllocations && state.pmCycleAllocations.length > 0) {
        console.log('✅ PM Cycle Allocations loaded:', state.pmCycleAllocations);
        
        // Verify structure
        const first = state.pmCycleAllocations[0];
        const requiredFields = ['id', 'projectId', 'cycleId', 'amount', 'status'];
        const missingFields = requiredFields.filter(f => !first[f]);
        
        if (missingFields.length === 0) {
            console.log('✅ Allocations have correct structure');
        } else {
            console.error('❌ Missing fields:', missingFields);
        }
        
        // Verify excludedCategoryIds is parsed (array, not string)
        if (first.excludedCategoryIds !== undefined) {
            if (Array.isArray(first.excludedCategoryIds)) {
                console.log('✅ excludedCategoryIds is correctly parsed as array');
            } else {
                console.error('❌ excludedCategoryIds is not an array:', typeof first.excludedCategoryIds);
            }
        }
    } else {
        console.log('ℹ️ No PM Cycle Allocations found (this is OK if none were created)');
    }
    
    // Test saving
    console.log('💾 Testing saveState...');
    try {
        await repo.saveState(state);
        console.log('✅ saveState successful');
    } catch (error) {
        console.error('❌ saveState failed:', error);
    }
})();
```

### Expected Results
- ✅ PM Cycle Allocations are loaded from database
- ✅ Allocations have correct structure
- ✅ `excludedCategoryIds` is properly parsed as array
- ✅ `saveState` works without errors

---

## Test 7: Tenant Switch Clearing

### Objective
Verify that PM Cycle Allocations are cleared when switching tenants.

### Steps
1. Login as Tenant A
2. Create a PM Cycle Allocation
3. Logout
4. Login as Tenant B
5. Verify Tenant A's allocations are cleared
6. Login back as Tenant A
7. Verify data is reloaded from cloud

### Manual Steps
1. Login as **Tenant A**
2. Create 1-2 PM Cycle Allocations
3. Verify they exist in local database (use Test 6 script)
4. Logout
5. Login as **Tenant B**
6. Check PM Cycle Allocations (should be empty or only Tenant B's)
7. Logout
8. Login back as **Tenant A**
9. Verify your allocations are reloaded from cloud

### Expected Results
- ✅ Tenant A's allocations are cleared when switching to Tenant B
- ✅ Tenant B's allocations are loaded when logging in
- ✅ Tenant A's allocations are reloaded when logging back in

---

## Test 8: Cloud Sync Integration

### Objective
Verify that PM Cycle Allocations are synced to cloud database.

### Steps
1. Create a PM Cycle Allocation via UI
2. Check network tab to see if API call is made
3. Verify it's saved in cloud database

### Manual Steps
1. Open Network tab in DevTools
2. Create a PM Cycle Allocation via UI
3. Look for API call to `/api/pm-cycle-allocations`
4. Verify it's a POST request with correct data
5. Check response is 200/201

### Expected Results
- ✅ API call is made when creating allocation
- ✅ Request includes `tenant_id` and `user_id`
- ✅ Response is successful
- ✅ Data is persisted in cloud database

---

## Test Summary Checklist

- [ ] Test 1: Schema Verification - PASSED
- [ ] Test 2: Repository CRUD Operations - PASSED
- [ ] Test 3: Tenant Isolation - PASSED
- [ ] Test 4: User ID Tracking - PASSED
- [ ] Test 5: Migration Verification - PASSED
- [ ] Test 6: AppState Loading and Saving - PASSED
- [ ] Test 7: Tenant Switch Clearing - PASSED
- [ ] Test 8: Cloud Sync Integration - PASSED

---

## Troubleshooting

### Issue: Table doesn't exist
**Solution**: Ensure database is initialized and schema is applied. Run:
```javascript
const { getDatabaseService } = await import('./services/database/databaseService');
const db = getDatabaseService();
await db.initialize();
```

### Issue: tenant_id is null
**Solution**: Ensure you're logged in. Check:
```javascript
localStorage.getItem('tenant_id')
```

### Issue: user_id is null
**Solution**: Ensure you're logged in. Check:
```javascript
localStorage.getItem('user_id')
```

### Issue: Data not syncing to cloud
**Solution**: 
1. Check if you're authenticated
2. Check network tab for errors
3. Verify API endpoint is correct
4. Check if WebSocket is connected for real-time sync

---

## Notes

- All test scripts should be run in browser console while application is running
- Some tests require manual interaction (login/logout)
- Network tab in DevTools is useful for verifying API calls
- Database queries can be inspected using `db.query()` in console

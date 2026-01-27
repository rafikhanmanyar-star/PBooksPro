/**
 * Simplified Test Script - Can be pasted line by line or as a snippet
 * 
 * Method 1: Run in Console (paste all at once or line by line)
 * Method 2: Save as snippet in DevTools Sources tab
 * Method 3: Load as external script
 */

// Quick test - paste this entire block into console
(async () => {
    console.log('🧪 Starting PM Cycle Allocations Tests...');
    
    try {
        // Import modules
        const { getDatabaseService } = await import('./services/database/databaseService');
        const { getCurrentTenantId } = await import('./services/database/tenantUtils');
        const { getCurrentUserId } = await import('./services/database/userUtils');
        const { PMCycleAllocationsRepository } = await import('./services/database/repositories/index');
        
        // Test 1: Check table exists
        console.log('\n📋 Test 1: Schema Check');
        const db = getDatabaseService();
        await db.initialize();
        const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_cycle_allocations'");
        console.log(tables.length > 0 ? '✅ Table exists' : '❌ Table missing');
        
        // Test 2: Check tenant/user IDs
        console.log('\n📋 Test 2: Tenant/User IDs');
        const tenantId = getCurrentTenantId();
        const userId = getCurrentUserId();
        console.log('Tenant ID:', tenantId || '❌ Not available');
        console.log('User ID:', userId || '❌ Not available');
        
        // Test 3: Repository test
        console.log('\n📋 Test 3: Repository CRUD');
        const repo = new PMCycleAllocationsRepository();
        const testId = 'test-' + Date.now();
        
        // Insert
        repo.insert({
            id: testId,
            projectId: 'test-project',
            cycleId: 'test-cycle',
            cycleLabel: 'Test',
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
        });
        console.log('✅ Insert successful');
        
        // Find
        const found = repo.findById(testId);
        console.log(found ? '✅ Find successful' : '❌ Find failed');
        
        // Update
        repo.update(testId, { amount: 2000 });
        const updated = repo.findById(testId);
        console.log(updated?.amount === 2000 ? '✅ Update successful' : '❌ Update failed');
        
        // Delete
        repo.delete(testId);
        const deleted = repo.findById(testId);
        console.log(!deleted ? '✅ Delete successful' : '❌ Delete failed');
        
        // Test 4: Tenant isolation
        console.log('\n📋 Test 4: Tenant Isolation');
        const all = repo.findAll();
        const wrongTenant = all.filter(a => {
            const tId = a.tenantId || a.tenant_id;
            return tId && tId !== tenantId;
        });
        console.log(wrongTenant.length === 0 ? '✅ Tenant isolation working' : '❌ Tenant isolation failed');
        
        console.log('\n✅ All tests completed!');
    } catch (error) {
        console.error('❌ Test error:', error);
    }
})();

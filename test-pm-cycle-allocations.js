/**
 * Automated Test Script for PM Cycle Allocations & Tenant Isolation
 * 
 * To run this test:
 * 1. Open the application in browser
 * 2. Login with a valid tenant account
 * 3. Open browser console (F12)
 * 4. Copy and paste this entire script
 * 5. Review the results
 * 
 * Note: This script requires the application to be running and user to be logged in
 */

(async function runPMCycleAllocationsTests() {
    console.log('🧪 Starting PM Cycle Allocations & Tenant Isolation Tests...\n');
    
    try {
        // Import required modules
        const { getDatabaseService } = await import('./services/database/databaseService');
        const { getCurrentTenantId } = await import('./services/database/tenantUtils');
        const { getCurrentUserId } = await import('./services/database/userUtils');
        const { PMCycleAllocationsRepository } = await import('./services/database/repositories/index');
        const { getAppStateRepository } = await import('./services/database/repositories/appStateRepository');
        const { migrateTenantColumns } = await import('./services/database/tenantMigration');
        
        let testsPassed = 0;
        let testsFailed = 0;
        
        // Test 1: Schema Verification
        console.log('📋 Test 1: Schema Verification');
        try {
            const db = getDatabaseService();
            await db.initialize();
            
            const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_cycle_allocations'");
            if (tables.length === 0) {
                throw new Error('Table pm_cycle_allocations does not exist');
            }
            
            const columns = db.query("PRAGMA table_info(pm_cycle_allocations)");
            const columnNames = columns.map(c => c.name);
            
            const requiredColumns = ['id', 'project_id', 'cycle_id', 'tenant_id', 'user_id', 'amount', 'status'];
            const missingColumns = requiredColumns.filter(c => !columnNames.includes(c));
            
            if (missingColumns.length > 0) {
                throw new Error(`Missing columns: ${missingColumns.join(', ')}`);
            }
            
            console.log('  ✅ Table exists with all required columns');
            testsPassed++;
        } catch (error) {
            console.error('  ❌ FAILED:', error.message);
            testsFailed++;
        }
        
        // Test 2: Tenant and User ID Availability
        console.log('\n📋 Test 2: Tenant and User ID Availability');
        try {
            const tenantId = getCurrentTenantId();
            const userId = getCurrentUserId();
            
            if (!tenantId) {
                throw new Error('tenant_id is not available. Please ensure you are logged in.');
            }
            
            if (!userId) {
                console.warn('  ⚠️ user_id is not available. User ID tracking may not work.');
            } else {
                console.log('  ✅ tenant_id:', tenantId);
                console.log('  ✅ user_id:', userId);
                testsPassed++;
            }
        } catch (error) {
            console.error('  ❌ FAILED:', error.message);
            testsFailed++;
        }
        
        // Test 3: Repository CRUD Operations
        console.log('\n📋 Test 3: Repository CRUD Operations');
        try {
            const repo = new PMCycleAllocationsRepository();
            const testId = 'test-pm-allocation-' + Date.now();
            
            const testAllocation = {
                id: testId,
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
            
            // CREATE
            repo.insert(testAllocation);
            console.log('  ✅ CREATE: Insert successful');
            
            // READ (findById)
            const found = repo.findById(testId);
            if (!found) {
                throw new Error('findById returned null after insert');
            }
            console.log('  ✅ READ: findById successful');
            
            // READ (findAll)
            const all = repo.findAll();
            const testRecord = all.find(a => (a.id || a.ID) === testId);
            if (!testRecord) {
                throw new Error('Test record not found in findAll results');
            }
            console.log('  ✅ READ: findAll includes test record');
            
            // UPDATE
            repo.update(testId, { amount: 2000, status: 'paid' });
            const updated = repo.findById(testId);
            const updatedAmount = updated?.amount || updated?.AMOUNT;
            if (updatedAmount !== 2000) {
                throw new Error(`Update failed: Expected amount 2000, got ${updatedAmount}`);
            }
            console.log('  ✅ UPDATE: Update successful');
            
            // DELETE
            repo.delete(testId);
            const deleted = repo.findById(testId);
            if (deleted) {
                throw new Error('Delete failed: Record still exists');
            }
            console.log('  ✅ DELETE: Delete successful');
            
            testsPassed++;
        } catch (error) {
            console.error('  ❌ FAILED:', error.message);
            testsFailed++;
        }
        
        // Test 4: Tenant Isolation
        console.log('\n📋 Test 4: Tenant Isolation');
        try {
            const tenantId = getCurrentTenantId();
            if (!tenantId) {
                throw new Error('Cannot test tenant isolation: Not logged in');
            }
            
            const repo = new PMCycleAllocationsRepository();
            const allAllocations = repo.findAll();
            
            // Verify all allocations belong to current tenant
            const wrongTenantAllocations = allAllocations.filter(a => {
                const allocationTenantId = a.tenantId || a.tenant_id || a.TENANT_ID;
                return allocationTenantId && allocationTenantId !== tenantId;
            });
            
            if (wrongTenantAllocations.length > 0) {
                throw new Error(`Found ${wrongTenantAllocations.length} allocations from other tenants`);
            }
            
            console.log(`  ✅ Tenant isolation: All ${allAllocations.length} allocations belong to current tenant`);
            testsPassed++;
        } catch (error) {
            console.error('  ❌ FAILED:', error.message);
            testsFailed++;
        }
        
        // Test 5: User ID Tracking
        console.log('\n📋 Test 5: User ID Tracking');
        try {
            const userId = getCurrentUserId();
            if (!userId) {
                console.warn('  ⚠️ Skipping: user_id not available (user may not be logged in)');
            } else {
                const repo = new PMCycleAllocationsRepository();
                const testId = 'test-user-tracking-' + Date.now();
                
                const testAllocation = {
                    id: testId,
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
                
                const inserted = repo.findById(testId);
                const insertedUserId = inserted?.userId || inserted?.user_id || inserted?.USER_ID;
                
                if (insertedUserId !== userId) {
                    throw new Error(`User ID not automatically added. Expected: ${userId}, Got: ${insertedUserId}`);
                }
                
                console.log('  ✅ User ID automatically added on insert');
                
                // Cleanup
                repo.delete(testId);
                testsPassed++;
            }
        } catch (error) {
            console.error('  ❌ FAILED:', error.message);
            testsFailed++;
        }
        
        // Test 6: AppState Loading
        console.log('\n📋 Test 6: AppState Loading and Saving');
        try {
            const repo = await getAppStateRepository();
            const state = await repo.loadState();
            
            if (!state.pmCycleAllocations) {
                throw new Error('pmCycleAllocations is missing from AppState');
            }
            
            console.log(`  ✅ AppState loaded: ${state.pmCycleAllocations.length} PM Cycle Allocations`);
            
            // Verify structure
            if (state.pmCycleAllocations.length > 0) {
                const first = state.pmCycleAllocations[0];
                const requiredFields = ['id', 'projectId', 'cycleId', 'amount', 'status'];
                const missingFields = requiredFields.filter(f => !first[f]);
                
                if (missingFields.length > 0) {
                    throw new Error(`Missing fields: ${missingFields.join(', ')}`);
                }
                
                // Verify excludedCategoryIds is parsed (array, not string)
                if (first.excludedCategoryIds !== undefined) {
                    if (!Array.isArray(first.excludedCategoryIds)) {
                        throw new Error('excludedCategoryIds is not an array');
                    }
                }
                
                console.log('  ✅ Allocations have correct structure');
            }
            
            // Test saving
            await repo.saveState(state);
            console.log('  ✅ saveState successful');
            
            testsPassed++;
        } catch (error) {
            console.error('  ❌ FAILED:', error.message);
            testsFailed++;
        }
        
        // Test 7: Migration
        console.log('\n📋 Test 7: Migration Verification');
        try {
            migrateTenantColumns();
            
            const db = getDatabaseService();
            const columns = db.query("PRAGMA table_info(pm_cycle_allocations)");
            const columnNames = columns.map(c => c.name);
            
            if (!columnNames.includes('tenant_id')) {
                throw new Error('tenant_id column missing');
            }
            
            if (!columnNames.includes('user_id')) {
                throw new Error('user_id column missing');
            }
            
            console.log('  ✅ Migration: tenant_id and user_id columns exist');
            testsPassed++;
        } catch (error) {
            console.error('  ❌ FAILED:', error.message);
            testsFailed++;
        }
        
        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 Test Summary');
        console.log('='.repeat(50));
        console.log(`✅ Passed: ${testsPassed}`);
        console.log(`❌ Failed: ${testsFailed}`);
        console.log(`📈 Total: ${testsPassed + testsFailed}`);
        
        if (testsFailed === 0) {
            console.log('\n🎉 All tests passed!');
        } else {
            console.log('\n⚠️ Some tests failed. Please review the errors above.');
        }
        
    } catch (error) {
        console.error('\n❌ Test suite error:', error);
        console.error(error.stack);
    }
})();

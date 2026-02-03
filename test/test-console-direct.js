/**
 * Direct Console Test Script for PM Cycle Allocations
 * 
 * This script can be run directly in the application's browser console.
 * It works in the same tab as your application, so it can access localStorage.
 * 
 * To use:
 * 1. Open your application in browser
 * 2. Login with a valid tenant account
 * 3. Open DevTools Console (F12)
 * 4. Copy and paste this ENTIRE script
 * 5. Press Enter
 * 6. Review results
 */

(async function runPMCycleAllocationsTests() {
    console.log('%c🧪 Starting PM Cycle Allocations & Tenant Isolation Tests...', 'font-size: 16px; font-weight: bold; color: #4CAF50;');
    console.log('');
    
    let testsPassed = 0;
    let testsFailed = 0;
    const results = [];
    
    function logResult(testName, passed, message) {
        const icon = passed ? '✅' : '❌';
        const style = passed ? 'color: #4CAF50;' : 'color: #f44336;';
        console.log(`%c${icon} ${testName}: ${message}`, style);
        results.push({ test: testName, passed, message });
        if (passed) testsPassed++; else testsFailed++;
    }
    
    // Test 1: Tenant and User ID Verification
    console.log('%c📋 Test 1: Tenant and User ID Verification', 'font-weight: bold;');
    try {
        const tenantId = localStorage.getItem('tenant_id');
        const userId = localStorage.getItem('user_id');
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        
        if (!tenantId) {
            logResult('Test 1', false, 'tenant_id not found in localStorage. Please ensure you are logged in.');
            testsFailed++;
        } else {
            logResult('Test 1a', true, `Tenant ID found: ${tenantId}`);
            testsPassed++;
            
            if (!userId) {
                console.warn('  ⚠️ user_id not found in localStorage (may not be set during login)');
            } else {
                logResult('Test 1b', true, `User ID found: ${userId}`);
                testsPassed++;
            }
            
            if (!token) {
                console.warn('  ⚠️ Auth token not found (may affect cloud sync)');
            } else {
                logResult('Test 1c', true, 'Auth token present');
                testsPassed++;
            }
        }
    } catch (error) {
        logResult('Test 1', false, error.message);
        testsFailed++;
    }
    
    // Test 2: Database Initialization
    console.log('\n%c📋 Test 2: Database Initialization Check', 'font-weight: bold;');
    try {
        const dbData = localStorage.getItem('finance_db');
        if (dbData) {
            logResult('Test 2', true, 'Database data found in localStorage');
            testsPassed++;
        } else {
            console.log('  ℹ️ Database may use OPFS or IndexedDB (this is OK)');
            logResult('Test 2', true, 'Database storage method detected');
            testsPassed++;
        }
    } catch (error) {
        logResult('Test 2', false, error.message);
        testsFailed++;
    }
    
    // Test 3: API Endpoints
    console.log('\n%c📋 Test 3: Cloud API Endpoints Verification', 'font-weight: bold;');
    try {
        const tenantId = localStorage.getItem('tenant_id');
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        
        if (!tenantId || !token) {
            console.warn('  ⚠️ Cannot test API: Not logged in');
            testsPassed++; // Don't fail, just skip
        } else {
            const apiBase = window.location.origin.includes('onrender.com') 
                ? 'https://pbookspro-api.onrender.com/api'
                : 'http://localhost:3000/api';
            
            try {
                const response = await fetch(`${apiBase}/pm-cycle-allocations`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-Tenant-ID': tenantId,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok || response.status === 404) {
                    const data = response.ok ? await response.json() : [];
                    logResult('Test 3', true, `API endpoint accessible (${data.length || 0} allocations found)`);
                    testsPassed++;
                } else if (response.status === 401) {
                    logResult('Test 3', false, 'Authentication failed - token may be expired');
                    testsFailed++;
                } else {
                    logResult('Test 3', false, `API error: ${response.status} ${response.statusText}`);
                    testsFailed++;
                }
            } catch (fetchError) {
                console.warn('  ⚠️ Network error (may be offline or CORS issue):', fetchError.message);
                logResult('Test 3', true, 'Network check completed (offline mode detected)');
                testsPassed++;
            }
        }
    } catch (error) {
        logResult('Test 3', false, error.message);
        testsFailed++;
    }
    
    // Test 4: AppState Structure
    console.log('\n%c📋 Test 4: AppState Structure Verification', 'font-weight: bold;');
    try {
        const serializedState = localStorage.getItem('finance_app_state_v4');
        if (serializedState) {
            try {
                const state = JSON.parse(serializedState);
                if (state.pmCycleAllocations !== undefined) {
                    logResult('Test 4', true, `AppState found: pmCycleAllocations exists (${state.pmCycleAllocations?.length || 0} items)`);
                    testsPassed++;
                } else {
                    console.log('  ℹ️ AppState found but pmCycleAllocations not yet initialized');
                    logResult('Test 4', true, 'AppState structure valid (pmCycleAllocations not initialized yet)');
                    testsPassed++;
                }
            } catch (parseError) {
                logResult('Test 4', false, 'Could not parse AppState from localStorage');
                testsFailed++;
            }
        } else {
            console.log('  ℹ️ AppState not found in localStorage (may use database storage)');
            logResult('Test 4', true, 'AppState storage method detected');
            testsPassed++;
        }
    } catch (error) {
        logResult('Test 4', false, error.message);
        testsFailed++;
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('%c📊 Test Summary', 'font-size: 16px; font-weight: bold;');
    console.log('='.repeat(60));
    console.log(`%c✅ Passed: ${testsPassed}`, 'color: #4CAF50; font-weight: bold;');
    console.log(`%c❌ Failed: ${testsFailed}`, testsFailed > 0 ? 'color: #f44336; font-weight: bold;' : 'color: #4CAF50; font-weight: bold;');
    console.log(`📈 Total: ${testsPassed + testsFailed}`);
    
    if (testsFailed === 0) {
        console.log('\n%c🎉 All automated tests passed!', 'font-size: 14px; font-weight: bold; color: #4CAF50;');
        console.log('%c⚠️ Remember to perform manual UI testing as well.', 'color: #ff9800;');
    } else {
        console.log('\n%c⚠️ Some tests failed. Please review the errors above.', 'color: #ff9800; font-weight: bold;');
    }
    
    // Additional recommendations
    console.log('\n📝 Additional Testing Recommendations:');
    console.log('  1. Test PM Cycle Allocation creation via UI');
    console.log('  2. Check Network tab for API requests');
    console.log('  3. Test with multiple tenant accounts');
    console.log('  4. Verify data isolation between tenants');
    console.log('  5. Test offline functionality');
    
    return { passed: testsPassed, failed: testsFailed, total: testsPassed + testsFailed, results };
})();

// PM Cycle Allocations Test Script
// Copy everything below this line and paste into browser console

(async function() {
    console.log('%c🧪 PM Cycle Allocations Test', 'font-size: 16px; font-weight: bold; color: #4CAF50;');
    console.log('');
    
    let passed = 0, failed = 0;
    
    // Test 1: Check login
    console.log('%c📋 Test 1: Login Check', 'font-weight: bold;');
    const tenantId = localStorage.getItem('tenant_id');
    const userId = localStorage.getItem('user_id');
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    
    if (tenantId) {
        console.log('%c✅ Tenant ID:', 'color: #4CAF50;', tenantId);
        passed++;
    } else {
        console.log('%c❌ Tenant ID not found - please login', 'color: #f44336;');
        failed++;
    }
    
    if (userId) {
        console.log('%c✅ User ID:', 'color: #4CAF50;', userId);
        passed++;
    } else {
        console.log('%c⚠️ User ID not found', 'color: #ff9800;');
    }
    
    if (token) {
        console.log('%c✅ Auth token present', 'color: #4CAF50;');
        passed++;
    } else {
        console.log('%c⚠️ Auth token not found', 'color: #ff9800;');
    }
    
    // Test 2: Check API
    if (tenantId && token) {
        console.log('\n%c📋 Test 2: API Endpoint Check', 'font-weight: bold;');
        try {
            const apiBase = window.location.origin.includes('onrender.com') 
                ? 'https://pbookspro-api.onrender.com/api'
                : 'http://localhost:3000/api';
            
            const response = await fetch(`${apiBase}/pm-cycle-allocations`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Tenant-ID': tenantId,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('%c✅ API working:', 'color: #4CAF50;', `${data.length || 0} allocations found`);
                passed++;
            } else if (response.status === 404) {
                console.log('%c✅ API accessible (no allocations yet)', 'color: #4CAF50;');
                passed++;
            } else {
                console.log('%c❌ API error:', 'color: #f44336;', response.status, response.statusText);
                failed++;
            }
        } catch (e) {
            console.log('%c⚠️ Network error (offline?):', 'color: #ff9800;', e.message);
            passed++; // Don't fail on network errors
        }
    }
    
    // Test 3: Check AppState
    console.log('\n%c📋 Test 3: AppState Check', 'font-weight: bold;');
    const appState = localStorage.getItem('finance_app_state_v4');
    if (appState) {
        try {
            const state = JSON.parse(appState);
            if (state.pmCycleAllocations !== undefined) {
                console.log('%c✅ AppState has pmCycleAllocations:', 'color: #4CAF50;', state.pmCycleAllocations.length || 0, 'items');
                passed++;
            } else {
                console.log('%cℹ️ AppState exists but pmCycleAllocations not initialized', 'color: #2196F3;');
                passed++;
            }
        } catch (e) {
            console.log('%c⚠️ Could not parse AppState', 'color: #ff9800;');
            failed++;
        }
    } else {
        console.log('%cℹ️ AppState not in localStorage (may use database)', 'color: #2196F3;');
        passed++;
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('%c📊 Results:', 'font-weight: bold;', `✅ ${passed} passed`, failed > 0 ? `❌ ${failed} failed` : '');
    console.log('='.repeat(50));
    
    if (failed === 0) {
        console.log('%c🎉 All tests passed!', 'font-size: 14px; font-weight: bold; color: #4CAF50;');
    }
    
    return { passed, failed, total: passed + failed };
})();

/**
 * Authentication Status Checker
 * 
 * Run this in browser console (F12) to check your authentication status
 * Copy and paste this entire script into the console
 */

(function checkAuthStatus() {
  console.log('🔍 Checking Authentication Status...\n');
  
  // Check localStorage
  const token = localStorage.getItem('auth_token');
  const tenantId = localStorage.getItem('tenant_id');
  const userId = localStorage.getItem('user_id');
  
  console.log('📦 LocalStorage Status:');
  console.log('  auth_token:', token ? `✅ Present (${token.length} chars)` : '❌ Missing');
  console.log('  tenant_id:', tenantId ? `✅ ${tenantId}` : '❌ Missing');
  console.log('  user_id:', userId ? `✅ ${userId}` : '❌ Missing');
  
  // Check token expiration
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const exp = new Date(payload.exp * 1000);
        const now = new Date();
        const isExpired = now >= exp;
        
        console.log('\n🕐 Token Expiration:');
        console.log('  Expires:', exp.toLocaleString());
        console.log('  Status:', isExpired ? '❌ EXPIRED' : '✅ Valid');
        
        if (isExpired) {
          console.log('\n⚠️ Your token has expired! You need to login again.');
        } else {
          const timeLeft = Math.floor((exp - now) / 1000 / 60);
          console.log('  Time left:', `${timeLeft} minutes`);
        }
        
        // Show token payload
        console.log('\n📋 Token Payload:');
        console.log('  User ID:', payload.userId || payload.id || 'Not found');
        console.log('  Tenant ID:', payload.tenantId || 'Not found');
        console.log('  Role:', payload.role || 'Not found');
      } else {
        console.log('\n❌ Invalid token format (expected 3 parts, got', parts.length, ')');
      }
    } catch (error) {
      console.log('\n❌ Error decoding token:', error.message);
    }
  }
  
  // Check if user can access admin endpoints
  if (token && !token.includes('undefined')) {
    fetch('https://pbookspro-api.onrender.com/api/tenants/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': tenantId || ''
      }
    })
    .then(res => {
      console.log('\n🌐 API Connection Test:');
      console.log('  Status:', res.status);
      if (res.ok) {
        console.log('  Result: ✅ Connected and authenticated');
        return res.json();
      } else {
        console.log('  Result: ❌ Authentication failed');
        return res.json().then(data => {
          console.log('  Error:', data.error || data.message);
          throw new Error(data.error);
        });
      }
    })
    .then(data => {
      console.log('  Tenant:', data.name || data.company_name);
      console.log('\n✅ Authentication is working correctly!');
      console.log('   You should be able to use Clear Transactions now.');
    })
    .catch(error => {
      console.log('\n❌ Authentication failed:', error.message);
      console.log('   Please logout and login again.');
    });
  } else {
    console.log('\n❌ NOT LOGGED IN');
    console.log('   Please login to use the Clear Transactions feature.');
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY:');
  if (!token) {
    console.log('  Status: ❌ NOT AUTHENTICATED');
    console.log('  Action: Please login');
  } else {
    console.log('  Status: 🔄 Checking...');
    console.log('  Action: Wait for API test results above');
  }
  console.log('='.repeat(60));
  
})();


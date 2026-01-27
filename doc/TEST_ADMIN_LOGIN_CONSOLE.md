# Test Admin Login from Browser Console

## Production API (Deployed Site)

If you're testing on the deployed site (`https://pbookspro-client.onrender.com` or similar), use:

```javascript
// Test admin login with production API
fetch('https://pbookspro-api.onrender.com/api/admin/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    username: 'admin', 
    password: 'admin123' 
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('✅ Login result:', data);
    if (data.token) {
      localStorage.setItem('admin_token', data.token);
      console.log('✅ Token saved to localStorage');
    }
  })
  .catch(err => console.error('❌ Error:', err));
```

## Local Development (If Backend is Running Locally)

If you're running the backend server locally on port 3000:

1. **First, make sure backend is running:**
   ```powershell
   cd server
   npm run dev
   ```

2. **Test health endpoint:**
   ```javascript
   fetch('http://localhost:3000/health')
     .then(r => r.json())
     .then(data => console.log('Health:', data));
   ```

3. **Then test admin login:**
   ```javascript
   fetch('http://localhost:3000/api/admin/auth/login', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ 
       username: 'admin', 
       password: 'admin123' 
     })
   })
     .then(r => r.json())
     .then(data => {
       console.log('✅ Login result:', data);
       if (data.token) {
         localStorage.setItem('admin_token', data.token);
         console.log('✅ Token saved to localStorage');
       }
     })
     .catch(err => console.error('❌ Error:', err));
   ```

## Quick Test Function

Copy this into your browser console for easy testing:

```javascript
// Test admin login (auto-detects environment)
async function testAdminLogin(username = 'admin', password = 'admin123') {
  // Try production first
  const apiUrl = window.location.hostname.includes('localhost') 
    ? 'http://localhost:3000/api/admin'
    : 'https://pbookspro-api.onrender.com/api/admin';
  
  console.log('🔧 Testing with API:', apiUrl);
  
  try {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.token) {
      console.log('✅ Login successful!', data);
      localStorage.setItem('admin_token', data.token);
      console.log('✅ Token saved to localStorage');
      return data;
    } else {
      console.error('❌ Login failed:', data);
      return null;
    }
  } catch (error) {
    console.error('❌ Network error:', error);
    console.log('💡 Make sure:');
    console.log('   - Backend server is running (if using localhost)');
    console.log('   - You have internet connection (if using production)');
    console.log('   - CORS is configured correctly');
    return null;
  }
}

// Usage:
// testAdminLogin();
// testAdminLogin('admin', 'admin123');
```

## Common Issues

### ERR_CONNECTION_REFUSED (localhost)

**Problem:** Backend server not running locally

**Solution:**
```powershell
# Start the backend server
cd server
npm run dev
```

### CORS Error

**Problem:** Backend CORS not configured for your origin

**Solution:** Check `server/.env` has:
```
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,https://pbookspro-client.onrender.com
```

### 401 Unauthorized

**Problem:** Wrong credentials or admin user doesn't exist

**Solution:**
1. Check admin user exists in database
2. Verify password is correct
3. Check admin user is active (`is_active = TRUE`)

### Network Error (Production)

**Problem:** Production API might be down or unreachable

**Solution:**
1. Check Render dashboard for API service status
2. Verify API URL is correct: `https://pbookspro-api.onrender.com`
3. Check API health: `https://pbookspro-api.onrender.com/health`

## Verify Token

After successful login, verify the token:

```javascript
// Check if token is saved
const token = localStorage.getItem('admin_token');
console.log('Token:', token ? '✅ Saved' : '❌ Not found');

// Test authenticated request
if (token) {
  fetch('https://pbookspro-api.onrender.com/api/admin/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
    .then(r => r.json())
    .then(data => console.log('Current admin:', data))
    .catch(err => console.error('Error:', err));
}
```


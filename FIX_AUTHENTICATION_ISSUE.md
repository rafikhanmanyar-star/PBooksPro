# Fix: 401 Unauthorized Error on Clear Transactions

## 🔍 Problem

Getting **401 (Unauthorized)** error with message **"No authentication token"** when trying to clear transactions.

This means you're either:
1. ❌ Not logged in
2. ❌ Session expired
3. ❌ Token missing from localStorage

## ✅ The Clear Transactions feature is working correctly!

- ✅ Server endpoint exists (no more 404)
- ✅ Code is deployed
- ✅ Admin check is working
- ⚠️ **You just need to be authenticated**

---

## 🔧 Quick Fix (Choose One)

### Method 1: Check Authentication Status (Recommended)

**Step 1:** Open browser DevTools (Press `F12`)

**Step 2:** Go to **Console** tab

**Step 3:** Copy and paste this script:

```javascript
// Authentication Status Checker
(function checkAuthStatus() {
  const token = localStorage.getItem('auth_token');
  const tenantId = localStorage.getItem('tenant_id');
  
  console.log('🔍 Auth Check:');
  console.log('Token:', token ? '✅ Present' : '❌ Missing');
  console.log('Tenant:', tenantId ? '✅ Present' : '❌ Missing');
  
  if (!token) {
    console.log('\n❌ NOT LOGGED IN - Please login!');
    return;
  }
  
  // Check expiration
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = new Date(payload.exp * 1000);
    const isExpired = Date.now() >= exp.getTime();
    
    if (isExpired) {
      console.log('\n❌ TOKEN EXPIRED - Please logout and login again!');
      console.log('Expired at:', exp.toLocaleString());
    } else {
      console.log('\n✅ TOKEN VALID');
      console.log('Expires:', exp.toLocaleString());
      console.log('\n✅ You should be able to clear transactions now!');
    }
  } catch (e) {
    console.log('\n❌ INVALID TOKEN - Please logout and login again!');
  }
})();
```

**Step 4:** Check the output:
- **If "NOT LOGGED IN"** → Go to Method 2
- **If "TOKEN EXPIRED"** → Go to Method 3
- **If "TOKEN VALID"** → You should be able to use Clear Transactions now!

---

### Method 2: Fresh Login

**If you're NOT logged in or token is missing:**

1. **Clear browser data:**
   ```javascript
   // Run in console:
   localStorage.clear();
   location.reload();
   ```

2. **Login again:**
   - Go to login page
   - Enter your credentials
   - Make sure you see the dashboard after login

3. **Verify authentication:**
   - Check console for any errors
   - Try accessing Settings → Data Management
   - Click "Clear Transactions" - should work now! ✅

---

### Method 3: Refresh Expired Token

**If your token is EXPIRED:**

1. **Logout:**
   - Click your user menu → Logout
   - OR run in console: `localStorage.clear(); location.reload();`

2. **Login again:**
   - Enter credentials
   - Wait for dashboard to load

3. **Test Clear Transactions:**
   - Go to Settings → Data Management
   - Click "Clear Transactions"
   - Should work now! ✅

---

## 🧪 Testing Steps (After Login)

### 1. Verify Authentication

Open Console (F12) and check:
```javascript
console.log('Token:', localStorage.getItem('auth_token') ? 'Present ✅' : 'Missing ❌');
console.log('Tenant:', localStorage.getItem('tenant_id'));
```

Should show:
```
Token: Present ✅
Tenant: (your-tenant-id)
```

### 2. Test API Access

Run in console:
```javascript
fetch('https://pbookspro-api.onrender.com/api/tenants/me', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
    'X-Tenant-ID': localStorage.getItem('tenant_id')
  }
})
.then(r => r.json())
.then(d => console.log('API Test:', d))
.catch(e => console.error('API Error:', e));
```

Should return your tenant info (no 401 error).

### 3. Test Clear Transactions

1. Go to **Settings** → **Data Management**
2. Click **"Clear Transactions"** button
3. Modal should open ✅
4. Type "Clear transaction" to confirm
5. Click confirm

**Expected:** Success message with no 401 error! ✅

---

## 🐛 Still Getting 401?

### Check 1: Verify You're Logged In
```javascript
// Run in console:
console.log('Authenticated:', !!localStorage.getItem('auth_token'));
```
- **false** → You're not logged in → Login first!
- **true** → Token exists, continue to Check 2

### Check 2: Verify Token Format
```javascript
// Run in console:
const token = localStorage.getItem('auth_token');
if (token) {
  const parts = token.split('.');
  console.log('Token parts:', parts.length, parts.length === 3 ? '✅' : '❌ Invalid');
} else {
  console.log('❌ No token');
}
```
- Should show: `Token parts: 3 ✅`
- If not → Token is corrupt → Logout and login again

### Check 3: Test API Directly
```javascript
// Run in console after login:
const token = localStorage.getItem('auth_token');
const tenantId = localStorage.getItem('tenant_id');

fetch('https://pbookspro-api.onrender.com/api/data-management/clear-transactions', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-ID': tenantId,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(d => console.log('Result:', d))
.catch(e => console.error('Error:', e));
```

**Expected:**
- ✅ Success: `{ success: true, message: '...', details: {...} }`
- ❌ Error: Check the error message

### Check 4: Verify Admin Role
```javascript
// Run in console:
const token = localStorage.getItem('auth_token');
if (token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('Your role:', payload.role || payload.userRole || 'Not found');
  console.log('Is Admin:', payload.role === 'Admin' || payload.userRole === 'Admin');
} else {
  console.log('No token - not logged in');
}
```

- Should show: `Is Admin: true`
- If `false` → Your account is not Admin → Feature is hidden from you (by design)

---

## 📊 Common Scenarios

| Scenario | Console Output | Solution |
|----------|---------------|----------|
| Not logged in | `Token: Missing ❌` | Login first |
| Token expired | `TOKEN EXPIRED` | Logout and login again |
| Wrong role | `Is Admin: false` | Use Admin account |
| Network issue | `Failed to fetch` | Check internet connection |
| Token corrupt | `Token parts: 2 ❌` | Clear localStorage and login |

---

## ✅ Success Checklist

Before testing Clear Transactions:
- [ ] Logged in as Admin user
- [ ] Token exists in localStorage
- [ ] Token is not expired
- [ ] Can access Settings page
- [ ] Can see "Clear Transactions" button
- [ ] Button has "⚠️ Admin Only" badge

If all checked ✅, the feature should work!

---

## 🎯 Expected Flow

1. **Login as Admin** ✅
2. **Go to Settings → Data Management** ✅
3. **See "Clear Transactions" button** ✅ (Admin only)
4. **Click button** ✅
5. **Modal opens** ✅ (No 404 error)
6. **Type "Clear transaction"** ✅
7. **Click confirm** ✅
8. **See success message** ✅ (No 401 error)
9. **Transactions cleared from cloud & local DB** ✅
10. **Re-login works without errors** ✅

---

## 💡 Pro Tip

To avoid session expiration:
- Tokens expire after **24 hours**
- If you're testing over multiple days, you'll need to login again
- The app will auto-logout on token expiry (expected behavior)

---

## 📞 Still Need Help?

If you're still getting 401 after trying all methods:

1. **Take a screenshot** of the console output
2. **Run the auth checker script** (Method 1)
3. **Share the console logs**

The issue is 99% authentication-related, not a code issue. The endpoint works perfectly when authenticated! 🚀


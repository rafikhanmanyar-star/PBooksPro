# Fix: "Invalid token" Error - Complete Solution

## Current Issue

Getting `401 (Unauthorized)` with "Invalid token" error when trying to sync contacts:
```
PUT https://pbookspro-api.onrender.com/api/contacts/... 401 (Unauthorized)
API Error: {error: 'Invalid token', message: 'Invalid token', status: 401}
```

## Root Cause

The token in `localStorage` is **invalid** because:
1. **JWT_SECRET mismatch** - Token was signed with one secret, but server is verifying with a different one
2. **Token expired** - Token has expired (though we extended to 30 days)
3. **Token corrupted** - Token format is invalid
4. **Server not deployed** - New backend code with fixes hasn't been deployed yet

## Solution Steps

### Step 1: Verify Server is Deployed with New Code

1. **Check Render Dashboard → API Service → Logs**
2. **Look for these log messages:**
   - `🔍 Verifying token: ...` - New logging is working
   - `✅ Token verified successfully` - Token validation working
   - `❌ JWT verification failed:` - Detailed error info

3. **If you don't see these messages:**
   - The server hasn't been deployed with the new code
   - **Action:** Commit and push the code changes to trigger deployment

### Step 2: Verify JWT_SECRET is Set

1. **Go to Render Dashboard → API Service → Environment**
2. **Check `JWT_SECRET` is set:**
   - Should be a strong random string
   - Must be the same value used to sign tokens
   - If it was changed, all existing tokens become invalid

3. **If JWT_SECRET is missing or changed:**
   - Set it to a strong random string
   - **All users must re-login** after changing JWT_SECRET

### Step 3: Clear Invalid Token and Re-login

1. **Open browser console (F12)**
2. **Run these commands:**
   ```javascript
   // Clear invalid token
   localStorage.removeItem('auth_token');
   localStorage.removeItem('tenant_id');
   console.log('✅ Cleared invalid tokens');
   ```

3. **Refresh the page**
4. **Re-login with your credentials**
5. **This will generate a fresh, valid token**

### Step 4: Verify New Token is Valid

After re-login, verify the token:

```javascript
// In browser console
const token = localStorage.getItem('auth_token');
if (token) {
  const parts = token.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(atob(parts[1]));
    console.log('Token payload:', payload);
    console.log('Expires at:', new Date(payload.exp * 1000));
    console.log('Is expired:', Date.now() >= payload.exp * 1000);
  }
}
```

## Code Fixes Applied

### 1. Client-Side Token Validation ✅

**File:** `context/AppContext.tsx`

- Added token validation before sync attempts
- Checks token expiration before making API calls
- Validates token format
- Tests token with server before syncing
- Stops sync immediately if token is invalid

### 2. Improved Auto-Sync ✅

**File:** `context/AppContext.tsx`

- Validates token before auto-sync
- Tests token with `/tenants/me` endpoint
- Stops sync on 401 errors
- Better error messages

### 3. Enhanced Error Handling ✅

**File:** `services/api/client.ts`

- Silent handling for license status checks
- Better error classification
- Token format validation

## Expected Behavior After Fix

### When Token is Valid:
1. User creates contact → Saved locally
2. API sync attempted → Token validated
3. Contact synced to database → Success
4. Console shows: `✅ Synced contact to API: [name]`

### When Token is Invalid:
1. User creates contact → Saved locally
2. API sync attempted → Token validation fails
3. Sync skipped → No API call made
4. Console shows: `⚠️ Token is expired, skipping API sync. Data saved locally.`
5. **No 401 error** - sync is prevented before API call

## Testing Checklist

After implementing fixes:

- [ ] Clear localStorage tokens
- [ ] Re-login to get fresh token
- [ ] Verify token in console (not expired)
- [ ] Create a contact
- [ ] Check console for sync success
- [ ] Verify contact appears in Render database
- [ ] Check server logs for token validation messages

## If Issue Persists

1. **Check Server Logs:**
   - Look for `🔍 Verifying token:` messages
   - Check error details in `❌ JWT verification failed:`
   - Verify JWT_SECRET is set

2. **Verify Token Format:**
   ```javascript
   const token = localStorage.getItem('auth_token');
   console.log('Token length:', token?.length);
   console.log('Token parts:', token?.split('.').length); // Should be 3
   ```

3. **Test Token Manually:**
   ```javascript
   const token = localStorage.getItem('auth_token');
   fetch('https://pbookspro-api.onrender.com/api/tenants/me', {
     headers: { 'Authorization': `Bearer ${token}` }
   })
     .then(r => r.json())
     .then(data => console.log('Token test result:', data))
     .catch(err => console.error('Token test error:', err));
   ```

## Summary

The fixes prevent invalid token sync attempts, but **you must re-login** to get a fresh token. The current token in localStorage is invalid and needs to be replaced.

**Action Required:**
1. Clear localStorage tokens
2. Re-login
3. Test contact creation
4. Verify sync works


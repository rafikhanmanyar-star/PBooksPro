# Debug Token Issues - "Invalid token" Error

## Problem
Getting "Invalid token" errors even after re-login:
```
PUT https://pbookspro-api.onrender.com/api/contacts/... 401 (Unauthorized)
API Error: {error: 'Invalid token', code: undefined, endpoint: '/contacts/...'}
```

## Root Causes

### 1. JWT_SECRET Mismatch (Most Likely)
The token was signed with one `JWT_SECRET` but the server is verifying with a different one.

**How to check:**
1. Go to Render Dashboard → API Service → Environment
2. Check what `JWT_SECRET` is set to
3. If it was changed or is missing, that's the problem

**Solution:**
- Make sure `JWT_SECRET` is set in Render environment variables
- If you changed it, all existing tokens become invalid
- Users need to re-login after `JWT_SECRET` is set/changed

### 2. Server Not Redeployed
The server code changes haven't been deployed yet.

**How to check:**
1. Check Render Dashboard → API Service → Logs
2. Look for the new error messages we added:
   - `🔍 Verifying token: ...`
   - `✅ Token verified successfully` or `❌ JWT verification failed`
3. If you don't see these messages, the server hasn't been redeployed

**Solution:**
- Commit and push the code changes
- Render will auto-deploy
- Or manually trigger a deploy

### 3. Token Format Issue
The token might be corrupted or malformed.

**How to check (in browser console):**
```javascript
const token = localStorage.getItem('auth_token');
if (token) {
  const parts = token.split('.');
  console.log('Token parts:', parts.length); // Should be 3
  console.log('Token length:', token.length); // Should be > 100
  
  // Try to decode payload (doesn't verify signature)
  try {
    const payload = JSON.parse(atob(parts[1]));
    console.log('Token payload:', payload);
    console.log('Expires at:', new Date(payload.exp * 1000));
  } catch (e) {
    console.error('Token payload decode error:', e);
  }
}
```

## Debugging Steps

### Step 1: Check Server Logs
1. Go to Render Dashboard → API Service → Logs
2. Try to add a contact
3. Look for these log messages:
   - `🔍 Verifying token: ...` - Token received
   - `❌ JWT verification failed:` - Detailed error info
   - Check the `errorName` and `errorMessage` fields

### Step 2: Check JWT_SECRET
1. Render Dashboard → API Service → Environment
2. Verify `JWT_SECRET` is set
3. Note: If you change `JWT_SECRET`, all existing tokens become invalid

### Step 3: Verify Token in Browser
Open browser console and run:
```javascript
// Check token
const token = localStorage.getItem('auth_token');
console.log('Token exists:', !!token);
console.log('Token length:', token?.length);

// Decode token (without verification)
if (token) {
  const parts = token.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(atob(parts[1]));
    console.log('Token payload:', payload);
    console.log('Expires:', new Date(payload.exp * 1000));
    console.log('Is expired:', Date.now() >= payload.exp * 1000);
  }
}
```

### Step 4: Test Token with Server
```javascript
// In browser console
const token = localStorage.getItem('auth_token');
fetch('https://pbookspro-api.onrender.com/api/contacts', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
  .then(r => r.json())
  .then(data => console.log('Response:', data))
  .catch(err => console.error('Error:', err));
```

## Common Error Messages

### "Invalid token" with `JsonWebTokenError`
- **Cause**: Token signature doesn't match (JWT_SECRET mismatch)
- **Solution**: Check JWT_SECRET in Render environment variables

### "Invalid token" with `TokenExpiredError`
- **Cause**: Token has expired
- **Solution**: Re-login to get a new token

### "JWT_SECRET is not configured"
- **Cause**: JWT_SECRET environment variable is missing
- **Solution**: Set JWT_SECRET in Render Dashboard → Environment

## Quick Fix

1. **Clear browser storage:**
   ```javascript
   // In browser console
   localStorage.removeItem('auth_token');
   localStorage.removeItem('tenant_id');
   ```

2. **Re-login** to get a fresh token

3. **Check server logs** to see what error occurs

4. **Verify JWT_SECRET** is set correctly in Render

## Prevention

- Always set `JWT_SECRET` before deploying
- Don't change `JWT_SECRET` after deployment (or warn users to re-login)
- Use strong, unique `JWT_SECRET` values
- Monitor server logs for token verification errors


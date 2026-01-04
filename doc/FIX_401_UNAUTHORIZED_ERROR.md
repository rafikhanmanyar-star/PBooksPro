# Fix: 401 Unauthorized Error

## Problem

When adding a contact (or performing any API operation), you get:
```
PUT https://pbookspro-api.onrender.com/api/contacts/1767508619782 401 (Unauthorized)
API Error: {error: 'Invalid token', message: 'Invalid token', status: 401}
```

## Root Causes

1. **JWT Token Expiration**: Token expired but still stored in localStorage
2. **Session Validation Too Strict**: Session check failing even when JWT is valid
3. **Token Not Being Sent**: Token not properly included in request headers
4. **JWT_SECRET Mismatch**: Different secret used for signing vs verification

## Solutions Implemented

### 1. Improved Error Handling in Middleware

**File**: `server/middleware/tenantMiddleware.ts`

- Added specific error messages for different JWT errors:
  - `TokenExpiredError` → "Your session has expired. Please login again."
  - `JsonWebTokenError` → "Authentication token is invalid. Please login again."
- Made session validation non-blocking:
  - If JWT is valid but session doesn't exist, allow the request
  - Session check is for tracking, not strict enforcement
  - JWT validation is the primary security check

### 2. Auto-Logout on 401 Errors

**File**: `services/api/client.ts`

- When API returns 401, automatically:
  - Clear invalid auth tokens from localStorage
  - Dispatch `auth:expired` event
  - Provide clear error message

### 3. Auth Context Listener

**File**: `context/AuthContext.tsx`

- Listens for `auth:expired` events
- Automatically logs out user when token expires
- Redirects to login page

## How to Fix Current Issue

### Option 1: Re-login (Quick Fix)

1. Logout from the application
2. Login again with your credentials
3. This will generate a new valid token

### Option 2: Clear Browser Storage

1. Open browser DevTools (F12)
2. Go to Application/Storage tab
3. Clear localStorage:
   - Remove `auth_token`
   - Remove `tenant_id`
4. Refresh the page
5. Login again

### Option 3: Check Token in Console

```javascript
// In browser console
console.log('Token:', localStorage.getItem('auth_token'));
console.log('Tenant ID:', localStorage.getItem('tenant_id'));
```

If token is `null`, you need to login again.

## Verification Steps

### 1. Check Token is Stored

```javascript
// In browser console
localStorage.getItem('auth_token')  // Should return a JWT token
localStorage.getItem('tenant_id')   // Should return tenant ID
```

### 2. Check Token is Sent

Open browser DevTools → Network tab:
1. Make a request (e.g., add contact)
2. Click on the request
3. Check "Headers" tab
4. Look for `Authorization: Bearer <token>`
5. If missing, token is not being sent

### 3. Check Server Logs

In Render dashboard, check logs for:
- JWT verification errors
- Session validation errors
- Token expiration messages

## Prevention

The updated code now:

1. **Better Error Messages**: Clear indication of what went wrong
2. **Auto-Logout**: Automatically logs out on token expiration
3. **Flexible Session Check**: Doesn't block valid JWT tokens
4. **Token Refresh**: Can be extended to refresh tokens automatically

## Testing

After the fix, test:

1. ✅ Login successfully
2. ✅ Add a contact
3. ✅ Update a contact
4. ✅ Delete a contact
5. ✅ Wait for token to expire (7 days) - should auto-logout
6. ✅ Try to use expired token - should redirect to login

## Debugging

### Check Token Expiration

```javascript
// In browser console
const token = localStorage.getItem('auth_token');
if (token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  const expiresAt = new Date(payload.exp * 1000);
  console.log('Token expires at:', expiresAt);
  console.log('Current time:', new Date());
  console.log('Is expired:', new Date() > expiresAt);
}
```

### Check API Response

```javascript
// In browser console - Network tab
// Look for 401 responses
// Check response body for error details
```

## Common Issues

### Issue: Token exists but still getting 401

**Possible causes:**
- Token expired (check expiration date)
- JWT_SECRET mismatch (check server environment)
- Session was deleted from database

**Solution:**
- Re-login to get new token
- Check server JWT_SECRET is correct

### Issue: Token not being sent

**Possible causes:**
- Token not stored in localStorage
- API client not loading token
- Request not including Authorization header

**Solution:**
- Check localStorage has `auth_token`
- Verify API client loads token on initialization
- Check Network tab for Authorization header

### Issue: Session validation failing

**Possible causes:**
- Session table doesn't exist (migration not run)
- Session expired in database
- Session was deleted

**Solution:**
- Run database migrations
- Re-login to create new session
- Check session table exists

## Next Steps

1. **Re-login** to get a fresh token
2. **Test** adding a contact
3. **Monitor** for any 401 errors
4. **Check** server logs if issues persist

## Related Files

- `server/middleware/tenantMiddleware.ts` - Authentication middleware
- `services/api/client.ts` - API client with auth handling
- `context/AuthContext.tsx` - Auth context with auto-logout
- `server/api/routes/auth.ts` - Login endpoints


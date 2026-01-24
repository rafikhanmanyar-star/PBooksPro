# WhatsApp Config 404 Error Fix

## Problem
Getting 404 error when trying to save WhatsApp configuration:
```
Failed to load resource: the server responded with a status of 404 ()
Error response for /whatsapp/config
```

## Root Causes

1. **Route not registered** - WhatsApp router not properly mounted
2. **Authentication issue** - Tenant middleware rejecting request
3. **Path mismatch** - Frontend calling wrong endpoint
4. **Server not running** - API server not accessible

## Debugging Steps

### Step 1: Check Server Logs

When you try to save configuration, check your server logs. You should see:

**If route is reached:**
```
[WhatsApp Config] POST /config request received { tenantId: '...', ... }
```

**If route is NOT reached:**
- No logs at all = Route not registered or request not reaching server
- 401/403 error = Authentication/tenant issue
- 404 error = Route not found

### Step 2: Verify Route Registration

Check `server/api/index.ts` line 678:
```typescript
app.use('/api/whatsapp', whatsappRouter);
```

This should be AFTER:
```typescript
app.use('/api', tenantMiddleware(pool));
```

### Step 3: Check Frontend API Call

In browser DevTools → Network tab:
1. Look for request to `/api/whatsapp/config`
2. Check:
   - **Status Code**: 404, 401, 500?
   - **Request URL**: Should be `https://your-api.com/api/whatsapp/config`
   - **Request Headers**: Should include `Authorization: Bearer ...`

### Step 4: Test Route Manually

Test if the route exists:

```bash
# Replace YOUR_TOKEN with your JWT token
curl -X POST https://your-api.com/api/whatsapp/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "test",
    "phoneNumberId": "test",
    "verifyToken": "test"
  }'
```

**Expected:**
- 400 Bad Request (missing fields) = Route exists ✅
- 404 Not Found = Route not registered ❌
- 401 Unauthorized = Auth issue ❌

## Common Fixes

### Fix 1: Restart Server

The route might not be registered if server wasn't restarted:

```bash
# Stop server (Ctrl+C)
# Start again
cd server
npm run dev
```

### Fix 2: Check Authentication

Make sure you're logged in:
1. Check browser DevTools → Application → Local Storage
2. Look for `auth_token` or `auth_api_token`
3. If missing, log in again

### Fix 3: Verify API Base URL

Check if `apiClient` has correct base URL:
1. Open browser console
2. Type: `localStorage.getItem('auth_api_base')`
3. Should return your API server URL (e.g., `https://pbookspro-api-staging.onrender.com`)

### Fix 4: Check Tenant Context

The route requires tenant context. Verify:
1. You're logged in with a valid tenant
2. Your JWT token includes tenant_id
3. Tenant exists in database

## Quick Test

Run this in browser console (while logged in):

```javascript
// Get your auth token
const token = localStorage.getItem('auth_token') || localStorage.getItem('auth_api_token');

// Test the endpoint
fetch('/api/whatsapp/config', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**Expected Response:**
- `{ error: 'WhatsApp API not configured' }` = Route works, no config yet ✅
- `404` or network error = Route not found ❌

## Server-Side Verification

Check if route is registered by looking at server startup logs:

```
✅ Connected to PostgreSQL database
🔄 Running database migrations...
✅ Database migrations completed successfully
🌐 CORS Origins: [ '*' ]
🚀 Server running on port 3000
```

If you see errors about route registration, that's the issue.

## Still Not Working?

1. **Check server is running**: `curl https://your-api.com/health`
2. **Check route exists**: Look for `/api/whatsapp` in server logs
3. **Check authentication**: Verify JWT token is valid
4. **Check tenant middleware**: Verify tenant_id is set in request

---

**Last Updated**: January 2025

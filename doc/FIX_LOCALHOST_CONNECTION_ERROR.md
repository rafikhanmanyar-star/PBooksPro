# Fix: ERR_CONNECTION_REFUSED to localhost:3000

## Problem
The application is trying to connect to `http://localhost:3000/api/admin/auth/login` and getting `ERR_CONNECTION_REFUSED` error.

## Root Cause
This happens when:
1. **Browser cache** has old JavaScript files with localhost URLs
2. **Service worker** is caching old code
3. **Build** was created before the API URL was updated to production

## Solutions

### Solution 1: Clear Browser Cache (Quick Fix)

1. **Open DevTools** (F12)
2. **Right-click the refresh button** → Select **"Empty Cache and Hard Reload"**
   - Or press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
3. **Clear Service Worker** (if applicable):
   - Go to **Application** tab → **Service Workers**
   - Click **"Unregister"** for any service workers
4. **Clear Storage**:
   - Go to **Application** tab → **Storage**
   - Click **"Clear site data"**

### Solution 2: Verify API URL in Console

1. **Open DevTools** (F12) → **Console** tab
2. **Check the logged API URL**:
   ```javascript
   // Should see:
   🔧 Client API URL: https://pbookspro-api.onrender.com/api
   ```
3. **If you see localhost**, the build is outdated

### Solution 3: Check Network Tab

1. **Open DevTools** (F12) → **Network** tab
2. **Try to login** or trigger the error
3. **Check the request URL**:
   - ✅ Should be: `https://pbookspro-api.onrender.com/api/...`
   - ❌ NOT: `http://localhost:3000/api/...`

### Solution 4: Rebuild Application (If Deployed)

If you're running a deployed version and it still shows localhost:

1. **Check Render Dashboard**:
   - Go to your service → **Environment** tab
   - Verify `VITE_API_URL` is set to: `https://pbookspro-api.onrender.com/api`
2. **Trigger Manual Rebuild**:
   - Go to **Events** tab
   - Click **"Manual Deploy"** → **"Deploy latest commit"**
3. **Wait for build to complete** (2-5 minutes)

### Solution 5: For Local Development

If you're running locally and want to use localhost:

1. **Start the backend server**:
   ```powershell
   cd server
   npm run dev
   ```
2. **Verify server is running**:
   - Open: `http://localhost:3000/health`
   - Should return: `{"status":"ok",...}`
3. **The API client is hardcoded to production**, so for local dev you may need to:
   - Temporarily change `services/api/client.ts` to use localhost
   - Or use the production API for local development

## Verify Fix

After clearing cache:

1. **Open DevTools** → **Console**
2. **Look for**: `🔧 Client API URL: https://pbookspro-api.onrender.com/api`
3. **Try to login** or use the app
4. **Check Network tab** - requests should go to `pbookspro-api.onrender.com`
5. **No more localhost errors**

## Still Not Working?

1. **Check if you're on the correct app**:
   - Main client: Should use `/api/auth/login` (not `/api/admin/auth/login`)
   - Admin portal: Uses `/api/admin/auth/login`
2. **Check service worker**:
   - Application tab → Service Workers → Unregister all
3. **Try incognito/private window**:
   - This bypasses all cache
4. **Check build logs**:
   - If deployed, check Render build logs for API URL

## Notes

- The API client is **hardcoded** to production URL: `https://pbookspro-api.onrender.com/api`
- Admin portal uses: `https://pbookspro-api.onrender.com/api/admin`
- If you see localhost in production, it's a cache/build issue


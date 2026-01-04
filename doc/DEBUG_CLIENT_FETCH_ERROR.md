# Debug "Failed to fetch" Error

The "Failed to fetch" error usually means:
1. **CORS issue** - API not allowing requests from client app
2. **Browser cache** - Still using old JavaScript files
3. **Client app not rebuilt** - Still has old code with localhost

## Step 1: Check Client App URL

1. **Go to Render Dashboard** → **pbookspro-client** service
2. **Check the actual URL** - it might be different from `pbookspro-client.onrender.com`
3. **Note the exact URL** (might have a hash like `pbookspro-client-xxx.onrender.com`)

## Step 2: Verify CORS Includes Client URL

1. **Go to Render Dashboard** → **pbookspro-api** → **Environment**
2. **Check `CORS_ORIGIN`** value
3. **Make sure it includes your actual client app URL**
4. **If missing**, add it and restart the API

## Step 3: Clear Browser Cache

1. **Open client app** in browser
2. **Open DevTools** (F12)
3. **Right-click refresh button** → **"Empty Cache and Hard Reload"**
4. **Or use Incognito/Private window**

## Step 4: Check Console for API URL

1. **Open DevTools** (F12) → **Console** tab
2. **Look for:** `🔧 Client API URL: ...`
3. **Should see:** `https://pbookspro-api.onrender.com/api`
4. **If you see localhost**, the app wasn't rebuilt

## Step 5: Check Network Tab

1. **Open DevTools** (F12) → **Network** tab
2. **Try to login/search**
3. **Look for failed requests**
4. **Click on failed request** → **Check:**
   - **Request URL** - should be `https://pbookspro-api.onrender.com/api/...`
   - **Status** - might show CORS error
   - **Response Headers** - check for CORS headers

## Step 6: Verify Client App Was Rebuilt

1. **Go to Render Dashboard** → **pbookspro-client** → **Logs**
2. **Check build timestamp** - should be recent
3. **If old**, trigger manual rebuild

## Quick Fix: Add Client URL to CORS

If the client app URL is different, update CORS:

1. **Get actual client app URL** from Render Dashboard
2. **Go to pbookspro-api** → **Environment**
3. **Update `CORS_ORIGIN`** to include the actual URL
4. **Save** - API will restart

---

**Most likely: Client app needs to be rebuilt, or CORS needs the actual client app URL!**


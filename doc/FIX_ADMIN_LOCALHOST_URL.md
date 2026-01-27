# Fix Admin Portal Still Using Localhost

The admin portal is still using `http://localhost:3000` because the environment variable wasn't available during the build.

## The Problem

Vite embeds environment variables **at build time**. If `VITE_ADMIN_API_URL` wasn't set when the build ran, it defaults to `localhost`.

Even though `render.yaml` has the variable, Render might not have applied it to the existing service.

## Solution: Manually Set Environment Variable in Render

### Step 1: Set Environment Variable in Render Dashboard

1. **Go to Render Dashboard**
   - https://dashboard.render.com
   - Click on **pbookspro-admin** service

2. **Go to Environment Tab**
   - Click **"Environment"** in the left sidebar

3. **Add Environment Variable**
   - Click **"Add Environment Variable"** button
   - **Key:** `VITE_ADMIN_API_URL`
   - **Value:** `https://pbookspro-api.onrender.com/api/admin`
   - Click **"Save Changes"**

### Step 2: Trigger Manual Rebuild

After setting the environment variable:

1. **Go to "Events" tab** (or stay on the main page)
2. **Click "Manual Deploy"** button
3. **Select "Deploy latest commit"**
4. **Wait for build to complete** (2-5 minutes)

### Step 3: Verify During Build

While the build is running:

1. **Go to "Logs" tab**
2. **Watch the build output**
3. **Look for** Vite build messages
4. The build should now have access to `VITE_ADMIN_API_URL`

### Step 4: Test After Build

After the build completes:

1. **Open admin portal:** `https://pbookspro-admin-8sn6.onrender.com`
2. **Open DevTools** (F12) → **Network** tab
3. **Try to login**
4. **Check the request URL** - should now be:
   - ✅ `https://pbookspro-api.onrender.com/api/admin/auth/login`
   - ❌ NOT `http://localhost:3000/api/admin/auth/login`

## Why This Happens

- **Vite embeds env vars at build time** (not runtime)
- If the env var wasn't set during build, it uses the default (`localhost`)
- `render.yaml` defines it, but Render might not apply it to existing services
- **Manual setting in Dashboard ensures it's definitely there**

## Alternative: Check if Variable Exists

Before adding, check if it already exists:

1. **Go to Environment tab**
2. **Look for `VITE_ADMIN_API_URL`**
3. **If it exists but is wrong**, click to edit it
4. **If it doesn't exist**, add it as above

## After Fix

Once the rebuild completes with the correct environment variable:
- Admin portal will use: `https://pbookspro-api.onrender.com/api/admin`
- Login should work
- CORS errors should be resolved (since we fixed CORS in the API)

---

**Important:** You MUST set the environment variable in Render Dashboard, then rebuild. The `render.yaml` alone isn't enough for existing services.


# Verify Admin Portal Build

The admin portal is still using `localhost` because the build didn't have `VITE_ADMIN_API_URL` set.

## The Problem

Vite embeds environment variables **at build time**. If `VITE_ADMIN_API_URL` wasn't available during the build, it defaults to `http://localhost:3000/api/admin`.

## Solution: Set Environment Variable in Render

### Step 1: Set Environment Variable in Render Dashboard

1. **Go to Render Dashboard**
   - https://dashboard.render.com
   - Click on **pbookspro-admin** service

2. **Go to Environment Tab**
   - Click **"Environment"** in the left sidebar

3. **Add/Update Environment Variable**
   - Click **"Add Environment Variable"** (or edit if it exists)
   - **Key:** `VITE_ADMIN_API_URL`
   - **Value:** `https://pbookspro-api.onrender.com/api/admin`
   - **Save**

### Step 2: Trigger Rebuild

After setting the environment variable:

1. **Go to "Events" tab** (or stay on "Environment")
2. **Click "Manual Deploy"** → **"Deploy latest commit"**
3. **Wait for build to complete** (2-5 minutes)

### Step 3: Verify Build Used Correct URL

During the build, check the logs:

1. **Go to "Logs" tab** during build
2. **Look for** the build output
3. **Should NOT see** any localhost references in the build

After build, the admin portal should use the Render API URL.

## Alternative: Check Current Environment Variables

To see what's currently set:

1. **Go to Render Dashboard** → **pbookspro-admin** → **Environment**
2. **Check if `VITE_ADMIN_API_URL` exists**
3. **If missing or wrong**, add/update it as above

## Why render.yaml Didn't Work

The `render.yaml` file has the environment variable, but:
- Render might not have applied it during the initial build
- The service might have been created before the env var was in render.yaml
- Manual setting in the dashboard ensures it's definitely there

## After Rebuild: Verify

1. **Open admin portal:** `https://pbookspro-admin-8sn6.onrender.com`
2. **Open DevTools** (F12) → **Network** tab
3. **Try to login**
4. **Check the request URL** - should be:
   - ✅ `https://pbookspro-api.onrender.com/api/admin/auth/login`
   - ❌ NOT `http://localhost:3000/api/admin/auth/login`

---

**Important:** The environment variable MUST be set in Render Dashboard, then rebuild the service.


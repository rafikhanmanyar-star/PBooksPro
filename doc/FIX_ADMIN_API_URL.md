# Fix Admin Portal API URL

The admin portal is trying to connect to `localhost` instead of the Render API. This happens because Vite environment variables are embedded at **build time**, not runtime.

## The Problem

- Admin portal was built with `VITE_ADMIN_API_URL` not set or set to localhost
- Vite embeds env vars during build, so changing them later doesn't help
- Need to rebuild the admin portal with the correct environment variable

## Solution: Rebuild Admin Portal

### Step 1: Verify Environment Variable in Render

1. Go to Render Dashboard
2. Click on **pbookspro-admin** service
3. Go to **Environment** tab
4. Check if `VITE_ADMIN_API_URL` is set to:
   ```
   https://pbookspro-api.onrender.com/api/admin
   ```

### Step 2: Trigger Rebuild

If the variable is set correctly, trigger a rebuild:

**Option A: Manual Rebuild**
1. Go to **pbookspro-admin** service in Render
2. Click **"Manual Deploy"** → **"Deploy latest commit"**
3. This will rebuild with the environment variable

**Option B: Update render.yaml and Push**

The `render.yaml` already has the correct value. If you update it and push, it will rebuild:

```powershell
git add render.yaml
git commit -m "Ensure VITE_ADMIN_API_URL is set for admin portal"
git push
```

Render will automatically rebuild the admin portal.

### Step 3: Verify Build Used Correct URL

After rebuild, check the built files:

1. In Render, go to admin service → **Logs**
2. Look for the build output
3. Should show environment variables being used

## Alternative: Check Current Build

The issue might be that the environment variable wasn't set when the build happened. 

### Quick Check: What URL is in the Built Code?

The built JavaScript will have the API URL hardcoded. If it shows `localhost`, the build didn't have the env var.

## Verify After Rebuild

After rebuilding:

1. **Open admin portal:** `https://pbookspro-admin-8sn6.onrender.com`
2. **Open browser DevTools** (F12) → **Console**
3. **Check the API URL** being used
4. **Should show:** `https://pbookspro-api.onrender.com/api/admin`
5. **Not:** `http://localhost:3000/api/admin`

## If Environment Variable Not Set

If `VITE_ADMIN_API_URL` is missing in Render:

1. Go to **pbookspro-admin** service → **Environment**
2. Click **"Add Environment Variable"**
3. **Key:** `VITE_ADMIN_API_URL`
4. **Value:** `https://pbookspro-api.onrender.com/api/admin`
5. **Save**
6. **Trigger rebuild** (Manual Deploy)

---

**The fix:** Rebuild the admin portal with `VITE_ADMIN_API_URL` set correctly. The `render.yaml` already has it, so pushing a commit will trigger a rebuild.


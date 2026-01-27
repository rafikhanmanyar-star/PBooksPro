# Fix: Environment Variable Not Working in Build

I've updated `admin/vite.config.ts` to explicitly use the environment variable. Now follow these steps:

## Step 1: Commit and Push the Updated Config

```powershell
git add admin/vite.config.ts
git commit -m "Fix: Explicitly define VITE_ADMIN_API_URL in vite config"
git push
```

This will trigger a rebuild in Render.

## Step 2: Check Build Logs

After the build starts:

1. **Go to Render Dashboard** → **pbookspro-admin** → **Logs**
2. **Look for this line:**
   ```
   🔧 Building with VITE_ADMIN_API_URL: https://pbookspro-api.onrender.com/api/admin
   ```
3. **If it shows `localhost`:** The env var isn't available during build
4. **If it shows the Render URL:** The build should work

## Step 3: Clear Browser Cache

After the rebuild completes:

1. **Open:** `https://pbookspro-admin-8sn6.onrender.com`
2. **Hard refresh:**
   - **Windows:** `Ctrl + Shift + R` or `Ctrl + F5`
   - **Mac:** `Cmd + Shift + R`
3. **Or clear cache completely:**
   - Open DevTools (F12)
   - Right-click refresh button
   - Select "Empty Cache and Hard Reload"

## Step 4: Verify the Built Files

Check what's actually in the deployed JavaScript:

1. **Open admin portal**
2. **Open DevTools** (F12) → **Sources** tab
3. **Find:** `assets/index-*.js` (the main bundle)
4. **Search in file:** `localhost:3000`
   - ❌ **If found:** Build didn't work, check logs
   - ✅ **If NOT found:** Build worked, continue
5. **Search for:** `pbookspro-api.onrender.com`
   - ✅ **If found:** Build worked correctly!

## Step 5: If Still Using Localhost

If the build logs show `localhost` or the built files still have `localhost`:

### Option A: Check for .env File

1. **Check if `admin/.env` exists in your repo**
2. **If it exists**, it might override Render's env var
3. **Solution:**
   ```powershell
   # Check if .env exists
   dir admin\.env
   
   # If it exists and has localhost, either:
   # 1. Delete it (if not needed)
   # 2. Or update it to use Render URL
   ```

### Option B: Verify Environment Variable in Render

1. **Go to Render Dashboard** → **pbookspro-admin** → **Environment**
2. **Check `VITE_ADMIN_API_URL`:**
   - Should be: `https://pbookspro-api.onrender.com/api/admin`
3. **If wrong:** Update it, then rebuild

### Option C: Clear Build Cache

1. **Go to Render Dashboard** → **pbookspro-admin** → **Settings**
2. **Scroll to "Build & Deploy"**
3. **Click "Clear build cache"**
4. **Then "Manual Deploy"** → **"Deploy latest commit"**

## What I Changed

I updated `admin/vite.config.ts` to:
1. **Log the env var during build** (so you can see what it's using)
2. **Explicitly define it** using Vite's `define` option, which ensures it's replaced at build time

This should force Vite to use the environment variable even if there are other issues.

---

**After pushing the updated config and rebuilding, check the build logs to see what URL it's using!**


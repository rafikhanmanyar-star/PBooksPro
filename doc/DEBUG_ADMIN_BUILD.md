# Debug Admin Portal Build - Still Using Localhost

Even though the environment variable is set, the build might not be picking it up. Let's debug this step by step.

## Step 1: Check Build Logs in Render

1. **Go to Render Dashboard** → **pbookspro-admin** → **Logs**
2. **Look for the build output**
3. **Search for:** `🔧 Building with VITE_ADMIN_API_URL:`
4. **Check what URL it shows:**
   - ✅ Should show: `https://pbookspro-api.onrender.com/api/admin`
   - ❌ If it shows: `http://localhost:3000/api/admin` → env var not available during build

## Step 2: Clear Browser Cache

The browser might be serving cached JavaScript files:

1. **Open admin portal:** `https://pbookspro-admin-8sn6.onrender.com`
2. **Hard refresh:**
   - **Windows:** `Ctrl + Shift + R` or `Ctrl + F5`
   - **Mac:** `Cmd + Shift + R`
3. **Or clear cache:**
   - Open DevTools (F12)
   - Right-click the refresh button
   - Select "Empty Cache and Hard Reload"

## Step 3: Verify Built Files

Check what URL is actually in the deployed files:

1. **Open admin portal:** `https://pbookspro-admin-8sn6.onrender.com`
2. **Open DevTools** (F12) → **Sources** tab
3. **Find the main JavaScript file** (usually `assets/index-*.js`)
4. **Search for:** `localhost:3000`
5. **If found:** The build didn't use the env var
6. **If not found, search for:** `pbookspro-api.onrender.com`
7. **If found:** The build worked, but browser is caching

## Step 4: Check Environment Variable in Render

Verify the variable is actually set:

1. **Go to Render Dashboard** → **pbookspro-admin** → **Environment**
2. **Confirm `VITE_ADMIN_API_URL` exists:**
   - Key: `VITE_ADMIN_API_URL`
   - Value: `https://pbookspro-api.onrender.com/api/admin`
3. **If missing or wrong:** Add/update it, then rebuild

## Step 5: Force Rebuild with Clean Cache

If the env var is set but build still uses localhost:

1. **In Render Dashboard** → **pbookspro-admin**
2. **Go to "Settings" tab**
3. **Scroll to "Build & Deploy"**
4. **Click "Clear build cache"**
5. **Then trigger "Manual Deploy"** → **"Deploy latest commit"**

## Step 6: Check if .env File Exists

A `.env` file in the repo might override the Render env var:

1. **Check if `admin/.env` exists in your repo**
2. **If it exists and has `VITE_ADMIN_API_URL=localhost`**, it will override Render's env var
3. **Solution:** Either:
   - Delete the `.env` file from the repo
   - Or add `admin/.env` to `.gitignore`
   - Or update the `.env` file to use the Render URL

## Step 7: Verify Build Command

Check the build command in Render:

1. **Go to Render Dashboard** → **pbookspro-admin** → **Settings**
2. **Check "Build Command":**
   - Should be: `cd admin && npm install && npm run build`
3. **The env var should be available during this build**

## Alternative: Use Runtime Configuration

If environment variables still don't work, we can use a runtime config file instead. But first, let's try the above steps.

---

## Quick Test: Check What's Actually Deployed

1. **Open:** `https://pbookspro-admin-8sn6.onrender.com`
2. **View page source** (Right-click → View Page Source)
3. **Search for:** `localhost`
4. **If found:** The build used localhost
5. **If not found:** The build worked, clear browser cache

---

**Most likely causes:**
1. Browser cache (try hard refresh)
2. Build didn't have access to env var (check build logs)
3. `.env` file overriding (check repo)


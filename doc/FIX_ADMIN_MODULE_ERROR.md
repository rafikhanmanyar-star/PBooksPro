# Fix Admin Portal Module Script Error

## Problem
The error "Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"" occurs because:

1. **Service Worker Interference**: The root `sw.js` service worker is being registered and caching files incorrectly
2. **Browser Cache**: Old cached files from the root app are interfering

## Solution

### Step 1: Clear Browser Cache and Service Workers

1. **Open Browser DevTools** (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Click **Service Workers** in the left sidebar
4. Click **Unregister** for any registered service workers
5. Click **Clear storage** → **Clear site data**
6. Or use: `Ctrl + Shift + Delete` → Clear cached files

### Step 2: Restart Admin Portal

1. **Stop the admin portal** (Ctrl+C in terminal)
2. **Restart it**:
   ```powershell
   cd "H:\AntiGravity projects\V1.1.3\PBooksPro\admin"
   npm run dev
   ```

### Step 3: Hard Refresh Browser

- Press `Ctrl + Shift + R` or `Ctrl + F5`
- This forces a full reload without cache

### Step 4: Try Incognito/Private Mode

Open `http://localhost:5174` in an incognito/private window to test without cache interference.

## Alternative: Disable Service Worker Completely

If the issue persists, you can disable service workers in browser:

**Chrome:**
1. Open `chrome://flags/`
2. Search for "Service Workers"
3. Disable "Service Workers"

**Or use DevTools:**
1. F12 → Application tab
2. Service Workers → Check "Bypass for network"

## Verify Fix

After clearing cache and restarting:

1. Open `http://localhost:5174`
2. Check browser console (F12)
3. Should see NO module script errors
4. Should see login page loading correctly

## If Still Not Working

1. **Check Vite terminal** for compilation errors
2. **Verify file structure**:
   ```
   admin/
   ├── index.html
   ├── src/
   │   ├── main.tsx
   │   └── App.tsx
   └── vite.config.ts
   ```
3. **Try different browser** (Chrome, Firefox, Edge)
4. **Check if port 5174 is correct** in Vite output


# Fix Admin Portal Error - AppContext Loading Issue

## Problem

The admin portal (port 5174) is trying to load `AppContext.tsx` from the main app, causing a 500 error:
```
GET http://localhost:5174/context/AppContext.tsx net::ERR_ABORTED 500 (Internal Server Error)
```

## Root Cause

The admin portal's Vite dev server might be:
1. Running from the wrong directory (project root instead of admin folder)
2. Service worker from main app interfering
3. Browser cache serving wrong files

## Solution

### Step 1: Ensure Admin Dev Server Runs from Admin Directory

**IMPORTANT:** The admin dev server MUST be started from the `admin` directory:

```powershell
cd admin
npm run dev
```

**NOT from the root directory!**

### Step 2: Clear Browser Cache

1. Open browser DevTools (F12)
2. Go to **Application** tab
3. Click **Service Workers** → **Unregister** all
4. Click **Storage** → **Clear site data**
5. Hard refresh: `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)

### Step 3: Verify Admin Portal Structure

The admin portal should have:
- `admin/index.html` - Entry HTML file
- `admin/src/main.tsx` - React entry point
- `admin/src/App.tsx` - Main app component
- `admin/vite.config.ts` - Vite configuration

### Step 4: Check Vite Configuration

The `admin/vite.config.ts` should have:
```typescript
root: __dirname, // Use admin directory as root
```

### Step 5: Verify No Cross-Imports

The admin portal should NOT import anything from:
- `../context/AppContext.tsx`
- `../App.tsx`
- `../index.tsx`

It should only use:
- `./context/AdminAuthContext.tsx`
- `./components/*`
- `./services/adminApi.ts`

## Testing

After fixing:

1. **Stop all dev servers**
2. **Start admin portal from admin directory:**
   ```powershell
   cd admin
   npm run dev
   ```
3. **Open http://localhost:5174**
4. **Check browser console** - should NOT see AppContext errors
5. **Verify admin portal loads correctly**

## If Error Persists

1. Check which `index.tsx` is being loaded:
   - Should be: `admin/src/main.tsx`
   - NOT: `index.tsx` (root)

2. Check Vite dev server output:
   - Should show: "Local: http://localhost:5174/"
   - Should NOT show errors about AppContext

3. Verify admin portal is isolated:
   - Admin portal should not access main app files
   - Service worker should not intercept admin requests

## Quick Fix Command

```powershell
# Stop all servers
# Then start admin portal correctly:
cd admin
npm run dev
```


# Native Backend Troubleshooting Guide

## Issue: Native Backend Not Showing

If you don't see the "Using Native Backend" badge, follow these steps:

### Step 1: Check Browser Console

1. Open the app
2. Press `F12` to open DevTools
3. Go to the **Console** tab
4. Look for these messages:

**✅ Good signs:**
```
✅ Native database service available and ready
✅ usePaginatedTransactions: will use native backend
🚀 usePaginatedTransactions: Loading first page from native backend
```

**⚠️ Warning signs:**
```
⚠️ Native database service not available (falling back to sql.js)
🔍 Native DB Check: electronAPI not found on window
🔍 usePaginatedTransactions: native backend not enabled
```

### Step 2: Check Feature Flag

In the browser console, type:
```javascript
localStorage.getItem('useNativeDatabase')
```

**Expected values:**
- `null` or `'true'` = Native backend should be enabled
- `'false'` = Native backend is disabled

**To enable:**
```javascript
localStorage.setItem('useNativeDatabase', 'true');
location.reload();
```

### Step 3: Check Electron Main Process Logs

1. If running in development, check the terminal where you started the app
2. Look for:
   ```
   ✅ Native SQLite backend initialized
   ```

If you see:
```
⚠️ Failed to initialize native SQLite backend (better-sqlite3): [error]
```

This means `better-sqlite3` failed to load. Common causes:
- Node.js/Electron version mismatch (Electron: run `npx electron-rebuild`; Node-only: `npm rebuild better-sqlite3`)
- Missing native dependencies

### Step 4: Verify IPC Handlers

In the browser console, type:
```javascript
window.electronAPI && typeof window.electronAPI.listNativeTransactions
```

**Expected:** `"function"`

**If undefined:**
- The preload script might not be loading
- Check that `electron/preload.cjs` is being used
- Verify `preload` path in `electron/main.cjs`

### Step 5: Test Native Backend Manually

In the browser console:
```javascript
// Test if native backend is available
const api = window.electronAPI;
if (api && api.listNativeTransactions) {
  console.log('✅ Native API available');
  // Try to load transactions
  api.listNativeTransactions({ limit: 10, offset: 0 })
    .then(txs => console.log('✅ Loaded', txs.length, 'transactions:', txs))
    .catch(err => console.error('❌ Error:', err));
} else {
  console.error('❌ Native API not available');
}
```

### Step 6: Check Database File

Verify the native database exists:
- Location: `C:\Users\[YourUsername]\AppData\Roaming\my-projects-pro\native_finance_db.sqlite`
- Should exist after running `node tools/migrate-data-to-native.cjs`

### Common Issues and Fixes

#### Issue: "electronAPI not found"
**Fix:** Make sure you're running the Electron app, not in a browser

#### Issue: "Native backend not enabled"
**Fix:** 
1. Check feature flag: `localStorage.getItem('useNativeDatabase')`
2. Set it: `localStorage.setItem('useNativeDatabase', 'true')`
3. Reload: `location.reload()`

#### Issue: "Failed to initialize native SQLite backend"

**NODE_MODULE_VERSION mismatch (e.g. "compiled against 137, requires 130"):**

Electron 33 bundles Node 22. If your system Node is 23 or 24, `better-sqlite3` will be compiled for the wrong version.

**Recommended fix – use Node 22 for this project:**
1. Install [nvm-windows](https://github.com/coreybutler/nvm-windows) or [fnm](https://github.com/Schniz/fnm)
2. Run: `nvm install 22` and `nvm use 22` (or `fnm use` if `.nvmrc` exists)
3. Delete `node_modules` and run `npm install`
4. Run the app again

**Alternative** (requires Visual Studio C++ build tools):
- `npx electron-rebuild -f -w better-sqlite3`

#### Issue: "No transactions loaded"
**Fix:**
1. Run migration: `node tools/migrate-data-to-native.cjs`
2. Verify database file exists
3. Check console for errors

### Quick Diagnostic Script

Paste this in the browser console to get a full diagnostic:

```javascript
(function() {
  console.log('=== Native Backend Diagnostic ===');
  console.log('1. Electron API available:', !!window.electronAPI);
  console.log('2. listNativeTransactions:', typeof window.electronAPI?.listNativeTransactions);
  console.log('3. Feature flag:', localStorage.getItem('useNativeDatabase'));
  console.log('4. Is Electron:', window.electronAPI?.isElectron);
  
  if (window.electronAPI && window.electronAPI.listNativeTransactions) {
    console.log('5. Testing API call...');
    window.electronAPI.listNativeTransactions({ limit: 1, offset: 0 })
      .then(result => {
        console.log('✅ API call successful:', result.length, 'transactions');
        console.log('6. Sample transaction:', result[0]);
      })
      .catch(err => {
        console.error('❌ API call failed:', err);
      });
  } else {
    console.error('❌ Native API not available');
  }
})();
```

### Still Not Working?

1. **Rebuild the app:**
   ```bash
   npm run build
   npm run electron:build:win
   ```

2. **Check all files are updated:**
   - `electron/preload.cjs` should have `listNativeTransactions`
   - `electron/main.cjs` should have IPC handlers
   - `electron/db.cjs` should exist

3. **Verify database migration:**
   ```bash
   node tools/migrate-data-to-native.cjs
   ```

4. **Check for errors in:**
   - Browser console (F12)
   - Electron main process logs
   - Build output


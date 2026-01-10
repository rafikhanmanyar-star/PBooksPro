# How to Run PM Cycle Allocations Tests

## Problem: Console Doesn't Allow Pasting

If your browser console doesn't allow pasting scripts, here are several solutions:

---

## Solution 1: Enable Console Paste (Recommended)

### Chrome/Edge:
1. Open DevTools (F12)
2. Go to **Settings** (gear icon) or press `F1`
3. Under **Preferences** → **Console**, check:
   - ✅ **"Allow pasting"** or
   - ✅ **"Enable experimental features"**
4. Close settings and try pasting again

### Firefox:
1. Open DevTools (F12)
2. Go to **Settings** (gear icon)
3. Check **"Enable multi-line mode"**
4. Try pasting in the console

---

## Solution 2: Use Browser Snippets (Best for Long Scripts)

1. Open DevTools (F12)
2. Go to **Sources** tab (or **Debugger** in Firefox)
3. In the left sidebar, find **Snippets** section
4. Click **+ New snippet**
5. Name it "PM Cycle Allocations Test"
6. Paste the entire test script from `test-pm-cycle-allocations.js`
7. Press `Ctrl+S` (or `Cmd+S` on Mac) to save
8. Right-click the snippet → **Run** (or press `Ctrl+Enter`)

**Advantages:**
- ✅ Can save and reuse
- ✅ Syntax highlighting
- ✅ Easy to edit
- ✅ Works with long scripts

---

## Solution 3: Use Test Runner HTML Page

1. Open `test-runner.html` in your browser
   - You can open it directly from the file system
   - Or serve it from your application's public folder
2. Make sure you're logged into the application in another tab
3. Click **"Run All Tests"** button
4. Review results in the output area

**Advantages:**
- ✅ User-friendly interface
- ✅ No console needed
- ✅ Visual test results
- ✅ Can run individual tests

---

## Solution 4: Load as External Script

1. Place `test-pm-cycle-allocations.js` in your application's `public` folder
2. In the browser console, type:
   ```javascript
   const script = document.createElement('script');
   script.src = '/test-pm-cycle-allocations.js';
   document.head.appendChild(script);
   ```
3. The script will execute automatically

---

## Solution 5: Use Simplified One-Liner

For quick testing, use the simplified version:

1. Open console
2. Copy and paste this single line (it's shorter, so it might work):

```javascript
fetch('./test-pm-cycle-allocations-simple.js').then(r=>r.text()).then(eval);
```

Or if that doesn't work, try typing it manually:

```javascript
(async()=>{const{getDatabaseService}=await import('./services/database/databaseService');const db=getDatabaseService();await db.initialize();const tables=db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_cycle_allocations'");console.log('Table exists:',tables.length>0);})();
```

---

## Solution 6: Manual Line-by-Line Entry

If pasting still doesn't work, you can run tests manually:

### Quick Schema Check:
```javascript
const { getDatabaseService } = await import('./services/database/databaseService');
const db = getDatabaseService();
await db.initialize();
db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='pm_cycle_allocations'");
```

### Quick Repository Test:
```javascript
const { PMCycleAllocationsRepository } = await import('./services/database/repositories/index');
const repo = new PMCycleAllocationsRepository();
repo.findAll();
```

---

## Recommended Approach

**For first-time testing:** Use **Solution 2 (Snippets)** - it's the most reliable and allows you to save the test for future use.

**For quick checks:** Use **Solution 3 (Test Runner HTML)** - it's user-friendly and doesn't require console access.

**For debugging:** Use **Solution 1 (Enable Paste)** - once enabled, you can paste any script easily.

---

## Troubleshooting

### "Cannot find module" error
- Make sure you're running the test from the application's origin
- The imports use relative paths that only work within the app

### "Database not initialized" error
- Make sure the application is fully loaded
- Try refreshing the page and running the test again

### "Not logged in" warnings
- Make sure you're logged in with a valid tenant account
- Check `localStorage.getItem('tenant_id')` in console

### Script runs but shows errors
- Check the browser console for detailed error messages
- Make sure all dependencies are loaded
- Verify the database schema is up to date

---

## Need Help?

If none of these solutions work, you can:
1. Use the manual test cases in `doc/TEST_PM_CYCLE_ALLOCATIONS_AND_TENANT_ISOLATION.md`
2. Run individual test functions from the test runner HTML page
3. Check browser-specific console settings in your browser's documentation

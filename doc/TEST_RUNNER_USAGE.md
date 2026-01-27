# Test Runner Usage Guide

## Problem: Test Runner Can't Access Application localStorage

**Issue:** If the test runner HTML file is opened in a **different tab** from your application, it cannot access the application's localStorage because:
- Each browser tab has its own isolated localStorage
- The test runner needs to access `tenant_id`, `user_id`, and other data stored by your application

## ✅ Solution: Run Tests in the Application Tab

You have **three options**:

---

## Option 1: Run Script Directly in Application Console (Recommended)

This is the **easiest and most reliable** method:

### Quick One-Liner (Easiest)
1. **Open your application** in browser (make sure you're logged in)
2. **Open DevTools Console** (F12 → Console tab)
3. **Copy the ENTIRE content** of `test-oneliner.js` (it's a single line)
4. **Paste into console** and press Enter
5. **Review results** - tests run automatically

### Full Test Script (More Detailed)
1. **Open your application** in browser (make sure you're logged in)
2. **Open DevTools Console** (F12 → Console tab)
3. **Open `test-console-simple.js` in a text editor** (NOT the HTML file!)
4. **Copy ALL the JavaScript code** (from `// PM Cycle Allocations Test Script` to the end)
5. **Paste into console** and press Enter
6. **Review results** - all tests will run automatically

**⚠️ IMPORTANT:** 
- Make sure you're copying from a `.js` file, NOT `.html` file
- The file should start with `//` (comment) or `(async function`, NOT with `<!DOCTYPE` or `<html>`
- If you see HTML tags (`<`, `>`, `<!DOCTYPE`), you copied the wrong file!

**Advantages:**
- ✅ Works immediately (no setup)
- ✅ Has access to all localStorage data
- ✅ Can access application context if needed
- ✅ Works in production/bundled environments

---

## Option 2: Open Test Runner in Same Tab

If you prefer using the HTML test runner:

1. **Open your application** in browser
2. **Login** with valid credentials
3. **In the SAME tab**, open `test-runner-fixed.html`
   - You can drag-and-drop the file into the browser
   - Or open it from file system
   - **Important:** Must be in the same tab as your application
4. **Click "Run All Tests"** button
5. **Review results**

**Note:** This works, but you'll lose your application state when you open the HTML file in the same tab.

---

## Option 3: Use Browser Snippets

1. **Open DevTools** (F12)
2. **Go to Sources tab** (or Debugger in Firefox)
3. **Find Snippets** in left sidebar
4. **Create new snippet** - name it "PM Cycle Test"
5. **Paste content** from `test-console-direct.js`
6. **Save** (Ctrl+S)
7. **Right-click snippet** → **Run** (or Ctrl+Enter)

**Advantages:**
- ✅ Can save and reuse
- ✅ Works in application tab
- ✅ Easy to edit

---

## Quick Test Script (One-Liner)

For a quick check, paste this in your application's console:

```javascript
console.log('Tenant ID:', localStorage.getItem('tenant_id') || '❌ Not found');
console.log('User ID:', localStorage.getItem('user_id') || '⚠️ Not found');
(async()=>{const t=localStorage.getItem('tenant_id');const tok=localStorage.getItem('auth_token')||localStorage.getItem('token');if(t&&tok){try{const r=await fetch('https://pbookspro-api.onrender.com/api/pm-cycle-allocations',{headers:{'Authorization':`Bearer ${tok}`,'X-Tenant-ID':t}});console.log('API Status:',r.status,r.ok?'✅':'❌');if(r.ok){const d=await r.json();console.log('Allocations:',d.length||0);}}catch(e){console.log('API Error:',e.message);}}else{console.log('⚠️ Not logged in');}})();
```

---

## Recommended Approach

**For testing in production/deployed environments:**

1. ✅ Use `test-console-direct.js` - paste directly in application console
2. ✅ This ensures you're in the same tab as your application
3. ✅ Has full access to localStorage
4. ✅ Works with bundled/production code

**For development:**

- Any of the above methods work
- Test runner HTML is fine if you open it in the same tab
- Direct console script is still the simplest

---

## Troubleshooting

### "Tenant ID not found"
- **Solution:** Make sure you're logged into the application
- **Verify:** Open console in application tab and type: `localStorage.getItem('tenant_id')`

### "User ID not found"
- **Solution:** This might be normal if user_id isn't set during login
- **Check:** Verify login flow sets `user_id` in localStorage

### "API endpoint not reachable"
- **Solution:** Check if you're online
- **Check:** Verify API base URL is correct
- **Note:** Offline mode is OK - tests will indicate this

---

## Files Available

1. **`test-oneliner.js`** - ⭐ EASIEST - Single line, paste directly in console
2. **`test-console-simple.js`** - ⭐ RECOMMENDED - Clean, easy to read, paste directly in console
3. **`test-console-direct.js`** - Full-featured version with detailed output
4. **`test-runner-fixed.html`** - HTML test runner (must be in same tab as app)
5. **`test-pm-cycle-allocations-production.js`** - Production-ready script

**⚠️ Which file to use?**
- Use `test-oneliner.js` if you want the quickest test (one line to paste)
- Use `test-console-simple.js` if you want readable code with clear results
- **DO NOT use `.html` files** - those are for opening in browser, not for pasting in console!

---

## Next Steps

1. ✅ Open your application in browser
2. ✅ **Login** with valid credentials (important!)
3. ✅ Open DevTools Console (F12 → Console tab)
4. ✅ **Open `test-oneliner.js` in a text editor** (make sure it's the `.js` file, NOT `.html`!)
5. ✅ Copy the entire content (it should start with `(async()` not `<!DOCTYPE`)
6. ✅ Paste into console and press Enter
7. ✅ Review test results

**Troubleshooting Syntax Error:**
- ❌ If you get "Unexpected token '<'" → You copied HTML instead of JavaScript
- ✅ Solution: Make sure you're copying from a `.js` file, not `.html`
- ✅ The file should start with `//` or `(async` or `(function`, NOT with `<!DOCTYPE` or `<html>`

This will give you the most accurate test results!

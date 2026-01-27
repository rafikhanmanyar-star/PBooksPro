# How to Test "Clear All Transactions" Feature

## ✅ Fix Applied

**Issue Fixed:** Duplicate account key error after clearing transactions and re-logging in.

**Solution:** The local database now clears accounts along with transactions to avoid sync conflicts. On next login, everything (including accounts with reset balances) will be reloaded from the cloud database.

---

## 📋 Pre-Test Checklist

### 1. Clear Your Browser Cache
Since you've been testing with errors, clear your local database:

**Option A - Quick Clear (Recommended):**
1. Open browser DevTools (F12)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Find **IndexedDB** → **pbookspro-local-db** (or similar)
4. Right-click → **Delete database**
5. Refresh the page

**Option B - Hard Refresh:**
- Chrome/Edge: `Ctrl + Shift + Delete` → Clear "Cached images and files"
- Or just: `Ctrl + Shift + R` (hard refresh)

### 2. Wait for Render Deployment
Check that Render has deployed the latest commit (`fc9bc6b`):
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Check your backend service
3. Verify latest deployment is complete ✅

---

## 🧪 Testing Steps

### Test 1: Clear Transactions (Cloud DB)

1. **Login as Admin user**
   - Make sure your user has `role = 'Admin'`

2. **Verify you have data**
   - Go to Transactions page
   - Note: You should see some transactions

3. **Navigate to Settings**
   - Click Settings → Data Management

4. **Verify button visibility**
   - ✅ Admin user: Should see "Clear Transactions" button with "⚠️ Admin Only" badge
   - ❌ Non-admin user: Button should be hidden

5. **Click "Clear Transactions"**
   - Modal should open (no 404 error)
   - Read the warnings carefully

6. **Type confirmation**
   - Type exactly: `Clear transaction` (case-sensitive)
   - Button should become enabled

7. **Confirm deletion**
   - Click "Clear All Transactions" button
   - Should see loading indicator
   - Wait for success message

8. **Verify cloud deletion**
   - Refresh the page
   - Go to Transactions page
   - Should be empty ✅

---

### Test 2: Re-Login (Local DB Sync)

9. **Logout**
   - Click logout

10. **Login again with same admin user**
    - Use same credentials

11. **Verify no errors**
    - ✅ Should login successfully
    - ✅ NO "UNIQUE constraint failed: accounts.id" error in console
    - ✅ NO duplicate key errors

12. **Check data state**
    - Transactions page: Should be empty (as expected)
    - Accounts page: Should show accounts with 0 balances
    - Contacts: Should still exist
    - Projects/Properties: Should still exist

---

### Test 3: Add New Transaction

13. **Create a new transaction**
    - Go to Transactions → Add New
    - Create a test transaction
    - Should work without errors ✅

14. **Verify account balance updates**
    - Check the account balance
    - Should reflect the new transaction ✅

---

## ✅ Expected Results

| Test | Expected Result |
|------|----------------|
| Modal opens | ✅ No 404 error |
| Type confirmation | ✅ Button enables when text matches |
| Clear executes | ✅ Success message with record count |
| Data cleared from cloud | ✅ Transactions gone after refresh |
| Re-login | ✅ No duplicate key errors |
| Local DB syncs | ✅ Data reloads from cloud |
| Accounts exist | ✅ With 0 balances |
| Contacts preserved | ✅ Still exist |
| New transaction | ✅ Works normally |

---

## 🐛 If You Still See Errors

### Error: "UNIQUE constraint failed: accounts.id"

**Solution:** Clear your local database manually:
```javascript
// Open DevTools Console (F12) and run:
(async () => {
  const dbs = await indexedDB.databases();
  dbs.forEach(db => indexedDB.deleteDatabase(db.name));
  console.log('✅ All local databases cleared');
  location.reload();
})();
```

### Error: "404 Not Found"

**Solution:** Server not deployed yet:
1. Check Render dashboard
2. Manually trigger deployment if needed
3. Wait 3-5 minutes
4. Try again

### Error: "Only organization administrators can perform this action"

**Solution:** User is not admin:
1. Verify your user has `role = 'Admin'` in the database
2. Logout and login again
3. Check AuthContext is providing user.role correctly

---

## 📊 What Gets Cleared vs Preserved

### ❌ **Cleared (Both Cloud & Local):**
- All transactions
- All invoices
- All bills
- All contracts
- All rental agreements
- All project agreements
- All sales returns
- All payslips
- All quotations
- **Accounts (from local DB only - will reload from cloud with 0 balances)**

### ✅ **Preserved (Cloud DB):**
- Accounts (with balances reset to 0)
- Contacts (owners, tenants, brokers)
- Categories
- Projects, buildings, properties, units
- All settings and configurations
- User accounts

---

## 🎯 Success Criteria

✅ Modal opens without 404 error
✅ Confirmation requires exact text typing
✅ Transactions cleared from cloud database
✅ Re-login works without duplicate key errors
✅ Accounts reload with 0 balances
✅ Configuration data preserved
✅ Can add new transactions after clearing

**If all criteria pass, the feature is working correctly!** 🚀


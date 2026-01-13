# Offline Sync System - Testing Guide

## Overview
This guide helps you test the offline sync functionality that has been implemented in your application.

## Prerequisites
- Ensure you're logged in with a cloud account (authenticated user)
- Have Chrome DevTools or similar browser developer tools available
- Have some test data ready to create (transactions, contacts, etc.)

## Test Scenarios

### 1. Connection Status Display

**Test Steps:**
1. Open the application in your browser
2. Look at the header (top-right area)
3. You should see an online/offline status indicator with a green dot and "Online" text

**Expected Result:**
- ✓ Green dot with "Online" label visible in header
- ✓ Status updates immediately when you toggle offline mode

**How to Toggle Offline Mode:**
- Open Chrome DevTools (F12)
- Go to Network tab
- Check "Offline" checkbox (or select "Offline" from the throttling dropdown)

---

### 2. Offline Data Entry

**Test Steps:**
1. Enable offline mode in Chrome DevTools (Network tab → Offline)
2. Verify the status changes to red dot with "Offline" in the header
3. Try creating a new transaction:
   - Go to transactions page
   - Click "Add Transaction"
   - Fill in the details
   - Save the transaction

**Expected Result:**
- ✓ Transaction is saved locally immediately
- ✓ Transaction appears in the transaction list
- ✓ Status indicator shows "1" pending operation
- ✓ A notification appears: "Changes saved locally and will sync when online"
- ✓ No errors or failures occur

---

### 3. Multiple Offline Operations

**Test Steps:**
1. While still offline, perform multiple operations:
   - Create 2-3 transactions
   - Create a contact
   - Update an existing invoice
   - Delete a bill (if you have one)

**Expected Result:**
- ✓ All operations save successfully to local database
- ✓ Pending count in header increases (e.g., "5" if you did 5 operations)
- ✓ All changes visible immediately in the UI
- ✓ Sync notification shows pending operations count

---

### 4. Settings Lockdown When Offline

**Test Steps:**
1. While offline, navigate to Settings page
2. Try to access various settings sections

**Expected Result:**
- ✓ Orange banner appears at top: "Settings changes are disabled while offline"
- ✓ "Add New" and save buttons are disabled (grayed out)
- ✓ Settings forms are read-only
- ✓ Banner message explains why: "Changes won't be saved until you're back online"

---

### 5. Logout/Login While Offline

**Test Steps:**
1. While offline with pending operations, logout
2. Verify pending count still shows in header
3. Login again with same credentials
4. Check if pending operations are still queued

**Expected Result:**
- ✓ Sync queue persists after logout
- ✓ After login, pending count reappears
- ✓ Operations are filtered by tenant (only your operations show)
- ✓ No data loss occurs

---

### 6. Auto-Sync on Reconnection

**Test Steps:**
1. Ensure you have pending operations (offline data entries)
2. Re-enable internet connection:
   - In Chrome DevTools, uncheck "Offline"
   - Or go back to "No throttling" in Network tab
3. Wait a few seconds

**Expected Result:**
- ✓ Status changes to green "Online" immediately
- ✓ Sync notification appears automatically: "Syncing data to cloud..."
- ✓ Progress bar shows sync progress (e.g., "2 of 5 operations")
- ✓ Success notification appears: "Sync complete. Successfully synced X operations"
- ✓ Pending count drops to 0
- ✓ All operations are now in the cloud database

---

### 7. Sync Progress Display

**Test Steps:**
1. Create 5-10 operations while offline
2. Go back online
3. Watch the sync notification

**Expected Result:**
- ✓ Blue spinning icon with "Syncing data to cloud..." message
- ✓ Progress counter updates: "1 of 10", "2 of 10", etc.
- ✓ Progress bar fills up gradually
- ✓ Current operation type shown (e.g., "create transaction")
- ✓ Success notification at the end
- ✓ Auto-dismisses after 5 seconds

---

### 8. Network Error Handling

**Test Steps:**
1. While online, quickly toggle offline mode while creating data
2. Try to create a transaction
3. The API call will fail mid-request

**Expected Result:**
- ✓ No error messages shown to user
- ✓ Operation queued for later sync
- ✓ Data saved locally
- ✓ User can continue working
- ✓ Operation syncs when you go back online

---

### 9. Session Persistence Across Browser Refresh

**Test Steps:**
1. While offline, create some operations (2-3 transactions)
2. Verify pending count shows (e.g., "3")
3. Refresh the browser page (F5)
4. Wait for app to reload

**Expected Result:**
- ✓ After reload, offline status still shows
- ✓ Pending count is still "3"
- ✓ No operations lost
- ✓ Queue persists in IndexedDB

---

### 10. Data Verification in Cloud

**Test Steps:**
1. Complete a full offline → online sync cycle
2. Log out from current device
3. Log in from a different browser/device (or incognito window)
4. Check if the synced data appears

**Expected Result:**
- ✓ All synced operations appear in the cloud account
- ✓ Transactions created offline now visible
- ✓ Contacts created offline now visible
- ✓ All operations have correct timestamps
- ✓ Data integrity maintained

---

## Verification Checklist

After completing all tests, verify:

- [ ] Online/offline status displays correctly in header
- [ ] Pending operations count displays when offline
- [ ] All data types can be created/updated/deleted offline
- [ ] Sync queue persists across logout/login
- [ ] Sync queue persists across browser refresh
- [ ] Auto-sync triggers when connection restored
- [ ] Sync progress notification displays correctly
- [ ] Success notification shows after sync completes
- [ ] Failed operations retry with exponential backoff
- [ ] Settings page shows offline banner
- [ ] Settings changes are disabled when offline
- [ ] No data loss during offline usage
- [ ] Network errors don't logout user
- [ ] All synced data appears in cloud database

---

## Troubleshooting

### Issue: Pending count doesn't appear
**Solution:** Make sure you're authenticated (logged in with cloud account). Offline sync only works for authenticated users.

### Issue: Sync doesn't start automatically
**Solution:** 
1. Check browser console for errors
2. Verify you have pending operations (check pending count)
3. Try manually refreshing the page after going online

### Issue: Some operations fail to sync
**Solution:**
1. Check browser console for specific error messages
2. Verify your auth token is valid (not expired)
3. Failed operations will retry up to 3 times
4. After 3 failures, they'll be marked as "failed" and notification will show

### Issue: Settings still editable when offline
**Solution:** 
1. Hard refresh the page (Ctrl+Shift+R)
2. Check that OfflineContext is properly initialized
3. Verify the offline status is being detected correctly

---

## Developer Console Commands

Useful commands for debugging (paste in browser console):

```javascript
// Check IndexedDB sync queue
indexedDB.databases().then(console.log);

// Check connection status
console.log(navigator.onLine);

// Check localStorage for connection status
console.log(localStorage.getItem('connection_status'));

// Manually trigger sync (if implemented)
// Note: This requires access to the sync engine instance
```

---

## Success Criteria

The offline sync system is working correctly if:

1. ✅ Users can work completely offline without any errors
2. ✅ All operations save to local SQLite database immediately
3. ✅ Operations are queued in IndexedDB for later sync
4. ✅ Sync happens automatically when connection is restored
5. ✅ Sync progress is clearly communicated to users
6. ✅ No data loss occurs during offline/online transitions
7. ✅ Settings are properly locked down when offline
8. ✅ Sync queue persists across sessions (logout/login/refresh)
9. ✅ Network errors are handled gracefully (no logout)
10. ✅ All synced data appears correctly in cloud database

---

## Notes

- The sync queue is stored in IndexedDB (separate from SQLite database)
- Each queue item includes: tenantId, userId, type, action, data, timestamp
- Maximum 3 retry attempts for failed operations
- Exponential backoff between retries (2s, 4s, 8s)
- Completed operations are auto-removed from queue
- Failed operations remain in queue for manual inspection

---

## Report Issues

If you encounter any issues during testing, please note:
1. The specific operation that failed
2. Browser console error messages
3. Network tab activity (if relevant)
4. Steps to reproduce the issue
5. Expected vs actual behavior

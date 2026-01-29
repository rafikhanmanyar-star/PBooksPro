# Sync Debug Console Commands

Paste these commands into your browser's DevTools console to diagnose sync issues.

## Check SyncManager Queue Status

```javascript
// Get current queue from localStorage
const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
console.log('=== SYNC MANAGER QUEUE ===');
console.log('Total items:', queue.length);
console.log('Pending:', queue.filter(op => op.status === 'pending').length);
console.log('Syncing:', queue.filter(op => op.status === 'syncing').length);
console.log('Failed:', queue.filter(op => op.status === 'failed').length);
console.log('Completed:', queue.filter(op => op.status === 'completed').length);
console.log('\nFirst 5 items:', queue.slice(0, 5));
```

## Check Failed Operations (SEE WHY THEY FAILED)

```javascript
// Show all failed operations with error messages
const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
const failed = queue.filter(op => op.status === 'failed');
console.log('=== FAILED OPERATIONS ===');
console.log('Total failed:', failed.length);
failed.forEach((op, i) => {
  console.log(`\n${i + 1}. ${op.entity}:${op.entityId}`);
  console.log('   Type:', op.type);
  console.log('   Retries:', op.retries);
  console.log('   Error:', op.errorMessage || 'No error message');
  console.log('   Data:', op.data);
});
```

## Check Stuck "Syncing" Operations

```javascript
// Show operations stuck in "syncing" state
const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
const syncing = queue.filter(op => op.status === 'syncing');
console.log('=== SYNCING OPERATIONS ===');
console.log('Total syncing:', syncing.length);
syncing.forEach((op, i) => {
  const stuckTime = op.syncStartedAt ? Math.round((Date.now() - op.syncStartedAt) / 1000) : 'unknown';
  console.log(`\n${i + 1}. ${op.entity}:${op.entityId}`);
  console.log('   Type:', op.type);
  console.log('   Started:', stuckTime, 'seconds ago');
  console.log('   Data:', op.data);
});
```

## Force Trigger Sync

```javascript
// Manually trigger sync batch
const { getSyncManager } = await import('./services/sync/syncManager');
const manager = getSyncManager();
console.log('Current status:', manager.getQueueStatus());
console.log('Triggering syncQueueBatch()...');
await manager.syncQueueBatch();
```

## Check Bi-directional Sync

```javascript
// Manually run bi-directional sync
const { getBidirectionalSyncService } = await import('./services/sync/bidirectionalSyncService');
const { useAuth } = await import('./context/AuthContext');
const bidir = getBidirectionalSyncService();

// Get tenant ID (you'll need to be logged in)
const tenantId = 'YOUR_TENANT_ID'; // Replace with actual tenant ID
console.log('Running bi-directional sync for tenant:', tenantId);
const result = await bidir.runSync(tenantId);
console.log('Sync result:', result);
```

## Check sync_outbox (SQLite)

```javascript
// Check outbox table
const { getSyncOutboxService } = await import('./services/sync/syncOutboxService');
const outbox = getSyncOutboxService();

// Get tenant ID
const tenantId = 'YOUR_TENANT_ID'; // Replace with actual tenant ID
const pending = outbox.getPending(tenantId);
console.log('=== SYNC OUTBOX ===');
console.log('Pending items:', pending.length);
console.log('Items:', pending);
```

## Reset Sync (Clear Queue) - USE WITH CAUTION

```javascript
// ⚠️ WARNING: This will delete all pending sync operations!
// Only use this if you're sure the data is already in the cloud
const { getSyncManager } = await import('./services/sync/syncManager');
const manager = getSyncManager();
console.warn('⚠️ Clearing all sync operations...');
manager.clearAll();
console.log('Queue cleared. New status:', manager.getQueueStatus());
```

## Check Connection Status

```javascript
// Check if app thinks it's online
const { getConnectionMonitor } = await import('./services/connection/connectionMonitor');
const monitor = getConnectionMonitor();
console.log('Connection status:', monitor.isOnline() ? '🟢 Online' : '🔴 Offline');
```

## Monitor Queue in Real-Time

```javascript
// Watch queue status every second
const { getSyncManager } = await import('./services/sync/syncManager');
const manager = getSyncManager();

let count = 0;
const interval = setInterval(() => {
  const status = manager.getQueueStatus();
  console.log(`[${++count}s] Queue: ${status.total} total, ${status.pending} pending, ${status.syncing} syncing, ${status.failed} failed`);
  
  // Stop after 30 seconds
  if (count >= 30) {
    clearInterval(interval);
    console.log('Monitoring stopped');
  }
}, 1000);

// To stop manually: clearInterval(interval);
```

## Check Authentication Status

```javascript
// Check if authenticated
const { isAuthenticatedSafe } = await import('./services/api/client');
const isAuth = isAuthenticatedSafe();
console.log('Authenticated:', isAuth ? '✅ Yes' : '❌ No');
```

## Full Diagnostic Report

```javascript
// Generate complete diagnostic report
(async () => {
  console.log('=== SYNC DIAGNOSTIC REPORT ===\n');
  
  // 1. localStorage queue
  const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
  console.log('1. SYNC MANAGER (localStorage):');
  console.log('   Total:', queue.length);
  console.log('   Pending:', queue.filter(op => op.status === 'pending').length);
  console.log('   Syncing:', queue.filter(op => op.status === 'syncing').length);
  console.log('   Failed:', queue.filter(op => op.status === 'failed').length);
  
  // 2. Connection status
  const { getConnectionMonitor } = await import('./services/connection/connectionMonitor');
  const monitor = getConnectionMonitor();
  console.log('\n2. CONNECTION:');
  console.log('   Status:', monitor.isOnline() ? '🟢 Online' : '🔴 Offline');
  
  // 3. Authentication
  const { isAuthenticatedSafe } = await import('./services/api/client');
  const isAuth = isAuthenticatedSafe();
  console.log('\n3. AUTHENTICATION:');
  console.log('   Authenticated:', isAuth ? '✅ Yes' : '❌ No');
  
  // 4. SyncManager instance
  const { getSyncManager } = await import('./services/sync/syncManager');
  const manager = getSyncManager();
  const status = manager.getQueueStatus();
  console.log('\n4. SYNC MANAGER INSTANCE:');
  console.log('   Status:', status);
  
  // 5. Database ready
  const { getDatabaseService } = await import('./services/database/databaseService');
  const db = getDatabaseService();
  console.log('\n5. DATABASE:');
  console.log('   Ready:', db.isReady() ? '✅ Yes' : '❌ No');
  
  console.log('\n=== END REPORT ===');
})();
```

## Expected Console Logs (When Sync is Working)

When sync is working properly, you should see these logs every few seconds:

```
[SyncManager] 📊 Queue status: 63 total, 63 pending, 0 syncing, 0 failed
[SyncManager] 🔄 syncQueueBatch() called
[SyncManager] 🚀 Starting sync batch: 20 operations in parallel (43 remaining in queue)
[SyncManager] ✅ Synced create for inventory_items:...
[SyncManager] ✅ Synced create for warehouses:...
[SyncManager] ✅ Batch sync completed. 43 operations remaining
[SyncManager] ⏱️ Scheduling next batch in 300ms...
[SyncManager] 🔓 Resetting isSyncing flag to false
```

## Common Issues

### Queue shows 0 but items exist

**Cause:** `clearAll()` was called, or localStorage was cleared.

**Fix:** Check for warning: `⚠️ clearAll() called - clearing N operations!`

### "Already syncing" warning appearing

**Cause:** `isSyncing` flag stuck at `true`.

**Check logs for:** `⚠️ Already syncing (isSyncing=true) - skipping`

**Fix:** Restart browser or run:
```javascript
const { getSyncManager } = await import('./services/sync/syncManager');
getSyncManager().isSyncing = false; // Force reset (unsafe, but works)
```

### No sync logs appearing

**Cause:** Sync not being triggered.

**Check:**
1. Is user authenticated?
2. Is connection online?
3. Is bi-directional sync service started?

**Fix:** Manually trigger sync (see "Force Trigger Sync" above)

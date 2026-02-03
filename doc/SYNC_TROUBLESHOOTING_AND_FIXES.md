# Sync Troubleshooting and Fixes

## Issues Found and Fixed

### 1. **Slow sync (66 records taking too long)**

**Cause:** SyncManager processed items **one-by-one** (sequential) with only 10 per batch and 2-second delays between batches.

**Fix:**
- Changed to **parallel batch processing** using `Promise.allSettled()` 
- Increased batch size from 10 to **20** operations
- Reduced delay between batches from 2000ms to **300ms**

**Files changed:**
- `services/sync/syncManager.ts` - parallel execution in `syncQueueBatch()`

**Result:** ~3-4x faster for 66 records

---

### 2. **Diagnostics showed 0 while status showed 64 items**

**Cause:** Two separate queues were not in sync:
- **SyncManager** (in-memory + localStorage) - used by status indicator
- **IndexedDB SyncQueue** - used by diagnostics modal

**Fix:**
- Diagnostics now shows BOTH queues with separate sections
- "Local sync queue (SyncManager)" refreshes every 1 second
- Always visible at top of modal (same source as status indicator)

**Files changed:**
- `components/ui/SyncDiagnosticPanel.tsx`

---

### 3. **Queue being cleared on login (root cause)**

**Cause:** When loading state from cloud on login, the code called `syncManager.clearAll()`, which **wiped out all 63 pending operations**! The comment said "pending sync operations are now stale" but that's wrong for bi-directional sync where local changes need to be pushed upstream.

**Fix:**
- **Removed** both `clearAll()` calls when loading from cloud
- Local changes now persist and get pushed by bi-directional sync
- Added warning log when `clearAll()` is called to detect future issues

**Files changed:**
- `context/AppContext.tsx` - removed 2 x `syncManager.clearAll()` calls
- `services/sync/syncManager.ts` - added warning logs to `clearAll()`

---

### 4. **sync_outbox table missing**

**Cause:** The new `sync_outbox` and `sync_metadata` tables were added to the schema but weren't created before other schema statements ran, causing "no such table: main.sync_outbox".

**Fix:**
- Added dedicated `ensureSyncTablesExist()` that creates sync tables FIRST
- Called at start of `ensureAllTablesExist()` before executing full schema

**Files changed:**
- `services/database/databaseService.ts`

---

## Bi-directional Sync Implementation

### Components Added

1. **Schema tables** (`services/database/schema.ts`):
   - `sync_outbox` - persistent change log for offline writes
   - `sync_metadata` - last_synced_at per tenant for incremental sync

2. **Conflict resolution** (`services/sync/conflictResolution.ts`):
   - Last Write Wins (default) - compares updated_at timestamps
   - Interface for Manual Merge (future)

3. **Outbox service** (`services/sync/syncOutboxService.ts`):
   - Enqueue, mark synced/failed, get pending count

4. **Metadata service** (`services/sync/syncMetadataService.ts`):
   - Track last_pull_at for incremental downstream sync

5. **Bi-directional sync** (`services/sync/bidirectionalSyncService.ts`):
   - Upstream: push from outbox + SyncManager
   - Downstream: incremental pull from cloud with conflict resolution
   - Connectivity-driven (auto-runs on login and reconnect)

6. **Server endpoint** (`server/api/routes/stateChanges.ts`):
   - `GET /api/state/changes?since=ISO8601`
   - Returns only entities updated after timestamp

### How It Works

1. **On login / reconnect:**
   - `BidirectionalSyncService.start(tenantId)` subscribes to connection monitor
   - Runs `runSync(tenantId)` once

2. **Upstream (local → cloud):**
   - Reads from `sync_outbox` (if populated)
   - ALSO processes `SyncManager` queue (for backward compatibility)
   - Pushes each operation to cloud API
   - Marks synced/failed in outbox
   - Removes from SyncManager after success

3. **Downstream (cloud → local):**
   - Gets `since = last_pull_at` from metadata
   - Fetches `GET /api/state/changes?since=...`
   - For each remote entity:
     - Loads local version (if exists)
     - Runs conflict resolution (Last Write Wins by default)
     - Applies winner to local DB
   - Updates `last_pull_at` timestamp

4. **Efficiency:**
   - Only entities with `updated_at > since` are fetched (incremental)
   - Conflict resolution prevents data loss

---

## Testing / Verification

### Check Queue Persistence

Open browser DevTools console and run:

```javascript
// Check SyncManager localStorage
const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
console.log('SyncManager queue:', queue.length, 'items');
console.log('Status breakdown:', {
  pending: queue.filter(op => op.status === 'pending').length,
  syncing: queue.filter(op => op.status === 'syncing').length,
  failed: queue.filter(op => op.status === 'failed').length
});
```

### Check sync_outbox

```javascript
// Open IndexedDB and check sync_outbox table
// (Use Application > IndexedDB > FinanceTrackerSyncQueue in DevTools)
```

### Monitor Sync Process

Watch for these logs in console:
- `[SyncManager] getQueueStatus: X total, Y pending...` - every time status is read
- `[SyncManager] Starting sync batch: N operations in parallel...` - when sync starts
- `[SyncManager] ✅ Synced ... for ...` - each successful sync
- `[SyncManager] Batch sync completed. X operations remaining` - after each batch
- `📤 Upstream: X from outbox, SyncManager also processed` - bi-directional sync
- `📥 Downstream: X applied, Y skipped` - conflict resolution results

### Verify Diagnostics Match Status

1. Open app and create some offline changes (inventory items, warehouses)
2. Check status indicator (bottom-right): "X operations in progress, Y more waiting"
3. Click "Details" to open diagnostics
4. "Local sync queue (SyncManager)" should show same numbers
5. Should update every 1 second while modal is open

---

## Common Issues

### Queue shows 0 after login

**Cause:** `clearAll()` might still be called somewhere.

**Check:** Look for warning in console: `⚠️ clearAll() called - clearing N operations!`

**Fix:** Find the caller (stack trace in log) and remove the clearAll() call.

### Sync not running

**Cause:** Bi-directional sync might not be starting.

**Check:** Look for logs: `🌐 Online: starting bi-directional sync`

**Fix:** Ensure `BidirectionalSyncService.start(tenantId)` is called in `AuthContext` when authenticated.

### "no such table: sync_outbox"

**Cause:** Database not initialized or ensureSyncTablesExist() not running.

**Check:** Refresh browser (hard reload to clear cache).

**Fix:** The `ensureSyncTablesExist()` method now creates the tables before the rest of the schema.

---

## Disabling Server Migrations (Temporary)

Set environment variable in server `.env`:

```env
DISABLE_MIGRATIONS=true
```

This skips migrations on server startup (useful when staging DB is already updated).

To re-enable: remove the variable or set to `false`.

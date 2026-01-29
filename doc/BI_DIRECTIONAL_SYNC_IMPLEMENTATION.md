# Bi-directional Sync Implementation

Production-ready bi-directional data synchronization: connectivity-driven, outbox-based upstream, incremental downstream, and pluggable conflict resolution.

## 1. Connectivity Monitoring

- **Existing:** `services/connectionMonitor.ts` – detects online/offline via `navigator.onLine` and optional health check.
- **Wiring:** `BidirectionalSyncService.start(tenantId)` subscribes to the connection monitor and runs full sync when status becomes `online`.
- **Auth:** When the user logs in (or auth is restored), `AuthContext` calls `getBidirectionalSyncService().start(tenant.id)` and runs `runSync(tenant.id)` once. On logout, `stop()` is called.

## 2. Queue Management (Outbox / Change Log)

- **Tables (client SQLite):**
  - **`sync_outbox`** – persistent change log for offline writes.
    - Columns: `id`, `tenant_id`, `user_id`, `entity_type`, `action` (create|update|delete), `entity_id`, `payload_json`, `created_at`, `updated_at`, `synced_at`, `status` (pending|syncing|synced|failed), `retry_count`, `error_message`.
  - **`sync_metadata`** – stores `last_synced_at` / `last_pull_at` per tenant for incremental sync.
    - Columns: `tenant_id`, `entity_type`, `last_synced_at`, `last_pull_at`, `updated_at`; PK `(tenant_id, entity_type)`.

- **When offline:** `BaseRepository.queueForSync()` writes to both:
  - **SyncManager** (in-memory + localStorage) – for existing UI/counts.
  - **SyncOutboxService** – inserts into `sync_outbox` (single source of truth for upstream).

- **Services:**
  - **`services/sync/syncOutboxService.ts`** – `enqueue()`, `getPending()`, `markSynced()`, `markFailed()`, `getPendingCount()`.
  - **`services/sync/syncMetadataService.ts`** – `getLastPullAt()`, `setLastPullAt()`, `getLastSyncedAt()`, `setLastSyncedAt()`.

## 3. Synchronization Logic

### Upstream (push local → cloud)

- **When:** On connection restore (and once after login).
- **Flow:** `BidirectionalSyncService.runUpstream(tenantId)`:
  1. Reads pending items from `SyncOutboxService.getPending(tenantId)`.
  2. For each item: maps `entity_type` to API endpoint, calls `apiClient.post()` or `apiClient.delete()`.
  3. On success: `outbox.markSynced(id)`, `SyncManager.removeByEntity(entity, entityId)`.
  4. On failure: `outbox.markFailed(id, error)`.
  5. Updates `sync_metadata.last_synced_at` after a successful push.

### Downstream (pull cloud → local)

- **When:** After upstream, in the same `runSync()`.
- **Flow:** `BidirectionalSyncService.runDownstream(tenantId)`:
  1. Gets `since = SyncMetadataService.getLastPullAt(tenantId)` (or epoch if never synced).
  2. Calls `GET /api/state/changes?since=ISO8601` (incremental).
  3. For each entity type and each remote record:
     - Loads local record (if any) via `AppStateRepository.getEntityById(entityKey, id)`.
     - Builds `ConflictContext` and runs **conflict resolution** (see below).
     - If result is `use: 'remote'` or `use: 'merged'`, calls `AppStateRepository.upsertEntity(entityKey, toApply)`.
  4. Sets `SyncMetadataService.setLastPullAt(tenantId, now)`.
- **Efficiency:** Only entities with `updated_at > since` are returned by the server; client applies only those (incremental).

## 4. Conflict Resolution

- **Location:** `services/sync/conflictResolution.ts`.
- **Interface:** `IConflictResolver` with `strategy` and `resolve<T>(context: ConflictContext<T>): ConflictResult<T>`.
- **Default (production):** **Last Write Wins** – `LastWriteWinsResolver` compares `updated_at` / `updatedAt`; newer wins; tie goes to remote.
- **Swapping to Manual Merge:** Use `ManualMergeResolver` (or your own) and call `setConflictResolver(new ManualMergeResolver())` at app init. Structure is ready for a manual-merge UI later (e.g. `needsManualReview` and `merged` in `ConflictResult`).

## 5. Efficiency (Incremental Sync)

- **Client:** `sync_metadata` stores `last_pull_at` (one row per tenant with `entity_type = '_global'`). Downstream requests use `since=last_pull_at`.
- **Server:** `GET /api/state/changes?since=ISO8601` in `server/api/routes/stateChanges.ts` queries each entity table with `WHERE tenant_id = $1 AND updated_at > $2`, returns only changed rows. No full DB dump.

## Database Schema Changes (Client)

- **`services/database/schema.ts`:** Defines `sync_outbox` and `sync_metadata` in `CREATE_SCHEMA_SQL`.
- **`services/database/databaseService.ts`:** `requiredTables` includes `'sync_outbox'`, `'sync_metadata'` so existing DBs get them via `ensureAllTablesExist()`.

## Server

- **New route:** `server/api/routes/stateChanges.ts` – `GET /api/state/changes?since=ISO8601`. Returns `{ since, updatedAt, entities: { accounts: [], contacts: [], ... } }` for all configured entity types with `updated_at > since`.
- **No new server tables:** Incremental sync uses existing tables and their `updated_at` columns.

## File Summary

| File | Purpose |
|------|---------|
| `services/database/schema.ts` | Adds `sync_outbox`, `sync_metadata` tables |
| `services/database/databaseService.ts` | Ensures sync tables in required list |
| `services/sync/conflictResolution.ts` | LWW + ManualMerge resolvers, `get/setConflictResolver`, `buildConflictContext` |
| `services/sync/syncMetadataService.ts` | last_pull_at / last_synced_at per tenant |
| `services/sync/syncOutboxService.ts` | Outbox enqueue, getPending, markSynced, markFailed |
| `services/sync/bidirectionalSyncService.ts` | runSync (upstream + downstream), start/stop, connection-driven |
| `services/sync/syncManager.ts` | Added `removeByEntity()` for post-outbox sync cleanup |
| `services/api/appStateApi.ts` | `loadStateChanges(since)` → GET /state/changes |
| `services/database/repositories/baseRepository.ts` | queueForSync also enqueues to SyncOutboxService |
| `services/database/repositories/appStateRepository.ts` | getEntityById, upsertEntity, getRepoByEntityKey for downstream apply |
| `server/api/routes/stateChanges.ts` | GET /api/state/changes?since= |
| `server/api/index.ts` | Mounts stateChangesRouter at /api/state |
| `context/AuthContext.tsx` | start/stop BidirectionalSyncService on auth; runSync once when authenticated |

## How to Swap to Manual Merge Later

1. Implement your resolver (e.g. extend `ManualMergeResolver` or implement `IConflictResolver`).
2. When conflict returns `needsManualReview: true`, push the conflict into a “pending conflicts” store and show a UI for the user to pick local/remote or edit merged.
3. Call `setConflictResolver(yourResolver)` during app init (e.g. in `App.tsx` or sync bootstrap).

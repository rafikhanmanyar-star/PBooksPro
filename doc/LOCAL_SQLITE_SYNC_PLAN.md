# Local SQLite + Cloud PostgreSQL Sync – Implementation Plan

## Purpose

Replace browser storage (OPFS / IndexedDB / localStorage) with **native SQLite** in the Electron desktop app. Writes go to local SQLite first; a sync layer keeps PostgreSQL in sync. This eliminates:

- OPFS cache and quota issues
- IndexedDB inconsistencies and clearing
- localStorage quota limits on sync queue
- Browser storage quirks in Electron

---

## Current Architecture (Problems)

### Local Database
| Component | Storage | Issues |
|-----------|---------|--------|
| **Main DB** | sql.js (WASM) → OPFS → IndexedDB → localStorage | OPFS can be cleared, IndexedDB quota, localStorage ~5MB limit |
| **Sync queue** | localStorage (`sync_queue_${tenantId}`) | Quota exceeded with 1000+ ops, can lose data on clear |
| **Sync outbox** | SQLite `sync_outbox` table (in sql.js DB) | Already in SQLite; persistence depends on OPFS/IDB |
| **Locks** | localStorage (`record_locks`, `offline_locks`) | Same quota/clear risks |

### Sync Flow
1. App writes → local sql.js DB → `sync_outbox` table
2. `SyncManager` queues ops in localStorage (legacy path)
3. `BidirectionalSyncService` runs on connect: push outbox + SyncManager queue, pull from API
4. Local DB and cloud PostgreSQL stay in sync via API

---

## Target Architecture

### Electron Desktop Only (Main App)
| Component | Storage | Path |
|-----------|---------|------|
| **Main DB** | better-sqlite3 (native) | `app.getPath('userData')/finance.db` |
| **Sync queue** | SQLite table `sync_queue` | Same DB |
| **Sync outbox** | SQLite table `sync_outbox` | Same DB (already exists) |
| **Locks** | SQLite tables `record_locks`, `offline_locks` | Same DB |

### Data Flow
```
User action
    → Write to local SQLite (sync_outbox or sync_queue)
    → Bi-directional sync (upstream + downstream)
    → Cloud PostgreSQL via API
```

### Benefits
- **Durable**: Real file on disk, no browser quota or cache
- **Fast**: Native SQLite, no WASM/OPFS overhead
- **Predictable**: No storage clearing by browser/Electron
- **Unified**: Queue, outbox, locks all in same DB
- **Existing sync logic**: `BidirectionalSyncService`, `syncOutboxService`, conflict resolution remain; only storage backend changes

---

## Implementation Phases

### Phase 1: Electron SQLite Bridge
**Goal**: Expose native SQLite to renderer via secure IPC.

**Tasks**:
1. Add `better-sqlite3` usage in Electron main process (already a dependency).
2. Create `electron/sqliteBridge.cjs`:
   - Initialize DB at `app.getPath('userData')/pbookspro/finance.db`
   - Run schema (reuse `CREATE_SCHEMA_SQL` from `services/database/schema.ts`)
   - Expose `query`, `execute`, `transaction` via `ipcMain.handle`
3. Add preload API: `window.sqliteBridge.query(sql, params)`, etc.
4. Ensure DB file path is stable across app restarts.

**Files**:
- `electron/sqliteBridge.cjs` (new)
- `electron/main.cjs` (wire bridge)
- `electron/preload.cjs` (expose to renderer)

---

### Phase 2: DatabaseService Adapter for Electron
**Goal**: Use native SQLite when in Electron; keep sql.js for web (if any).

**Tasks**:
1. Detect Electron: `typeof window !== 'undefined' && window.electronAPI?.isElectron`.
2. Add `ElectronDatabaseService` that calls `window.sqliteBridge` instead of sql.js.
3. `getDatabaseService()` returns `ElectronDatabaseService` when in Electron.
4. Implement same interface: `initialize()`, `query()`, `execute()`, `transaction()`, `save()` (no-op for native – no persistence layer).
5. Schema migration: Run `CREATE_SCHEMA_SQL` from main process on first launch; bump `SCHEMA_VERSION` if needed.

**Files**:
- `services/database/electronDatabaseService.ts` (new)
- `services/database/databaseService.ts` (conditional export)
- `services/database/unifiedDatabaseService.ts` (use Electron adapter when applicable)

---

### Phase 3: Migrate Sync Queue to SQLite
**Goal**: Replace localStorage sync queue with SQLite table.

**Tasks**:
1. Add `sync_queue` table (or reuse `sync_outbox` semantics if equivalent).
2. `SyncManager`:
   - When in Electron: read/write `sync_queue` table instead of localStorage.
   - Keep localStorage path for non-Electron (e.g. web fallback during transition).
3. Schema for `sync_queue` (match `SyncOperation`):
   ```sql
   CREATE TABLE IF NOT EXISTS sync_queue (
     id TEXT PRIMARY KEY,
     tenant_id TEXT,
     type TEXT CHECK (type IN ('create','update','delete')),
     entity TEXT NOT NULL,
     entity_id TEXT NOT NULL,
     data TEXT, -- JSON
     timestamp INTEGER NOT NULL,
     source TEXT DEFAULT 'local',
     status TEXT CHECK (status IN ('pending','syncing','completed','failed')),
     retries INTEGER DEFAULT 0,
     error_message TEXT,
     sync_started_at INTEGER
   );
   CREATE INDEX idx_sync_queue_tenant_status ON sync_queue(tenant_id, status);
   ```

**Files**:
- `services/database/schema.ts` (add `sync_queue` table)
- `services/sync/syncManager.ts` (use SQLite when in Electron)

---

### Phase 4: Migrate Locks to SQLite
**Goal**: Persist locks in SQLite instead of localStorage.

**Tasks**:
1. Add `record_locks` and `offline_locks` tables (or single `locks` table).
2. `LockManager` and `OfflineLockManager`: use SQLite when in Electron.
3. Keep localStorage fallback for non-Electron.

**Files**:
- `services/database/schema.ts` (add lock tables)
- `services/sync/lockManager.ts`
- `services/sync/offlineLockManager.ts`

---

### Phase 5: Initial Load & Migration from Browser Storage
**Goal**: Smooth transition for existing users.

**Tasks**:
1. **Fresh install**: Create empty SQLite DB, run schema, first sync pulls from cloud.
2. **Migration (optional)**: If `finance_db` exists in OPFS/IndexedDB/localStorage:
   - Read sql.js DB dump
   - Import into native SQLite (one-time)
   - Clear browser storage after success
   - Document as optional; most users can re-pull from cloud.
3. **Login flow**: Same as today – pull from API, populate local SQLite.
4. Ensure `sync_metadata` and `sync_outbox` work with native SQLite (already table-based).

---

### Phase 6: Testing & Rollout
**Tasks**:
1. Unit tests for `ElectronDatabaseService` and SQLite bridge.
2. Integration: login → write → sync → verify in PostgreSQL.
3. Offline: write locally, go online, verify sync.
4. Conflict resolution: verify existing `sync_conflicts` and conflict logic.
5. Build staging and production installers; validate both.

---

## Schema Additions Summary

```sql
-- Sync queue (replaces localStorage sync_queue_*)
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  type TEXT CHECK (type IN ('create','update','delete')),
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  data TEXT,
  timestamp INTEGER NOT NULL,
  source TEXT DEFAULT 'local',
  status TEXT CHECK (status IN ('pending','syncing','completed','failed')),
  retries INTEGER DEFAULT 0,
  error_message TEXT,
  sync_started_at INTEGER
);

-- Record locks (replaces localStorage record_locks)
CREATE TABLE IF NOT EXISTS record_locks (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Offline locks (replaces localStorage offline_locks)
CREATE TABLE IF NOT EXISTS offline_locks (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## Key Files Reference

| Area | Current | Change |
|------|---------|--------|
| DB init | `databaseService.ts` (sql.js + OPFS/IDB/localStorage) | Add `electronDatabaseService.ts` (IPC → better-sqlite3) |
| Sync queue | `syncManager.ts` (localStorage) | Use SQLite when Electron |
| Sync outbox | `syncOutboxService.ts` (SQLite table) | Same; backend is native SQLite |
| Sync metadata | `syncMetadataService.ts` (SQLite table) | Same |
| Locks | `lockManager.ts`, `offlineLockManager.ts` (localStorage) | Use SQLite when Electron |
| Bi-directional sync | `bidirectionalSyncService.ts` | No change; already uses outbox + API |
| Schema | `schema.ts` | Add sync_queue, lock tables |

---

## Platform Matrix (After Implementation)

| Platform | Local DB | Sync | Cloud |
|----------|----------|------|-------|
| **Electron (desktop)** | Native SQLite (file) | SQLite outbox + queue | PostgreSQL via API |
| **Web/PWA (if kept)** | sql.js + OPFS/IDB | Same as today | PostgreSQL via API |
| **Mobile** | None | N/A | PostgreSQL via API only |

---

## Implementation Status (Phases 1–5 Complete)

**Completed:**
- Phase 1: Electron SQLite bridge with native better-sqlite3
- Phase 1: Sync IPC (querySync, runSync, execSync) for main DB; async IPC for sync queue/locks
- Phase 2: **ElectronDatabaseService** – main app uses **native SQLite only** in Electron (no sql.js)
- Phase 3: SyncManager uses SQLite `sync_queue` table in Electron (localStorage on web)
- Phase 4: LockManager and OfflineLockManager use SQLite tables in Electron
- Phase 5: Single local DB – `finance.db` holds main data, sync_queue, and locks
- One-time migration from localStorage to SQLite for sync/locks; schema migrations run on native DB
- `clearAllDatabaseStorage` resets native DB; `createBackup` exports db file bytes

**Current behavior:** In Electron, the client app uses **only SQLite** for local storage (no sql.js, OPFS, IndexedDB, or localStorage for DB). Cloud remains PostgreSQL via API.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| IPC overhead for every query | Phase 1 uses blob storage only; no per-query IPC |
| Schema drift | Run `npm run electron:extract-schema` when schema changes |
| Corrupt DB file | sql.js exports validated before save; WAL for native SQLite |
| better-sqlite3 native module | Optional; if errors, run `npx electron-rebuild` |

---

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|---------------|
| 1. SQLite bridge | 1–2 days | None |
| 2. DatabaseService adapter | 1–2 days | Phase 1 |
| 3. Sync queue migration | 1 day | Phase 1, 2 |
| 4. Lock migration | 0.5 day | Phase 1, 2 |
| 5. Migration & load | 1 day | Phases 1–4 |
| 6. Testing | 2 days | All |

**Total**: ~7–9 days.

---

## Related Docs

- [ELECTRON_SETUP.md](./ELECTRON_SETUP.md) – Electron build and run
- [DEPLOYMENT.md](./DEPLOYMENT.md) – Deployment and app architecture
- [BI_DIRECTIONAL_SYNC_IMPLEMENTATION.md](./BI_DIRECTIONAL_SYNC_IMPLEMENTATION.md) – Current sync design

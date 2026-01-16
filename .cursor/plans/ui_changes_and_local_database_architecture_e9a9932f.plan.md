---
name: UI Changes and Local Database Architecture
overview: Documenting the UI changes in the client and explaining how the local database architecture works (SQLite for desktop, cloud PostgreSQL for mobile)
todos:
  - id: ui-connection-indicator
    content: Create UI component to display connection status using useConnectionStatus hook
    status: completed
  - id: ui-sync-indicator
    content: Create UI component to display sync status using useSyncStatus hook
    status: completed
  - id: update-sync-notification
    content: Optionally update SyncNotification to use new hooks instead of OfflineContext
    status: completed
  - id: mobile-offline-warning
    content: Add offline warning UI for mobile devices when connection is lost
    status: completed
---

# UI Changes and Local Database Architecture

## Summary

This document explains:

1. **UI Changes**: What UI components and hooks were added for connection/sync status
2. **Local Database Architecture**: How the database system works (SQLite locally, PostgreSQL in cloud)

## UI Changes in Client

### 1. New Hooks Created (Not Yet Used in UI)

Two React hooks were created but are **not currently integrated into any UI components**:

#### `useConnectionStatus` Hook

**Location**: `hooks/useConnectionStatus.ts`

**Purpose**: Provides real-time connection status (online/offline/checking)

**Available Properties**:

```typescript
{
  status: 'online' | 'offline' | 'checking',
  isOnline: boolean,
  isOffline: boolean,
  isChecking: boolean
}
```

**Usage Example** (not yet implemented):

```typescript
import { useConnectionStatus } from '../hooks/useConnectionStatus';

function MyComponent() {
  const { isOnline, status } = useConnectionStatus();
  
  return (
    <div>
      {isOnline ? '🟢 Online' : '🔴 Offline'}
    </div>
  );
}
```

#### `useSyncStatus` Hook

**Location**: `hooks/useSyncStatus.ts`

**Purpose**: Provides sync queue status for desktop offline operations

**Available Properties**:

```typescript
{
  total: number,      // Total items in queue
  pending: number,    // Items waiting to sync
  syncing: number,    // Items currently syncing
  failed: number,     // Items that failed
  isSyncing: boolean,
  hasPending: boolean
}
```

**Note**: Returns empty status on mobile (mobile doesn't have sync queue)

**Usage Example** (not yet implemented):

```typescript
import { useSyncStatus } from '../hooks/useSyncStatus';

function SyncIndicator() {
  const { pending, syncing, failed } = useSyncStatus();
  
  return (
    <div>
      {pending > 0 && <span>⏳ {pending} pending</span>}
      {syncing > 0 && <span>🔄 Syncing...</span>}
      {failed > 0 && <span>❌ {failed} failed</span>}
    </div>
  );
}
```

### 2. Existing UI Components

#### `SyncNotification` Component

**Location**: `components/ui/SyncNotification.tsx`

**Status**: Uses the **old** `OfflineContext` (not the new hooks)

**What it shows**:

- Syncing progress with progress bar
- Success notification when sync completes
- Failed items warning
- Pending items info (when offline)

**Current Implementation**: Uses `useOffline()` from `OfflineContext`, not the new `useSyncStatus` hook

### 3. Services Initialized in App.tsx

**Location**: `App.tsx` (lines 172-220)

**What's initialized**:

1. **Unified Database Service** - Platform-aware database initialization
2. **Connection Monitor** - Monitors online/offline status
3. **Sync Manager** - Manages sync queue for desktop

**Console Logs** (visible in browser console):

```
[App] Initializing database services...
[UnifiedDatabaseService] Initializing for platform: desktop (or mobile)
[UnifiedDatabaseService] Initialized successfully in hybrid mode (or api mode)
[App] ✅ Unified database service initialized
[App] Connection status changed: online (or offline)
[App] ✅ Online - starting auto-sync (if online)
[App] ✅ Database services initialized successfully
```

### 4. No Visual UI Changes Yet

**Important**: The new hooks (`useConnectionStatus`, `useSyncStatus`) are **not currently used in any UI components**. They are available for future use but need to be integrated.

**To Add UI Indicators**:

1. Import the hooks in a component
2. Display connection status (online/offline indicator)
3. Display sync status (pending/syncing/failed counts)
4. Add to Header, Footer, or Settings page

## Local Database Architecture

### Important Clarification: No Local PostgreSQL

**PostgreSQL cannot run directly in a web browser**. The implementation uses:

- **Desktop**: Local **SQLite** (via sql.js) + Cloud PostgreSQL (via API)
- **Mobile**: Cloud PostgreSQL only (via API, requires internet)

### Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              Application Layer                   │
│         (React Components, Hooks)                │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│         Unified Database Service                 │
│      (Platform Detection & Routing)              │
└──────────────┬──────────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│   Desktop    │  │   Mobile     │
│              │  │              │
│ Local SQLite │  │ Cloud API    │
│ (sql.js)     │  │ Only         │
│              │  │              │
│ + Cloud API  │  │ (No Local    │
│ (PostgreSQL) │  │  Database)    │
└──────────────┘  └──────────────┘
```

### Desktop Platform (Web Browser)

**Local Database**: SQLite via `sql.js` (WebAssembly)

**Storage**:

- **Primary**: OPFS (Origin Private File System) - modern browsers
- **Fallback**: localStorage - older browsers

**Cloud Database**: PostgreSQL (via API backend)

**How it works**:

1. **Online**: 

   - Writes to local SQLite first
   - Then syncs to cloud PostgreSQL via API
   - Reads can come from either (local is faster)

2. **Offline**:

   - Writes to local SQLite only
   - Queues operations for sync
   - When online, sync manager automatically syncs queued operations

**Files**:

- `services/database/databaseService.ts` - SQLite service
- `services/database/unifiedDatabaseService.ts` - Routes to SQLite or API
- `services/sync/syncManager.ts` - Manages sync queue

### Mobile Platform (PWA)

**Local Database**: None (PostgreSQL cannot run in mobile browser)

**Cloud Database**: PostgreSQL (via API backend)

**How it works**:

1. **Online**: 

   - All operations go directly to cloud PostgreSQL via API
   - No local caching

2. **Offline**:

   - Operations fail with error message
   - User must have internet connection
   - No offline support by design

**Files**:

- `services/database/postgresqlCloudService.ts` - Cloud service wrapper
- `services/database/unifiedDatabaseService.ts` - Routes to API only

### Platform Detection

**Location**: `utils/platformDetection.ts`

**Detection Logic**:

```typescript
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || 
         /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
         .test(navigator.userAgent);
}
```

**Database Mode**:

- Desktop: `'hybrid'` (local SQLite + cloud PostgreSQL)
- Mobile: `'api'` (cloud PostgreSQL only)

### Why Not Local PostgreSQL?

**Technical Limitation**: PostgreSQL is a server-side database that requires:

- A running PostgreSQL server process
- Network connections
- File system access
- Cannot run in browser JavaScript environment

**Solution**:

- Desktop: Use SQLite (runs in browser via WebAssembly)
- Mobile: Cloud PostgreSQL only (requires internet)

### Database Services Flow

#### Desktop Flow (Online)

```
User Action
    ↓
UnifiedDatabaseService
    ↓
┌──────────────┬──────────────┐
│ Local SQLite │ Cloud API    │
│ (immediate)  │ (async sync) │
└──────────────┴──────────────┘
```

#### Desktop Flow (Offline)

```
User Action
    ↓
UnifiedDatabaseService
    ↓
Local SQLite (only)
    ↓
Sync Queue (stored locally)
    ↓
[When Online] → Sync Manager → Cloud API
```

#### Mobile Flow (Online)

```
User Action
    ↓
UnifiedDatabaseService
    ↓
Cloud API (PostgreSQL)
```

#### Mobile Flow (Offline)

```
User Action
    ↓
UnifiedDatabaseService
    ↓
Error: "Internet connection required"
```

## Summary

### UI Changes

- ✅ Hooks created (`useConnectionStatus`, `useSyncStatus`)
- ✅ Services initialized in `App.tsx`
- ❌ **No UI components yet use the new hooks**
- ✅ Existing `SyncNotification` uses old `OfflineContext`

### Local Database

- ✅ Desktop: Local **SQLite** (not PostgreSQL) + Cloud PostgreSQL
- ✅ Mobile: Cloud PostgreSQL only (no local database)
- ✅ Platform-aware routing via `UnifiedDatabaseService`
- ✅ Offline support on desktop only
- ❌ **No local PostgreSQL** (technical limitation)

## Next Steps (Optional)

1. **Add UI Indicators**:

   - Create connection status indicator component
   - Add to Header or Settings
   - Use `useConnectionStatus` hook

2. **Update SyncNotification**:

   - Migrate from `OfflineContext` to `useSyncStatus` hook
   - Or keep both if they serve different purposes

3. **Add Mobile Offline Warning**:

   - Show message when mobile device goes offline
   - Disable write operations
   - Use `useConnectionStatus` hook
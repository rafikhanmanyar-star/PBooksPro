# PostgreSQL Local Database Migration Plan

## Overview

This document outlines the plan to replace SQLite with PostgreSQL for local database storage while maintaining offline capabilities. **Important**: This plan uses a hybrid approach where:
- **Desktop/Web**: Local PostgreSQL with offline support and sync to cloud
- **Mobile (PWA)**: Cloud PostgreSQL only (no local database, requires internet connection)

## Platform-Specific Strategy

### Desktop/Web Browsers
- **Local Database**: PostgreSQL (localhost)
- **Offline Support**: Yes (local PostgreSQL + sync queue)
- **Cloud Sync**: Bidirectional sync when online
- **Multi-User Locking**: Yes (when offline)

### Mobile Devices (PWA)
- **Local Database**: None (PostgreSQL cannot run on mobile)
- **Offline Support**: No (requires internet connection)
- **Cloud Database**: Direct connection to cloud PostgreSQL
- **Multi-User Locking**: Yes (via cloud-based locking)

## Architecture Options

### Option 1: Hybrid Approach (Recommended)
- **Primary**: PostgreSQL (when available)
- **Fallback**: SQLite (for offline scenarios)
- **Benefits**: Best of both worlds - PostgreSQL when connected, SQLite when offline
- **Complexity**: Medium

### Option 2: PostgreSQL Only
- **Primary**: PostgreSQL (required)
- **Fallback**: None (app won't work offline)
- **Benefits**: Single database engine, no schema differences
- **Complexity**: Low (but loses offline capability)

### Option 3: PostgreSQL with Local Proxy
- **Primary**: PostgreSQL via local proxy server
- **Fallback**: SQLite
- **Benefits**: Can run PostgreSQL in Docker/container
- **Complexity**: High

## Recommended Implementation: Platform-Aware Hybrid

### Architecture

**Desktop/Web Platform:**
```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (React Components, Hooks, Context)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Platform Detection & DB Selection     │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌─────────────┐  ┌──────────────┐
│ Local       │  │   Cloud      │
│ PostgreSQL  │  │   PostgreSQL │
│ (Primary)   │  │   (Sync)     │
└─────────────┘  └──────────────┘
```

**Mobile Platform (PWA):**
```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (React Components, Hooks, Context)     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Cloud PostgreSQL Service (Direct)     │
│   (No Local Database - Internet Required)│
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────┐
│   Cloud     │
│ PostgreSQL  │
│ (Staging/   │
│ Production) │
└─────────────┘
```

### Implementation Steps

#### Phase 1: Platform Detection and Database Service Layer

1. **Create Platform Detection Utility**
   **File**: `utils/platformDetection.ts`
   ```typescript
   export function isMobileDevice(): boolean {
     // Check screen width (existing pattern in codebase)
     if (typeof window === 'undefined') return false;
     return window.innerWidth < 768 || 
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
   }
   
   export function isDesktopDevice(): boolean {
     return !isMobileDevice();
   }
   
   export function canRunLocalPostgreSQL(): boolean {
     // Only desktop can run local PostgreSQL
     return isDesktopDevice();
   }
   ```

2. **Create Local PostgreSQL Service** (Desktop Only)
   **File**: `services/database/postgresqlLocalService.ts`
   - Connection pooling
   - Query execution
   - Transaction management
   - Error handling
   - Connection health checks
   - **Only initialized on desktop devices**

3. **Create Cloud PostgreSQL Service** (All Platforms)
   **File**: `services/database/postgresqlCloudService.ts`
   - Direct connection to cloud PostgreSQL
   - Connection pooling
   - Query execution
   - Transaction management
   - Error handling
   - **Used by both desktop (for sync) and mobile (primary)**

4. **Database Connection Configuration**
   ```typescript
   interface PostgreSQLConfig {
     host: string;
     port: number;
     database: string;
     user: string;
     password: string;
     ssl?: boolean;
     maxConnections?: number;
   }
   
   interface CloudPostgreSQLConfig {
     connectionString: string; // Full connection URL
     ssl?: boolean;
   }
   ```

5. **Connection Management**
   - Auto-reconnect on failure
   - Connection pool (pg-pool)
   - Health check endpoint
   - Platform-specific initialization

#### Phase 2: Unified Database Interface with Platform Awareness

1. **Create `unifiedDatabaseService.ts`**
   - Platform detection on initialization
   - **Desktop**: Local PostgreSQL (primary) + Cloud PostgreSQL (sync)
   - **Mobile**: Cloud PostgreSQL only (direct connection)
   - Seamless API regardless of platform

2. **Interface Methods**
   ```typescript
   interface UnifiedDatabaseService {
     initialize(): Promise<void>;
     query<T>(sql: string, params?: any[]): T[];
     execute(sql: string, params?: any[]): void;
     transaction(operations: () => void): Promise<void>;
     isReady(): boolean;
     getPlatform(): 'desktop' | 'mobile';
     getDatabaseMode(): 'local' | 'cloud' | 'hybrid';
     isOnline(): boolean;
     // ... other methods
   }
   ```

3. **Platform-Specific Initialization Logic**
   ```typescript
   class UnifiedDatabaseService {
     async initialize(): Promise<void> {
       const platform = isMobileDevice() ? 'mobile' : 'desktop';
       
       if (platform === 'mobile') {
         // Mobile: Only cloud PostgreSQL
         await this.cloudService.initialize();
         this.mode = 'cloud';
       } else {
         // Desktop: Local PostgreSQL + Cloud sync
         await this.localService.initialize();
         await this.cloudService.initialize();
         this.mode = 'hybrid';
       }
     }
   }
   ```

#### Phase 3: Migration Strategy

1. **Data Migration Script**
   - Export from SQLite
   - Import to PostgreSQL
   - Verify data integrity
   - Handle schema differences

2. **Migration Path**
   - Detect existing SQLite database
   - Offer migration option
   - Migrate data to PostgreSQL
   - Keep SQLite as backup

#### Phase 4: Update Repository Layer

1. **Modify BaseRepository**
   - Use `UnifiedDatabaseService` instead of `DatabaseService`
   - Handle both PostgreSQL and SQLite query syntax differences

2. **Query Compatibility**
   - Standardize SQL queries (PostgreSQL-compatible)
   - Handle type differences (BOOLEAN vs INTEGER)
   - Handle timestamp differences

#### Phase 5: Offline Support (Desktop Only)

1. **Connection Detection**
   - **Desktop**: Check local PostgreSQL (always available) and cloud PostgreSQL
   - **Mobile**: Check cloud PostgreSQL only (no offline support)
   - Periodic health checks
   - Desktop: Auto-fallback to local-only mode on cloud connection loss
   - Mobile: Show "Internet required" message when offline

2. **Sync Strategy**
   - **Desktop (Online)**: Write to both local and cloud simultaneously
   - **Desktop (Offline)**: Write to local only, queue for sync
   - **Desktop (Reconnect)**: Sync queued changes to cloud
   - **Mobile (Online)**: Direct write to cloud
   - **Mobile (Offline)**: Show error, disable write operations

3. **Mobile Offline Handling**
   ```typescript
   // Mobile: No offline support
   if (isMobileDevice() && !isOnline()) {
     throw new Error('Internet connection required. This app requires an active connection on mobile devices.');
   }
   ```

## Technical Requirements

### Dependencies

```json
{
  "dependencies": {
    "pg": "^8.11.0",
    "pg-pool": "^3.6.0"
  }
}
```

### PostgreSQL Setup

1. **Local Installation**
   - Install PostgreSQL on user's machine
   - Create database
   - Configure connection

2. **Docker Option** (Recommended for development)
   ```yaml
   # docker-compose.yml
   services:
     postgres:
       image: postgres:15
       environment:
         POSTGRES_DB: pbookspro_local
         POSTGRES_USER: pbookspro
         POSTGRES_PASSWORD: password
       ports:
         - "5432:5432"
       volumes:
         - postgres_data:/var/lib/postgresql/data
   ```

### Configuration

```typescript
// config/database.ts
export const databaseConfig = {
  postgresql: {
    enabled: process.env.USE_POSTGRESQL === 'true',
    host: process.env.POSTGRESQL_HOST || 'localhost',
    port: parseInt(process.env.POSTGRESQL_PORT || '5432'),
    database: process.env.POSTGRESQL_DATABASE || 'pbookspro_local',
    user: process.env.POSTGRESQL_USER || 'pbookspro',
    password: process.env.POSTGRESQL_PASSWORD || '',
    ssl: process.env.POSTGRESQL_SSL === 'true',
  },
  sqlite: {
    enabled: true, // Always enabled as fallback
  }
};
```

## Code Changes Required

### 1. New Files to Create

- `services/database/postgresqlDatabaseService.ts`
- `services/database/unifiedDatabaseService.ts`
- `services/database/migration/postgresqlMigration.ts`
- `config/database.ts`

### 2. Files to Modify

- `services/database/databaseService.ts` → Keep as SQLite service
- `services/database/repositories/baseRepository.ts` → Use unified service
- `services/database/repositories/appStateRepository.ts` → Use unified service
- All repository files → Use unified service

### 3. Schema Alignment

- Already done! Local SQLite schema matches PostgreSQL schema
- Only need to handle type conversions:
  - `BOOLEAN` ↔ `INTEGER` (0/1)
  - `TIMESTAMP` ↔ `INTEGER` (Unix timestamp)

## Benefits

1. ✅ **Same Database Engine**: PostgreSQL for both local and cloud
2. ✅ **No Schema Differences**: Identical schemas
3. ✅ **Better Performance**: PostgreSQL is faster for complex queries
4. ✅ **More Features**: Full-text search, JSON support, etc.
5. ✅ **Offline Support**: SQLite fallback maintains offline capability
6. ✅ **Easier Sync**: Same engine makes cloud sync simpler

## Drawbacks

1. ⚠️ **Setup Required**: Desktop users need PostgreSQL installed (mobile doesn't)
2. ⚠️ **Complexity**: More code to maintain platform-specific logic
3. ⚠️ **Resource Usage**: PostgreSQL uses more memory (desktop only)
4. ⚠️ **Portability**: Less portable than SQLite (desktop only)
5. ⚠️ **Mobile Limitation**: No offline support on mobile (requires internet)
6. ⚠️ **Mobile User Experience**: Users must have internet connection to use app

## Migration Checklist

- [ ] Install PostgreSQL locally or set up Docker
- [ ] Create PostgreSQL database service
- [ ] Create unified database service
- [ ] Update all repositories to use unified service
- [ ] Create data migration script
- [ ] Test offline/online switching
- [ ] Test data sync between SQLite and PostgreSQL
- [ ] Update documentation
- [ ] Create setup guide for users

## Alternative: Electron-Only Approach

If this is an Electron app, you could:
1. Use `better-sqlite3` (already in use for native backend)
2. Or use PostgreSQL via Node.js (no browser limitations)
3. No need for sql.js fallback in Electron

## Recommendation

**For Desktop/Web Browsers**: 
- Local PostgreSQL with offline support
- Cloud PostgreSQL for sync
- Best user experience with offline capability

**For Mobile (PWA)**:
- Cloud PostgreSQL only (direct connection)
- No local database (PostgreSQL cannot run on mobile)
- Internet connection required
- Simpler implementation, but no offline support

**Platform Detection Strategy**:
- Detect platform on app initialization
- Initialize appropriate database service based on platform
- Provide clear UI feedback about offline capabilities

Would you like me to start implementing the PostgreSQL service layer?

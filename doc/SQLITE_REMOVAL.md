# SQLite Stack Removal (Architecture v2.1)

PostgreSQL is the **only active database** for Desktop and Cloud editions. Offline SQLite has been fully retired.

## Completed (Phase 1)

| Item | Status |
|------|--------|
| Default `VITE_LOCAL_ONLY=false` for Electron/API client | Done |
| Electron main/preload gate SQLite behind `PBOOKS_ENABLE_SQLITE=1` | Done |
| API client installers exclude `sqliteBridge`, `better-sqlite3`, schema files | Done |
| `deploy:staging-inner` / `deploy:production-inner` skip `electron:extract-schema` | Done |

## Completed (Phase 2)

| Item | Status |
|------|--------|
| Rename `services/database/` → `services/legacy-sqlite/` | Done |
| Extract shared constants to `constants/` and `services/state/` | Done |
| Vite stub plugin excludes sql.js from API-mode builds | Done |
| `config/runtimeMode.ts` — compile-time `IS_LEGACY_SQLITE_BUILD` | Done |
| `services/legacySqliteLoader.ts` — dynamic import for offline-only paths | Done |
| Hot path (AppContext, App, useDatabaseState) uses loader | Done |

## Completed (Phase 3)

| Item | Status |
|------|--------|
| Legacy npm scripts moved to `tools/legacy/` (`legacy:*` aliases) | Done |
| `better-sqlite3` moved to `optionalDependencies` (not required for API client) | Done |
| `rebuild:native` skips better-sqlite3 | Done |
| `services/sessionContext.ts` — tenant/user id for API | Done |
| `config/dataMode.ts` — `isPostgresApiMode()` helper | Done |

## Completed (Phase 4)

| Item | Status |
|------|--------|
| Delete `services/legacy-sqlite/**` — imports resolve to `services/legacy-sqlite-stubs/**` | Done |
| `isLocalOnlyMode()` always returns `false` | Done |
| Remove `electron:offline:*` scripts | Done |
| Remove `config/sessionDataSource.ts` | Done |
| `useDatabaseState` — in-memory/API-only (no SQLite persist) | Done |
| `electron:extract-schema` deprecated (schema in `electron/schema.sql`) | Done |
| Vite always stubs legacy-sqlite + sql.js | Done |
| `rebuild:native` — no-op for API client | Done |

## API client Electron builder (no SQLite)

Files **removed** from `electron-builder-api-client.yml` and `electron-builder-api-client-staging.yml`:

- `electron/sqliteBridge.cjs`, `companyManager.cjs`, `schema.sql`, migrations, schema validator
- `node_modules/better-sqlite3/**` and native bindings

## Optional follow-up

1. **Collapse remaining `isLocalOnlyMode()` UI branches** in lazy-loaded components (dead code cleanup)
2. **Remove `optionalDependencies.better-sqlite3`** once `tools/legacy/` migration scripts are archived
3. **Replace stub imports** with API hooks in personal transactions, chat, backup, etc.

## Legacy tooling

See `tools/legacy/README.md`. Deprecated aliases (`prepare-local-db`, `migrate:sqlite-to-postgres`, etc.) forward to `legacy:*` scripts. These still use sql.js / optional better-sqlite3 for one-off migrations.

## Verification

```powershell
npm run build:backend
npm run build
npm run test:staging
```

API build should **not** emit large `databaseService-*` or `vendor-db` (sql.js) chunks.

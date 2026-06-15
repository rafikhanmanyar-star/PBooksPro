# SQLite Stack Removal (Architecture v2.1)

PostgreSQL is the **only active database** for Desktop and Cloud editions. This document tracks removal of the legacy SQLite stack.

## Completed (Phase 1)

| Item | Status |
|------|--------|
| Default `VITE_LOCAL_ONLY=false` for Electron/API client | Done |
| `isLocalOnlyMode()` opt-in only (`VITE_LOCAL_ONLY=true`) | Done |
| Electron main/preload gate SQLite behind `PBOOKS_ENABLE_SQLITE=1` | Done |
| API client installers exclude `sqliteBridge`, `better-sqlite3`, schema files | Done |
| `deploy:staging-inner` / `deploy:production-inner` skip `electron:extract-schema` | Done |
| Legacy scripts → `electron:offline:*` only | Done |

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
| `rebuild:native` skips better-sqlite3 unless `PBOOKS_ENABLE_SQLITE=1` / offline build | Done |
| Session helpers isolated in `config/sessionDataSource.ts` | Done |
| `services/sessionContext.ts` — tenant/user id for API + offline | Done |
| `config/dataMode.ts` — `isPostgresApiMode()` helper | Done |
| `payrollApi` / `errorLogger` use sessionContext / legacy loader | Done |

## API client Electron builder (no SQLite)

Files **removed** from `electron-builder-api-client.yml` and `electron-builder-api-client-staging.yml`:

- `electron/sqliteBridge.cjs`, `companyManager.cjs`, `schema.sql`, migrations, schema validator
- `node_modules/better-sqlite3/**` and native bindings

Offline legacy builds still use `electron-builder-staging.yml` or `electron:offline:installer`.

## Remaining (Phase 4 — when offline mode retired)

1. **Delete `services/legacy-sqlite/**`** and `services/legacy-sqlite-stubs/**`
2. **Remove `electron:offline:*`** scripts and SQLite Electron files
3. **Remove `config/sessionDataSource.ts`** and session switching in offline builds
4. **Remove `optionalDependencies.better-sqlite3`** and `devDependencies.sql.js`
5. **Collapse remaining `isLocalOnlyMode()` UI branches** in lazy-loaded components (optional cleanup)

## Legacy tooling

See `tools/legacy/README.md`. Deprecated aliases (`prepare-local-db`, `migrate:sqlite-to-postgres`, etc.) forward to `legacy:*` scripts.

## Verification

```powershell
npm run build:backend
npm run build
npm run test:staging
```

API build should **not** emit large `databaseService-*` or `vendor-db` (sql.js) chunks.

Legacy offline (deprecated):

```powershell
npm run electron:offline:local
```

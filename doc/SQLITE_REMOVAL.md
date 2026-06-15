# SQLite Stack Removal (Architecture v2.1)

PostgreSQL is the **only active database** for Desktop and Cloud editions. This document tracks removal of the legacy SQLite stack.

## Completed (this phase)

| Item | Status |
|------|--------|
| Default `VITE_LOCAL_ONLY=false` for Electron/API client | Done |
| `isLocalOnlyMode()` opt-in only (`VITE_LOCAL_ONLY=true`) | Done |
| Electron main/preload gate SQLite behind `PBOOKS_ENABLE_SQLITE=1` | Done |
| API client installers exclude `sqliteBridge`, `better-sqlite3`, schema files | Done |
| `deploy:staging-inner` / `deploy:production-inner` skip `electron:extract-schema` | Done |
| Legacy scripts → `electron:offline:*` only | Done |
| `services/database/LEGACY.md` | Done |

## API client Electron builder (no SQLite)

Files **removed** from `electron-builder-api-client.yml` and `electron-builder-api-client-staging.yml`:

- `electron/sqliteBridge.cjs`, `companyManager.cjs`, `schema.sql`, migrations, schema validator
- `node_modules/better-sqlite3/**` and native bindings

Offline legacy builds still use `electron-builder-staging.yml` or `electron:offline:installer`.

## Remaining (future phases)

1. **Stop bundling sql.js** in API-mode Vite builds (`services/database/` still imported by AppContext)
2. **Collapse `isLocalOnlyMode()` branches** (~130 files) after offline scripts retired
3. **Delete `services/database/**`** when no runtime imports remain
4. **Remove `better-sqlite3`** from root `package.json` dependencies
5. **Remove legacy npm scripts**: `prepare-local-db`, `clear-local-transactions`, sqlite→postgres importers (move to `tools/legacy/`)
6. **Delete `config/apiUrl` session SQLite helpers** when offline mode removed

## Verification

```powershell
npm run build:backend
npm run build
npm run test:staging
```

Legacy offline (deprecated):

```powershell
npm run electron:offline:local
```

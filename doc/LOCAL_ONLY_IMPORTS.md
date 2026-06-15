# Local-only build: import / dependency notes

**Updated (Architecture v2.1 Phase 4+):** The application client is **PostgreSQL/API-only**. `isLocalOnlyMode()` in `config/apiUrl.ts` always returns `false`.

## Remaining legacy imports

Some files still import `services/legacy-sqlite/*` paths. At build time these resolve to `services/legacy-sqlite-stubs/*` (no sql.js bundle). Replace with API hooks over time.

## `getAppStateApiService` / `services/api/appStateApi.ts`

Primary path for loading and persisting tenant state. Some components still have `if (!isLocalOnlyMode())` guards around API calls — dead branches to remove incrementally.

## Legacy tooling

See `tools/legacy/README.md` for one-off SQLite → PostgreSQL migration scripts.

# Legacy SQLite Stack (Deprecated)

Architecture v2.1 uses **PostgreSQL only** for Desktop and Cloud editions. This directory contains the deprecated offline SQLite client stack.

**Do not use for new development.** All new features use:

- `apiClient` → `/api/v1` → Express modules → PostgreSQL
- Schema changes in `database/migrations/` only

## Deprecated components

| Component | Location |
|-----------|----------|
| SQLite bridge | `electron/sqliteBridge.cjs` |
| Company manager | `electron/companyManager.cjs` |
| Local schema | `services/database/schema.ts` |
| Schema extraction | `npm run electron:extract-schema` |
| Offline build flag | `VITE_LOCAL_ONLY=true` |
| Electron SQLite gate | `PBOOKS_ENABLE_SQLITE=1` (offline scripts only) |
| Database services | `services/database/*.ts` |
| SQLite sync | `services/database/schemaSync.ts` |

## Legacy scripts (migration tooling only)

```powershell
npm run electron:offline:local      # Offline SQLite dev (deprecated)
npm run electron:offline:dev        # Quick offline build (deprecated)
npm run electron:offline:installer  # Offline NSIS installer (deprecated)
npm run migrate:sqlite-to-postgres  # Import SQLite backup → PostgreSQL
```

## Standard Desktop development

```powershell
npm run test:local-only   # PostgreSQL + API :3000 + Electron client
npm run test:staging      # Staging DB + API :3001 + Electron client
npm run electron:local    # Electron API client (requires running API server)
```

See `doc/ARCHITECTURE.md` and `doc/ARCHITECTURE_V2_AGENT_RULES.md` for v2.1 patterns.

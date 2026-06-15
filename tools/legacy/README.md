# Legacy SQLite tooling (deprecated)

One-off migration and maintenance scripts for the **deprecated offline SQLite** stack.

**Do not use for new development.** Desktop and Cloud editions use PostgreSQL via `apiClient`.

| Script | npm command | Purpose |
|--------|-------------|---------|
| `prepare-local-db.cjs` | `npm run legacy:prepare-local-db` | Rewrite tenant/user IDs in local SQLite for offline mode |
| `clear-local-transactions.cjs` | `npm run legacy:clear-local-transactions` | Clear transactions from local SQLite |
| `sqlite-to-postgres-rk-builders.cjs` | `npm run legacy:migrate-sqlite-to-postgres` | Import SQLite backup → PostgreSQL |
| `repair-postgres-categories-from-sqlite.cjs` | `npm run legacy:repair-pg-categories` | Repair category_id from SQLite backup |
| `migrate-from-cloud.cjs` | `npm run legacy:migrate-from-cloud` | Pull cloud data into local SQLite |
| `dedupe-local-db.cjs` | `npm run legacy:dedupe-local-db` | Deduplicate local SQLite rows |
| `copy-tenant-from-production.cjs` | `npm run legacy:copy-tenant-from-production` | Copy tenant from production SQLite export |

Requires `sql.js` in devDependencies for one-off migrations. `better-sqlite3` was removed from the app package — legacy scripts use sql.js only.

# Local-only imports (retired)

**Architecture v2.1 Phase 6:** Offline SQLite and `services/legacy-sqlite-stubs/` were removed. The application client is **PostgreSQL/API-only**.

- Data load/persist: `services/api/appStateApi.ts` → `/api/v1`
- Import/export: `components/settings/ImportExportWizard.tsx` → backend `data-import-export` routes
- Validation schemas: `services/importSchemas.ts` + `services/importValidator.ts` (client-side Excel validation only; no SQLite writes)

Legacy one-off migration scripts remain under `tools/legacy/` and may use `sql.js` directly — they are not bundled in the Desktop/API client.

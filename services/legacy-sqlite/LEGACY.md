# Legacy SQLite stack (`services/legacy-sqlite/`)

**@deprecated** — retained only for `npm run electron:offline:*` builds (`VITE_LOCAL_ONLY=true` + `PBOOKS_ENABLE_SQLITE=1`).

PostgreSQL via `apiClient` is the standard for Desktop and Cloud editions. API-mode Vite builds stub this folder via `scripts/vite-legacy-sqlite-stub-plugin.mjs` so sql.js is not bundled.

## Shared data (not SQLite-specific)

These live outside this folder:

- `constants/mandatorySystemAccounts.ts`
- `constants/mandatorySystemCategories.ts`
- `constants/profitDistributionCategory.ts`
- `services/state/persistableStateFingerprint.ts`

## Do not

- Add new imports from this folder in API-mode code paths
- Extend repositories or schema for new features

See `doc/SQLITE_REMOVAL.md` for removal progress.

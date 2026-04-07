/**
 * Expected local SQLite schema (PBooks Pro).
 *
 * The canonical definition is `CREATE_SCHEMA_SQL` in `./schema.ts`, extracted to
 * `electron/schema.sql` at build time (`npm run electron:extract-schema`).
 * Runtime validation (`electron/schemaValidator.cjs`) parses `electron/schema.sql`
 * and applies non-destructive repairs (ADD COLUMN, CREATE INDEX IF NOT EXISTS).
 */
export { SCHEMA_VERSION as EXPECTED_SCHEMA_VERSION } from './schema';

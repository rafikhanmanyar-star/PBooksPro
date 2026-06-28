#!/usr/bin/env node
/**
 * Run production_rollback_to_v1_2_416.sql against DATABASE_URL.
 * Use from Render API Shell (internal network) or after whitelisting your IP.
 *
 *   node scripts/run-production-db-rollback.mjs --dry-run   # list migrations only
 *   node scripts/run-production-db-rollback.mjs --confirm   # execute rollback
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sqlPath = join(root, 'database', 'rollback', 'production_rollback_to_v1_2_416.sql');

const dryRun = process.argv.includes('--dry-run');
const confirm = process.argv.includes('--confirm');

if (!dryRun && !confirm) {
  console.error('Pass --dry-run (inspect) or --confirm (execute rollback).');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes('render.com') ? { rejectUnauthorized: false } : undefined,
});

async function listMigrations() {
  const r = await client.query(
    `SELECT filename FROM schema_migrations
     WHERE filename ~ '^13[0-9]_' OR filename ~ '^14[0-9]_'
     ORDER BY filename`
  );
  return r.rows.map((row) => row.filename);
}

try {
  await client.connect();
  console.log('[rollback] Connected.');

  const before = await listMigrations();
  console.log('[rollback] Migrations 13x/14x currently applied:', before.length ? before : '(none)');

  if (dryRun) {
    console.log('[rollback] Dry run — no changes made.');
    process.exit(0);
  }

  const sql = readFileSync(sqlPath, 'utf8');
  await client.query(sql);
  console.log('[rollback] SQL executed successfully.');

  const after = await client.query(
    `SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 10`
  );
  console.log('[rollback] Latest schema_migrations:');
  for (const row of after.rows) console.log('  ', row.filename);
} catch (err) {
  console.error('[rollback] Failed:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

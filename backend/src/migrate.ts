/**
 * Run SQL migrations from database/migrations (project root).
 * Tracks applied files in schema_migrations (061_schema_migrations.sql).
 * Usage: DATABASE_URL=... npm run migrate --prefix backend
 */
import './loadEnv.js';
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './db/pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');
const migrationsDir = join(projectRoot, 'database', 'migrations');

const MIGRATION_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON schema_migrations (applied_at);
`;

async function ensureMigrationTable(): Promise<void> {
  const pool = getPool();
  await pool.query(MIGRATION_TABLE_DDL);
}

async function getAppliedFilenames(): Promise<Set<string>> {
  const pool = getPool();
  const r = await pool.query<{ filename: string }>(
    `SELECT filename FROM schema_migrations ORDER BY filename`
  );
  return new Set(r.rows.map((row) => row.filename));
}

/** Existing DBs that ran migrations before tracking: mark all current files as applied. */
async function bootstrapExistingDatabase(allFiles: string[]): Promise<void> {
  const pool = getPool();
  const users = await pool.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1`
  );
  if (users.rows.length === 0) return;

  const applied = await getAppliedFilenames();
  if (applied.size > 0) return;

  console.log('Bootstrapping schema_migrations for existing database…');
  for (const file of allFiles) {
    await pool.query(
      `INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, NOW())
       ON CONFLICT (filename) DO NOTHING`,
      [file]
    );
  }
  console.log(`Marked ${allFiles.length} migration(s) as already applied.`);
}

export async function runPendingMigrations(options?: { quiet?: boolean }): Promise<number> {
  const quiet = options?.quiet === true;
  const log = (msg: string) => {
    if (!quiet) console.log(msg);
  };

  await ensureMigrationTable();

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await bootstrapExistingDatabase(files);

  const applied = await getAppliedFilenames();
  const pool = getPool();
  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      log(`Migration skipped (already applied): ${file}`);
      continue;
    }
    const sqlPath = join(migrationsDir, file);
    const sql = readFileSync(sqlPath, 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, NOW())
         ON CONFLICT (filename) DO NOTHING`,
        [file]
      );
      await client.query('COMMIT');
      appliedCount += 1;
      log(`Migration applied: ${sqlPath}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  return appliedCount;
}

async function main() {
  await runPendingMigrations();
  await getPool().end();
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

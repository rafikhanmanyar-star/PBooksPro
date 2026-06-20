/**
 * A5.1.6C.0 — Cloud production migration evidence (schema only; no RBAC flags).
 * Usage: node scripts/rbac-cloud-migration-evidence.mjs [--apply]
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const envFile = '.env.production.render';
const evidenceDir = resolve('docs/security/production-evidence');

dotenv.config({ path: resolve(envFile) });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`DATABASE_URL missing in ${envFile}`);
  process.exit(1);
}

const REQUIRED_MIGRATIONS = [
  '133_rbac_v2_role_management.sql',
  '134_break_glass_sessions.sql',
  '135_rbac_data_scopes.sql',
  '136_rbac_approval_matrix.sql',
  '137_rbac_approval_matrix_seed.sql',
  '138_rbac_roles_is_archived.sql',
];

const REQUIRED_RBAC_TABLES = [
  'rbac_audit_log',
  'rbac_user_data_scopes',
  'rbac_role_data_scopes',
  'rbac_approval_rules',
  'rbac_approval_assignments',
  'break_glass_sessions',
  'platform_break_glass_capabilities',
];

async function snapshot(pool) {
  const db = await pool.query('SELECT current_database() AS db');
  const applied = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
  const appliedSet = new Set(applied.rows.map((r) => r.filename));
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rbac_roles'`
  );
  const colSet = new Set(cols.rows.map((r) => r.column_name));
  const tables = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [REQUIRED_RBAC_TABLES]
  );
  const tableSet = new Set(tables.rows.map((r) => r.tablename));
  return {
    database: db.rows[0].db,
    timestamp: new Date().toISOString(),
    migrations: {
      required: REQUIRED_MIGRATIONS,
      missing: REQUIRED_MIGRATIONS.filter((f) => !appliedSet.has(f)),
      latestApplied: applied.rows.map((r) => r.filename).slice(-5),
    },
    rbacRolesIsArchived: {
      is_archived: colSet.has('is_archived'),
      archived_at: colSet.has('archived_at'),
    },
    rbacTables: {
      present: REQUIRED_RBAC_TABLES.filter((t) => tableSet.has(t)),
      missing: REQUIRED_RBAC_TABLES.filter((t) => !tableSet.has(t)),
    },
  };
}

const pool = new pg.Pool({ connectionString: url });
const report = { envFile, apply: APPLY };

try {
  report.before = await snapshot(pool);
  console.log('BEFORE:', JSON.stringify(report.before, null, 2));

  if (APPLY && report.before.migrations.missing.length > 0) {
    console.log('\nApplying migrations via backend migrate...');
    const result = spawnSync(
      'npx',
      ['dotenv', '-e', envFile, '--', 'npm', 'run', 'migrate', '--prefix', 'backend'],
      { cwd: resolve('.'), encoding: 'utf8', shell: true }
    );
    report.migrationOutput = {
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    if (result.status !== 0) {
      console.error('Migration failed with exit code', result.status);
      process.exit(result.status ?? 1);
    }
  } else if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to execute migrations.');
  }

  report.after = await snapshot(pool);
  console.log('\nAFTER:', JSON.stringify(report.after, null, 2));

  report.schemaPass =
    report.after.migrations.missing.length === 0 &&
    report.after.rbacRolesIsArchived.is_archived &&
    report.after.rbacTables.missing.length === 0;

  mkdirSync(evidenceDir, { recursive: true });
  const outPath = resolve(evidenceDir, 'cloud-migration-evidence.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nEvidence written: ${outPath}`);
  console.log(`Schema verification: ${report.schemaPass ? 'PASS' : 'FAIL'}`);
} finally {
  await pool.end();
}

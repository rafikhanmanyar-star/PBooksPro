/**
 * A5.1.6C Phase 0 — production pre-cutover verification.
 * Usage: node scripts/rbac-production-pre-cutover.mjs [--env production|render]
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const useRender = process.argv.includes('--render') || process.argv.includes('--env') && process.argv.includes('render');
const envFile = useRender && existsSync(resolve('.env.production.render'))
  ? '.env.production.render'
  : existsSync(resolve('.env.production'))
    ? '.env.production'
    : '.env';

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

function signoffStatus() {
  const path = resolve('docs/security/A5_1_6B_EXECUTIVE_SIGNOFF.md');
  if (!existsSync(path)) return { present: false, financeLead: false, executiveSponsor: false };
  const text = readFileSync(path, 'utf8');
  const financeLead =
    /Finance Lead[\s\S]*?Name \| ([^\n_][^\n|]+)/.test(text) ||
    /Finance Lead[\s\S]*?Signature \| (?![_\s]*$)([^\n|]+)/.test(text);
  const executiveSponsor =
    /Executive Sponsor[\s\S]*?Name \| ([^\n_][^\n|]+)/.test(text) ||
    /Executive Sponsor[\s\S]*?Signature \| (?![_\s]*$)([^\n|]+)/.test(text);
  const hasBlankSignatures =
    text.includes('Name | _________________________________') ||
    text.includes('Signature | _________________________________');
  return {
    present: true,
    financeLead: financeLead && !hasBlankSignatures,
    executiveSponsor: executiveSponsor && !hasBlankSignatures,
    hasBlankSignatures,
  };
}

const pool = new pg.Pool({ connectionString: url });
const report = { envFile, timestamp: new Date().toISOString(), checks: {} };

try {
  const db = await pool.query('SELECT current_database() AS db');
  report.database = db.rows[0].db;

  const signoff = signoffStatus();
  report.checks.executiveSignoff = {
    documentPresent: signoff.present,
    financeLeadSigned: signoff.financeLead,
    executiveSponsorSigned: signoff.executiveSponsor,
    pass: signoff.financeLead && signoff.executiveSponsor,
  };

  const applied = await pool.query(`SELECT filename FROM schema_migrations`);
  const appliedSet = new Set(applied.rows.map((r) => r.filename));
  const missingMigrations = REQUIRED_MIGRATIONS.filter((f) => !appliedSet.has(f));
  report.checks.migrations = {
    required: REQUIRED_MIGRATIONS,
    missing: missingMigrations,
    pass: missingMigrations.length === 0,
  };

  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rbac_roles'`
  );
  const colSet = new Set(cols.rows.map((r) => r.column_name));
  report.checks.rbacRolesIsArchived = {
    is_archived: colSet.has('is_archived'),
    archived_at: colSet.has('archived_at'),
    pass: colSet.has('is_archived'),
  };

  const tables = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
    [REQUIRED_RBAC_TABLES]
  );
  const tableSet = new Set(tables.rows.map((r) => r.tablename));
  const missingTables = REQUIRED_RBAC_TABLES.filter((t) => !tableSet.has(t));
  report.checks.rbacTables = {
    missing: missingTables,
    pass: missingTables.length === 0,
  };

  report.checks.schemaVerification = {
    pass:
      report.checks.migrations.pass &&
      report.checks.rbacRolesIsArchived.pass &&
      report.checks.rbacTables.pass,
  };

  report.readyForPilot =
    report.checks.executiveSignoff.pass && report.checks.schemaVerification.pass;

  console.log(JSON.stringify(report, null, 2));

  if (!report.readyForPilot) {
    console.error('\nPre-cutover BLOCKED — resolve failing checks before Phase 1.');
    process.exit(1);
  }
  console.log('\nPre-cutover PASS — ready for Phase 1 pilot tenant rollout.');
} finally {
  await pool.end();
}

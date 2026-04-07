/**
 * Migrate data from legacy pbookspro.db to multi-company rkbuilders.db
 *
 * - Copies SOURCE_DB to TARGET_DB (replaces target; no merge).
 * - Updates company information to "Rkbuilders" in the target DB.
 * - Ensures master_index.db has a companies row for rkbuilders so the app
 *   opens it when the user selects "Rkbuilders".
 *
 * Run: node scripts/migrate-pbookspro-to-rkbuilders.cjs
 *
 * Paths (edit below if needed):
 *   SOURCE: .../pbookspro/pbookspro.db
 *   TARGET: .../pbookspro/data/companies/rkbuilders.db
 */

const path = require('path');
const fs = require('fs');

// Paths: source = legacy single DB; target = multi-company company DB; master = company index
const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
// Try PBooksPro.db first (actual filename), fallback to pbookspro.db
const SOURCE_DB = fs.existsSync(path.resolve(BASE_DIR, 'PBooksPro.db')) 
  ? path.resolve(BASE_DIR, 'PBooksPro.db')
  : path.resolve(BASE_DIR, 'pbookspro.db');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');
const MASTER_DB = path.resolve(BASE_DIR, 'master_index.db');

const COMPANY_NAME = 'Rkbuilders';
const COMPANY_SLUG = 'rkbuilders';
const SCHEMA_VERSION = 13;

// Tables that may have tenant_id to normalize to 'local'
const TENANT_TABLES = [
  'accounts', 'contacts', 'vendors', 'categories', 'projects', 'buildings',
  'properties', 'units', 'transactions', 'invoices', 'bills', 'budgets',
  'quotations', 'plan_amenities', 'installment_plans', 'documents',
  'rental_agreements', 'project_agreements', 'sales_returns', 'contracts',
  'recurring_invoice_templates', 'pm_cycle_allocations', 'users',
];

function main() {
  console.log('Migration: pbookspro.db → rkbuilders.db (Rkbuilders company)\n');

  if (!fs.existsSync(SOURCE_DB)) {
    console.error('Source database not found:', SOURCE_DB);
    process.exit(1);
  }

  const companiesDir = path.dirname(TARGET_DB);
  if (!fs.existsSync(companiesDir)) {
    fs.mkdirSync(companiesDir, { recursive: true });
    console.log('Created directory:', companiesDir);
  }

  // 1) Remove existing target DB (no merge)
  if (fs.existsSync(TARGET_DB)) {
    try {
      fs.unlinkSync(TARGET_DB);
      console.log('Removed existing', path.basename(TARGET_DB));
    } catch (e) {
      console.error('Could not delete existing target DB. Close the app and try again.', e.message);
      process.exit(1);
    }
  }
  ['-wal', '-shm'].forEach((suffix) => {
    const p = TARGET_DB + suffix;
    if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch (_) {}
  });

  // 2) Copy source → target
  fs.copyFileSync(SOURCE_DB, TARGET_DB);
  if (fs.existsSync(SOURCE_DB + '-wal')) fs.copyFileSync(SOURCE_DB + '-wal', TARGET_DB + '-wal');
  if (fs.existsSync(SOURCE_DB + '-shm')) fs.copyFileSync(SOURCE_DB + '-shm', TARGET_DB + '-shm');
  console.log('Copied', SOURCE_DB, '→', TARGET_DB);

  const Database = require('better-sqlite3');

  // 3) Open target, checkpoint WAL, then update company info
  const target = new Database(TARGET_DB);
  target.pragma('journal_mode = WAL');
  target.pragma('foreign_keys = ON');

  try {
    target.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_) {}

  // 4) Ensure company_settings and set to Rkbuilders
  target.exec(`
    CREATE TABLE IF NOT EXISTS company_settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      company_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  target.prepare(
    "INSERT OR REPLACE INTO company_settings (id, company_name, updated_at) VALUES ('default', ?, datetime('now'))"
  ).run(COMPANY_NAME);
  console.log('Set company_settings.company_name to', COMPANY_NAME);

  // 5) Update printSettings companyName in app_settings if present
  try {
    const row = target.prepare("SELECT value FROM app_settings WHERE key = 'printSettings'").get();
    if (row && row.value) {
      const settings = JSON.parse(row.value);
      settings.companyName = COMPANY_NAME;
      target.prepare("UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = 'printSettings'").run(JSON.stringify(settings));
      console.log('Updated app_settings printSettings.companyName to', COMPANY_NAME);
    }
  } catch (_) {}

  // 6) Ensure metadata schema_version
  target.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  target.prepare(
    "INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES ('schema_version', ?, datetime('now'))"
  ).run(String(SCHEMA_VERSION));

  // 7) Normalize tenant_id to 'local' where column exists
  for (const table of TENANT_TABLES) {
    try {
      const cols = target.prepare(`PRAGMA table_info("${table}")`).all();
      if (cols.some((c) => c.name === 'tenant_id')) {
        target.prepare(`UPDATE "${table}" SET tenant_id = 'local' WHERE tenant_id IS NULL OR tenant_id != 'local'`).run();
      }
    } catch (_) {}
  }
  console.log('Normalized tenant_id to "local" in company tables.');

  // 7b) Fix current_user_id to match actual user (critical for data loading)
  try {
    const firstUser = target.prepare('SELECT id FROM users LIMIT 1').get();
    if (firstUser && firstUser.id) {
      target.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_user_id', ?, datetime('now'))").run(firstUser.id);
      target.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_tenant_id', 'local', datetime('now'))").run();
      console.log('Set current_user_id to actual user ID:', firstUser.id);
    }
  } catch (e) {
    console.warn('Could not set current_user_id:', e.message);
  }

  target.close();

  // 8) Remove WAL/SHM from target so we have a single file
  try { if (fs.existsSync(TARGET_DB + '-wal')) fs.unlinkSync(TARGET_DB + '-wal'); } catch (_) {}
  try { if (fs.existsSync(TARGET_DB + '-shm')) fs.unlinkSync(TARGET_DB + '-shm'); } catch (_) {}

  // 9) Update or create master_index.db so app opens rkbuilders when selected
  const masterDir = path.dirname(MASTER_DB);
  if (!fs.existsSync(masterDir)) fs.mkdirSync(masterDir, { recursive: true });

  const master = new Database(MASTER_DB);
  master.pragma('journal_mode = WAL');
  master.pragma('foreign_keys = ON');
  master.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      db_file_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_opened_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      schema_version INTEGER NOT NULL DEFAULT 13
    );
  `);

  const existing = master.prepare('SELECT id FROM companies WHERE slug = ?').get(COMPANY_SLUG);
  const absoluteTarget = path.resolve(TARGET_DB);

  if (existing) {
    master.prepare(
      "UPDATE companies SET company_name = ?, db_file_path = ?, schema_version = ?, is_active = 1 WHERE slug = ?"
    ).run(COMPANY_NAME, absoluteTarget, SCHEMA_VERSION, COMPANY_SLUG);
    console.log('Updated master_index companies row for', COMPANY_SLUG);
  } else {
    const id = require('crypto').randomUUID();
    master.prepare(
      `INSERT INTO companies (id, company_name, slug, db_file_path, created_at, schema_version)
       VALUES (?, ?, ?, ?, datetime('now'), ?)`
    ).run(id, COMPANY_NAME, COMPANY_SLUG, absoluteTarget, SCHEMA_VERSION);
    console.log('Inserted master_index companies row for', COMPANY_SLUG, '(id:', id, ')');
  }

  master.close();

  console.log('\nDone. Close this script, then open the app. Use "Switch Company" and select "Rkbuilders" to open the migrated data.');
}

main();

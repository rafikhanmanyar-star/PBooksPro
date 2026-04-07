/**
 * Prepare Local DB for Local-Only Mode
 *
 * Takes an existing SQLite DB (with production tenant data already synced)
 * and rewrites tenant_id / user references so the local-only app
 * (which uses hardcoded tenant='local', user='local-user') can see all data.
 *
 * Usage:
 *   node scripts/prepare-local-db.cjs
 *   node scripts/prepare-local-db.cjs --tenant tenant_1772127374840_58dd49a4
 *   node scripts/prepare-local-db.cjs --source "C:\path\to\PBooksPro.db"
 *
 * The script:
 *   1. Copies source DB to the production DB path (PBooksPro.db)
 *   2. Rewrites all tenant_id values from the real ID to 'local'
 *   3. Updates tenants table (id -> 'local')
 *   4. Updates users table (sets first user as 'local-user')
 *
 * Close the Electron app before running this script.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_TENANT = 'tenant_1772127374840_58dd49a4';

const TABLES_WITH_TENANT_ID = [
  'users', 'accounts', 'contacts', 'vendors', 'categories',
  'projects', 'buildings', 'properties', 'units',
  'transactions', 'invoices', 'bills', 'budgets', 'quotations',
  'documents', 'plan_amenities', 'installment_plans',
  'rental_agreements', 'project_agreements', 'sales_returns',
  'contracts', 'recurring_invoice_templates', 'pm_cycle_allocations',
  'purchase_orders',
  'registered_suppliers',
  'payroll_departments', 'payroll_grades', 'payroll_employees',
  'payroll_runs', 'payslips', 'payroll_salary_components',
  'sync_outbox', 'sync_metadata',
  'whatsapp_menu_sessions',
];

// (rental_agreements now uses tenant_id like other tables; no separate org_id list)

// buyer_tenant_id / supplier_tenant_id columns in P2P tables
const P2P_TENANT_COLS = [
  { table: 'purchase_orders', cols: ['buyer_tenant_id', 'supplier_tenant_id'] },
  { table: 'registered_suppliers', cols: ['buyer_tenant_id', 'supplier_tenant_id'] },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let tenant = DEFAULT_TENANT;
  let source = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tenant' && args[i + 1]) {
      tenant = args[i + 1]; i++;
    } else if (args[i] === '--source' && args[i + 1]) {
      source = args[i + 1]; i++;
    }
  }
  return { tenant, source };
}

function getDbDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'pbooks-pro', 'pbookspro');
}

function getTargetDbPath() {
  return path.join(getDbDir(), 'PBooksPro.db');
}

async function main() {
  const { tenant, source } = parseArgs();
  const targetPath = getTargetDbPath();
  const dbDir = getDbDir();

  console.log('='.repeat(70));
  console.log('  Prepare Local DB for Local-Only Mode');
  console.log('='.repeat(70));
  console.log(`  Tenant to migrate: ${tenant}`);
  console.log(`  Target DB:         ${targetPath}`);
  if (source) console.log(`  Source DB:         ${source}`);
  console.log('='.repeat(70));
  console.log();

  // Determine source DB
  let sourceDbPath = source;
  if (!sourceDbPath) {
    // Auto-detect: use PBooksPro.db if it exists, otherwise PBooksPro-Staging.db
    const prodDb = path.join(dbDir, 'PBooksPro.db');
    const stagingDb = path.join(dbDir, 'PBooksPro-Staging.db');
    if (fs.existsSync(prodDb)) {
      sourceDbPath = prodDb;
    } else if (fs.existsSync(stagingDb)) {
      sourceDbPath = stagingDb;
    } else {
      console.error('ERROR: No SQLite database found at:');
      console.error(`  ${prodDb}`);
      console.error(`  ${stagingDb}`);
      console.error('Run the app connected to the cloud first to sync data, or specify --source.');
      process.exit(1);
    }
  }

  if (!fs.existsSync(sourceDbPath)) {
    console.error(`ERROR: Source database not found: ${sourceDbPath}`);
    process.exit(1);
  }

  console.log(`[1/5] Loading database: ${path.basename(sourceDbPath)} (${(fs.statSync(sourceDbPath).size / 1024 / 1024).toFixed(1)} MB)`);

  // Load sql.js
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  // If source is different from target, work on a copy
  let workingPath = sourceDbPath;
  const isSameFile = path.resolve(sourceDbPath) === path.resolve(targetPath);

  // Checkpoint WAL first: merge WAL into main DB file
  // Read the source (+ WAL if present) by opening with sql.js which handles WAL automatically
  const sourceBuffer = fs.readFileSync(sourceDbPath);
  let db = new SQL.Database(sourceBuffer);

  // Check if tenant exists in tenants table (may be in WAL, so we also check data tables)
  let tenantName = '';
  const tenantRows = db.exec(`SELECT id, name FROM tenants WHERE id = '${tenant}'`);
  if (tenantRows.length && tenantRows[0].values.length) {
    tenantName = tenantRows[0].values[0][1] || '';
    console.log(`  Tenant found in tenants table: "${tenantName}"`);
  } else {
    // Tenant record may be in WAL; check if data exists with this tenant_id
    const dataCheck = db.exec(`SELECT COUNT(*) FROM accounts WHERE tenant_id = '${tenant}'`);
    const dataCount = dataCheck.length ? dataCheck[0].values[0][0] : 0;
    if (dataCount > 0) {
      console.log(`  Tenant record not in main DB (likely in WAL), but ${dataCount} accounts found with this tenant_id.`);
      console.log('  Proceeding with migration...');
    } else {
      console.error(`\nERROR: No data found for tenant "${tenant}" in the database.`);
      // Show what tenant_ids exist in the data
      const distResult = db.exec('SELECT DISTINCT tenant_id FROM accounts WHERE tenant_id IS NOT NULL AND tenant_id != ""');
      if (distResult.length && distResult[0].values.length) {
        console.log('\n  Tenant IDs found in accounts table:');
        distResult[0].values.forEach(([tid]) => console.log(`    ${tid}`));
      }
      db.close();
      process.exit(1);
    }
  }

  // Count users
  const usersBefore = db.exec(`SELECT COUNT(*) FROM users WHERE tenant_id = '${tenant}'`);
  const userCount = usersBefore.length ? usersBefore[0].values[0][0] : 0;
  console.log(`  Users for this tenant: ${userCount}`);

  // --- Step 2: Back up ---
  console.log('\n[2/5] Creating backup...');
  const backupName = `PBooksPro.db.backup-before-local-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const backupPath = path.join(dbDir, backupName);
  try {
    const exportedData = db.export();
    fs.writeFileSync(backupPath, Buffer.from(exportedData));
    console.log(`  Backup saved: ${backupName}`);
  } catch (err) {
    console.log(`  WARNING: Could not create backup (${err.message}). Continuing anyway.`);
  }

  // --- Step 3: Rewrite tenant IDs ---
  console.log('\n[3/5] Rewriting tenant IDs...');
  const NEW_TENANT = 'local';
  const NEW_USER_ID = 'local-user';
  let tablesUpdated = 0;
  let rowsUpdated = 0;

  // Update tenants table: change the tenant ID itself, or insert if missing
  try {
    const localExists = db.exec(`SELECT COUNT(*) FROM tenants WHERE id = 'local'`);
    const localCount = localExists.length ? localExists[0].values[0][0] : 0;

    const prodTenantExists = db.exec(`SELECT COUNT(*) FROM tenants WHERE id = '${tenant}'`);
    const prodCount = prodTenantExists.length ? prodTenantExists[0].values[0][0] : 0;

    if (prodCount > 0) {
      if (localCount > 0) db.run(`DELETE FROM tenants WHERE id = 'local'`);
      db.run(`UPDATE tenants SET id = '${NEW_TENANT}' WHERE id = '${tenant}'`);
      console.log(`  tenants.id: ${tenant} -> ${NEW_TENANT}`);
    } else if (localCount === 0) {
      // Tenant record missing (was likely in WAL); insert a stub
      const name = tenantName || 'Local Organization';
      db.run(`INSERT INTO tenants (id, name, created_at, updated_at) VALUES ('${NEW_TENANT}', '${name}', datetime('now'), datetime('now'))`);
      console.log(`  tenants: inserted '${NEW_TENANT}' (${name}) - record was missing from main DB`);
    } else {
      console.log(`  tenants: 'local' already exists`);
    }
    tablesUpdated++;
  } catch (err) {
    console.log(`  [WARN] tenants: ${err.message}`);
  }

  // Tables with UNIQUE(tenant_id, ...) that need dedup before bulk update
  const TABLES_WITH_TENANT_UNIQUE = ['bills', 'invoices', 'contracts', 'project_agreements',
    'purchase_orders'];

  // Update all tables with tenant_id column
  // Also update rows where tenant_id is empty (synced data that lost its tenant_id)
  for (const table of TABLES_WITH_TENANT_ID) {
    try {
      const result = db.exec(`SELECT COUNT(*) FROM "${table}" WHERE tenant_id = '${tenant}' OR (tenant_id = '' AND tenant_id != '${NEW_TENANT}')`);
      const count = result.length ? result[0].values[0][0] : 0;
      if (count > 0) {
        // For tables with UNIQUE(tenant_id, number), remove duplicates first
        if (TABLES_WITH_TENANT_UNIQUE.includes(table)) {
          try {
            // Delete rows that would cause UNIQUE conflicts: keep the row with the real tenant_id
            // or the first row if both are empty
            const numberCol = table === 'bills' ? 'bill_number'
              : table === 'invoices' ? 'invoice_number'
              : table === 'contracts' ? 'contract_number'
              : table === 'project_agreements' ? 'agreement_number'
              : table === 'purchase_orders' ? 'po_number' : null;

            if (numberCol) {
              // Delete junk duplicates: rows with empty tenant_id that duplicate a numbered row
              db.run(`DELETE FROM "${table}" WHERE rowid IN (
                SELECT b.rowid FROM "${table}" b
                INNER JOIN "${table}" a ON a."${numberCol}" = b."${numberCol}"
                WHERE a.tenant_id = '${tenant}' AND (b.tenant_id = '' OR b.tenant_id IS NULL)
              )`);
              // Also delete any row with tenant_id = production that would duplicate an existing 'local' row
              db.run(`DELETE FROM "${table}" WHERE rowid IN (
                SELECT b.rowid FROM "${table}" b
                INNER JOIN "${table}" a ON a."${numberCol}" = b."${numberCol}"
                WHERE a.tenant_id = '${NEW_TENANT}' AND b.tenant_id = '${tenant}'
              )`);
            }
          } catch { /* best effort dedup */ }
        }
        db.run(`UPDATE "${table}" SET tenant_id = '${NEW_TENANT}' WHERE tenant_id = '${tenant}' OR tenant_id = ''`);
        console.log(`  ${table}.tenant_id: ${count} rows`);
        tablesUpdated++;
        rowsUpdated += count;
      }
    } catch (err) {
      console.log(`  [WARN] ${table}: ${err.message}`);
    }
  }

  // Update P2P buyer_tenant_id / supplier_tenant_id
  for (const { table, cols } of P2P_TENANT_COLS) {
    for (const col of cols) {
      try {
        const result = db.exec(`SELECT COUNT(*) FROM "${table}" WHERE "${col}" = '${tenant}' OR "${col}" = ''`);
        const count = result.length ? result[0].values[0][0] : 0;
        if (count > 0) {
          db.run(`UPDATE "${table}" SET "${col}" = '${NEW_TENANT}' WHERE "${col}" = '${tenant}' OR "${col}" = ''`);
          console.log(`  ${table}.${col}: ${count} rows`);
          rowsUpdated += count;
        }
      } catch {
        // Column may not exist
      }
    }
  }

  console.log(`  Total: ${tablesUpdated} tables, ${rowsUpdated} rows updated`);

  // --- Step 4: Set up local user ---
  console.log('\n[4/5] Setting up local user...');

  // Get all users for this tenant (now with tenant_id = 'local')
  const usersResult = db.exec(`SELECT id, username, name, role FROM users WHERE tenant_id = '${NEW_TENANT}' ORDER BY role ASC`);
  if (usersResult.length && usersResult[0].values.length) {
    const users = usersResult[0].values;
    const columns = usersResult[0].columns;

    // The first admin user becomes 'local-user'
    const adminUser = users.find(u => u[columns.indexOf('role')] === 'Admin') || users[0];
    const adminId = adminUser[columns.indexOf('id')];
    const adminUsername = adminUser[columns.indexOf('username')];
    const adminName = adminUser[columns.indexOf('name')];

    // Update the primary user's ID to 'local-user'
    db.run(`UPDATE users SET id = '${NEW_USER_ID}' WHERE id = '${adminId}'`);

    // Also update user_id references in other tables that point to this user
    const tablesWithUserId = [
      'accounts', 'contacts', 'vendors', 'projects', 'buildings',
      'properties', 'units', 'transactions', 'invoices', 'bills',
      'budgets', 'quotations', 'documents', 'installment_plans',
      'project_agreements', 'contracts', 'recurring_invoice_templates',
      'pm_cycle_allocations', 'sales_returns', 'purchase_orders',
    ];
    for (const tbl of tablesWithUserId) {
      try {
        db.run(`UPDATE "${tbl}" SET user_id = '${NEW_USER_ID}' WHERE user_id = '${adminId}'`);
      } catch { /* column may not exist */ }
    }

    console.log(`  Primary user: ${adminUsername} (${adminName}) -> id: ${NEW_USER_ID}`);
    console.log();
    console.log('  All users in database:');
    console.log('  ' + '-'.repeat(60));
    for (const u of users) {
      const id = u[columns.indexOf('id')];
      const uname = u[columns.indexOf('username')];
      const uname2 = u[columns.indexOf('name')];
      const role = u[columns.indexOf('role')];
      const marker = id === adminId ? ' -> local-user (primary)' : '';
      console.log(`    ${uname}  |  ${uname2}  |  ${role}${marker}`);
    }
    console.log('  ' + '-'.repeat(60));
  } else {
    console.log('  WARNING: No users found for tenant. Login may not work.');
  }

  // --- Step 5: Save to target path ---
  console.log('\n[5/5] Saving database...');

  // Clean up sync-related tables (not needed in local-only mode)
  try { db.run('DELETE FROM sync_outbox'); } catch {}
  try { db.run('DELETE FROM sync_metadata'); } catch {}
  try { db.run('DELETE FROM sync_conflicts'); } catch {}

  // Set metadata (preserve existing schema_version if present)
  try {
    const existingVersion = db.exec("SELECT value FROM metadata WHERE key = 'schema_version'");
    const schemaVersion = (existingVersion.length && existingVersion[0].values.length)
      ? existingVersion[0].values[0][0] : '1';
    db.run(`INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES ('schema_version', '${schemaVersion}', datetime('now'))`);
    db.run(`INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES ('migrated_from', 'production', datetime('now'))`);
    db.run(`INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES ('migrated_at', '${new Date().toISOString()}', datetime('now'))`);
    db.run(`INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES ('original_tenant', '${tenant}', datetime('now'))`);
  } catch {}

  // Set app_settings for the local app
  try {
    db.run(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_tenant_id', '${NEW_TENANT}', datetime('now'))`);
    db.run(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_org_name', '${tenantName || ''}', datetime('now'))`);
  } catch {}

  // Export and write
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const data = db.export();
  const buffer = Buffer.from(data);
  db.close();

  fs.writeFileSync(targetPath, buffer);

  // Remove stale WAL/SHM files for the target
  try { if (fs.existsSync(targetPath + '-wal')) fs.unlinkSync(targetPath + '-wal'); } catch {}
  try { if (fs.existsSync(targetPath + '-shm')) fs.unlinkSync(targetPath + '-shm'); } catch {}

  // Also remove the sql.js blob file if it exists (could have stale data)
  const blobPath = path.join(dbDir, 'PBooksPro_sqljs.bin');
  try { if (fs.existsSync(blobPath)) fs.unlinkSync(blobPath); } catch {}

  const finalSize = (buffer.length / 1024 / 1024).toFixed(1);
  console.log(`  Saved: ${targetPath} (${finalSize} MB)`);

  // --- Summary ---
  console.log();
  console.log('='.repeat(70));
  console.log('  DONE! Database is ready for local-only mode.');
  console.log('='.repeat(70));
  console.log();
  console.log('  NEXT STEPS:');
  console.log('    1. Close the Electron app if it is running');
  console.log('    2. Start the app:  npm run electron:local');
  console.log('    3. The app will auto-login and show your production data');
  console.log();
  console.log('  Database location:');
  console.log(`    ${targetPath}`);
  console.log();
  console.log('  Backup location:');
  console.log(`    ${backupPath}`);
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

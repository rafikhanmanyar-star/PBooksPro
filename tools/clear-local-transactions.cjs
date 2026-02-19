#!/usr/bin/env node
/**
 * Clear Local SQLite Transactions
 *
 * Removes transactions from the local SQLite database used by the Electron app.
 * Uses sql.js (pure JS) so it works regardless of Node.js native-module version.
 * Also resets sync_metadata so the app performs a full re-sync from the cloud
 * on next launch.
 *
 * Usage:
 *   npm run clear-local-transactions
 *   node tools/clear-local-transactions.cjs [path-to-database]
 *   node tools/clear-local-transactions.cjs [path] [options]
 *
 * Options:
 *   --dry-run       Preview what would be deleted without making changes
 *   --all           Clear all transaction-related tables (invoices, bills,
 *                   accounts, contracts, etc.) - matches app's clearTransactionData
 *   --tenant <id>   Clear only rows for the given tenant_id (requires --all for
 *                   full tenant purge of related tables)
 *
 * If no path is given, searches common Electron userData locations.
 *
 * IMPORTANT: Close the app before running to avoid file locks.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function getPossibleDbPaths() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return [
    // New separate DB filenames (staging / production)
    path.join(appData, 'pbooks-pro', 'pbookspro', 'PBooksPro-Staging.db'),
    path.join(appData, 'pbooks-pro', 'pbookspro', 'PBooksPro.db'),
    path.join(appData, 'PBooks Pro', 'pbookspro', 'PBooksPro-Staging.db'),
    path.join(appData, 'PBooks Pro', 'pbookspro', 'PBooksPro.db'),
    path.join(appData, 'PBooks Pro (Staging)', 'pbookspro', 'PBooksPro-Staging.db'),
    path.join(appData, 'PBooks Pro (Staging)', 'pbookspro', 'PBooksPro.db'),
    // Legacy paths (finance.db)
    path.join(appData, 'pbooks-pro', 'pbookspro', 'finance.db'),
    path.join(appData, 'PBooks Pro', 'pbookspro', 'finance.db'),
    path.join(appData, 'PBooksPro', 'pbookspro', 'finance.db'),
    path.join(appData, 'PBooks Pro (Staging)', 'pbookspro', 'finance.db'),
    path.join(appData, 'my-projects-pro', 'finance_db.sqlite'),
    path.join(appData, 'my-projects-pro', 'native_finance_db.sqlite'),
    path.join(appData, 'PBooksPro', 'finance_db.sqlite'),
    path.join(__dirname, '..', 'finance_db.sqlite'),
  ];
}

function findDbPath(overridePath) {
  if (overridePath) {
    const resolved = path.resolve(overridePath);
    return fs.existsSync(resolved) ? resolved : null;
  }
  for (const p of getPossibleDbPaths()) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const pathArg = args.find((a) => !a.startsWith('-'));
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const tenantIdx = args.indexOf('--tenant');
  const tenantId = tenantIdx >= 0 && args[tenantIdx + 1] ? args[tenantIdx + 1] : null;
  const dbPath = pathArg || findDbPath();
  return { dbPath, dryRun, all, tenantId };
}

const TRANSACTION_TABLES = ['transactions', 'transaction_log'];
const ALL_RELATED_TABLES = [
  'transactions',
  'transaction_log',
  'sales_returns',
  'pm_cycle_allocations',
  'invoices',
  'bills',
  'quotations',
  'recurring_invoice_templates',
  'contracts',
  'rental_agreements',
  'project_agreements',
  'accounts',
];
const TABLES_WITHOUT_TENANT_ID = ['transaction_log'];

// Tables to reset so the app triggers a full re-sync from cloud
const SYNC_TABLES = ['sync_metadata', 'sync_outbox', 'sync_conflicts'];

function tableExists(db, name) {
  const stmt = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  );
  stmt.bind([name]);
  const found = stmt.step();
  stmt.free();
  return found;
}

function getCount(db, table, tenantId) {
  if (!tableExists(db, table)) return null;
  if (tenantId && TABLES_WITHOUT_TENANT_ID.includes(table)) return null;
  const sql = tenantId
    ? `SELECT COUNT(*) as n FROM ${table} WHERE tenant_id = ?`
    : `SELECT COUNT(*) as n FROM ${table}`;
  const params = tenantId ? [tenantId] : [];
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  stmt.step();
  const row = stmt.getAsObject();
  stmt.free();
  return row.n;
}

async function clearTransactions(dbPath, opts) {
  const { dryRun, all, tenantId } = opts;
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database file not found: ${dbPath}`);
    process.exit(1);
  }

  console.log(`📦 Opening database: ${dbPath}`);

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  if (dryRun) console.log('🔍 DRY RUN – no changes will be made\n');

  db.run('PRAGMA foreign_keys = OFF');

  try {
    const tablesToClear = all ? ALL_RELATED_TABLES : TRANSACTION_TABLES;
    const counts = {};
    let totalRows = 0;

    for (const table of tablesToClear) {
      const n = getCount(db, table, tenantId);
      if (n !== null && n > 0) {
        counts[table] = n;
        totalRows += n;
      }
    }

    // Count sync table rows
    const syncCounts = {};
    let syncTotal = 0;
    for (const table of SYNC_TABLES) {
      const n = getCount(db, table, tenantId);
      if (n !== null && n > 0) {
        syncCounts[table] = n;
        syncTotal += n;
      }
    }

    if (totalRows === 0 && syncTotal === 0) {
      console.log('ℹ️  No matching rows to clear.');
      db.close();
      return;
    }

    if (totalRows > 0) {
      console.log(`\nFound ${totalRows} row(s) to delete across ${Object.keys(counts).length} table(s):`);
      Object.entries(counts).forEach(([t, n]) => console.log(`   - ${t}: ${n}`));
    }

    if (syncTotal > 0) {
      console.log(`\nSync tables to reset (${syncTotal} row(s)):`);
      Object.entries(syncCounts).forEach(([t, n]) => console.log(`   - ${t}: ${n}`));
    }

    if (!dryRun) {
      // Delete transaction data
      if (totalRows > 0) {
        console.log('\n🗑️  Deleting transaction data...');
        for (const table of tablesToClear) {
          if (!tableExists(db, table)) continue;
          if (tenantId && TABLES_WITHOUT_TENANT_ID.includes(table)) continue;
          try {
            const sql = tenantId
              ? `DELETE FROM ${table} WHERE tenant_id = ?`
              : `DELETE FROM ${table}`;
            if (tenantId) {
              db.run(sql, [tenantId]);
            } else {
              db.run(sql);
            }
            console.log(`   ✓ Cleared ${table}`);
          } catch (e) {
            console.warn(`   ⚠️  Skipped ${table}: ${e.message}`);
          }
        }
      }

      // Reset sync tables so the app performs a full re-sync from cloud
      console.log('\n🔄 Resetting sync state (forces full re-sync from cloud)...');
      for (const table of SYNC_TABLES) {
        if (!tableExists(db, table)) continue;
        try {
          if (tenantId) {
            db.run(`DELETE FROM ${table} WHERE tenant_id = ?`, [tenantId]);
          } else {
            db.run(`DELETE FROM ${table}`);
          }
          console.log(`   ✓ Cleared ${table}`);
        } catch (e) {
          console.warn(`   ⚠️  Skipped ${table}: ${e.message}`);
        }
      }

      // Reset autoincrement sequences
      if (!tenantId) {
        for (const table of [...tablesToClear, ...SYNC_TABLES]) {
          try {
            db.run('DELETE FROM sqlite_sequence WHERE name = ?', [table]);
          } catch (_) {}
        }
      }

      // Write changes back to disk
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);

      console.log('\n✅ Done! On next app launch:');
      console.log('   1. The app will detect empty sync_metadata');
      console.log('   2. Bidirectional sync will pull ALL data from the cloud');
      console.log('   3. Transactions and related data will be restored from the server');
    } else {
      console.log('\n(Dry run – no changes made)');
    }
  } finally {
    db.run('PRAGMA foreign_keys = ON');
    db.close();
  }
}

// Main
const { dbPath, dryRun, all, tenantId } = parseArgs(process.argv);

console.log('🔧 Clear Local SQLite Transactions\n');

if (!dbPath) {
  console.error('❌ Database file not found.');
  console.error('\nUsage:');
  console.error('  node tools/clear-local-transactions.cjs [path-to-database] [--dry-run] [--all] [--tenant <id>]');
  console.error('\nOptions:');
  console.error('  --dry-run   Preview without deleting');
  console.error('  --all       Clear invoices, bills, accounts, contracts, etc.');
  console.error('  --tenant X  Clear only rows for tenant_id X');
  console.error('\nSearched in:');
  getPossibleDbPaths().forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

if (tenantId && !all) {
  console.warn('⚠️  --tenant is applied only to transaction tables by default.');
  console.warn('   Use --all to clear all related tables for that tenant.\n');
}

clearTransactions(dbPath, { dryRun, all, tenantId });

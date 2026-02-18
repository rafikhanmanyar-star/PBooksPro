#!/usr/bin/env node
/**
 * Clear Local SQLite Transactions
 *
 * Completely removes all transactions from the local SQLite database.
 * Also clears transaction_log (audit entries) and resets sqlite_sequence for transactions.
 *
 * Usage:
 *   node tools/clear-local-transactions.cjs [path-to-database]
 *
 * If no path is given, searches common Electron userData locations.
 *
 * IMPORTANT: Close the app before running this script to avoid file locks.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function getPossibleDbPaths() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const paths = [
    // Confirmed path: C:\Users\<user>\AppData\Roaming\pbooks-pro\pbookspro\finance.db
    path.join(appData, 'pbooks-pro', 'pbookspro', 'finance.db'),
    // Other Electron paths (sqliteBridge uses userData/pbookspro/finance.db)
    path.join(appData, 'PBooks Pro', 'pbookspro', 'finance.db'),
    path.join(appData, 'PBooksPro', 'pbookspro', 'finance.db'),
    // Staging app
    path.join(appData, 'PBooks Pro (Staging)', 'pbookspro', 'finance.db'),
    // Legacy paths
    path.join(appData, 'my-projects-pro', 'finance_db.sqlite'),
    path.join(appData, 'my-projects-pro', 'native_finance_db.sqlite'),
    path.join(appData, 'PBooksPro', 'finance_db.sqlite'),
    // Project root
    path.join(__dirname, '..', 'finance_db.sqlite'),
  ];
  return paths;
}

function findDbPath(overridePath) {
  if (overridePath) {
    const resolved = path.resolve(overridePath);
    if (fs.existsSync(resolved)) return resolved;
    return null;
  }
  for (const p of getPossibleDbPaths()) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function clearTransactions(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Database file not found: ${dbPath}`);
    process.exit(1);
  }

  console.log(`📦 Opening database: ${dbPath}`);
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);

  db.pragma('foreign_keys = OFF'); // Disable for bulk delete

  try {
    // Check if transactions table exists
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'"
    ).get();
    if (!tableCheck) {
      console.error('❌ Table "transactions" does not exist in this database.');
      db.close();
      process.exit(1);
    }

    const countBefore = db.prepare('SELECT COUNT(*) as n FROM transactions').get();
    const txCount = countBefore.n;

    if (txCount === 0) {
      console.log('ℹ️  No transactions to clear.');
      db.close();
      return;
    }

    console.log(`🗑️  Deleting ${txCount} transaction(s)...`);
    db.prepare('DELETE FROM transactions').run();

    // Clear transaction_log (audit/activity log)
    let logCount = 0;
    try {
      const logCheck = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='transaction_log'"
      ).get();
      if (logCheck) {
        logCount = db.prepare('SELECT COUNT(*) as n FROM transaction_log').get().n;
        db.prepare('DELETE FROM transaction_log').run();
        if (logCount > 0) {
          console.log(`   Cleared ${logCount} transaction_log entry(ies).`);
        }
      }
    } catch (e) {
      // transaction_log might not exist
    }

    // Reset sqlite_sequence for transactions (no autoincrement, but some tables use it)
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'transactions'").run();
    } catch (_) {}

    console.log('✅ All transactions cleared.');
  } finally {
    db.pragma('foreign_keys = ON');
    db.close();
  }
}

// Main
const args = process.argv.slice(2);
const dbPath = args.length > 0 ? args[0] : findDbPath();

console.log('🔧 Clear Local SQLite Transactions\n');

if (!dbPath) {
  console.error('❌ Database file not found.');
  console.error('\nUsage:');
  console.error('  node tools/clear-local-transactions.cjs [path-to-database]');
  console.error('\nSearched in:');
  getPossibleDbPaths().forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

clearTransactions(dbPath);

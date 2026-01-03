#!/usr/bin/env node
/**
 * Data Migration Script: Transfer data from sql.js database to native better-sqlite3 database
 * 
 * This script:
 * 1. Opens the sql.js database (finance_db.sqlite)
 * 2. Opens the native database (native_finance_db.sqlite)
 * 3. Transfers all transactions to the native database
 * 4. Verifies data integrity
 * 
 * Run this after the database file has been copied:
 *   node tools/migrate-data-to-native.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

// Get Electron userData directory
function getUserDataDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const possiblePaths = [
    path.join(appData, 'my-projects-pro'),
    path.join(appData, 'PBooksPro'),
    path.join(appData, 'finance-tracker-pro-v1.0.2'),
  ];
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  }
  
  return path.join(appData, 'my-projects-pro');
}

const userDataDir = getUserDataDir();
const sourceDbPath = path.join(userDataDir, 'finance_db.sqlite'); // sql.js database
const targetDbPath = path.join(userDataDir, 'native_finance_db.sqlite'); // native database

console.log('🔄 Starting data migration...');
console.log(`   Source: ${sourceDbPath}`);
console.log(`   Target: ${targetDbPath}`);

// Check if source database exists
if (!fs.existsSync(sourceDbPath)) {
  console.error(`❌ Source database not found at ${sourceDbPath}`);
  console.error('   Make sure you have run the app at least once.');
  process.exit(1);
}

// Open source database (sql.js SQLite file)
const sourceDb = new Database(sourceDbPath, { readonly: true });

// Open target database (native database)
// Create if it doesn't exist
const targetDb = new Database(targetDbPath);
targetDb.pragma('journal_mode = WAL');

// Ensure target database has the correct schema
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subtype TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  account_id TEXT NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  category_id TEXT,
  contact_id TEXT,
  project_id TEXT,
  building_id TEXT,
  property_id TEXT,
  unit_id TEXT,
  invoice_id TEXT,
  bill_id TEXT,
  payslip_id TEXT,
  contract_id TEXT,
  agreement_id TEXT,
  batch_id TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_project_date ON transactions(project_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(subtype);
CREATE INDEX IF NOT EXISTS idx_tx_invoice ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tx_bill ON transactions(bill_id);
`;

targetDb.exec(SCHEMA_SQL);

// Check if transactions table exists in source
let sourceHasTransactions = false;
try {
  const result = sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'").get();
  sourceHasTransactions = !!result;
} catch (e) {
  console.warn('⚠️ Could not check source database schema:', e.message);
}

if (!sourceHasTransactions) {
  console.warn('⚠️ Source database does not have transactions table. Skipping migration.');
  sourceDb.close();
  targetDb.close();
  process.exit(0);
}

// Get transaction count from source
const sourceCount = sourceDb.prepare('SELECT COUNT(*) as count FROM transactions').get();
console.log(`📊 Found ${sourceCount.count} transactions in source database`);

// Get transaction count from target (before migration)
const targetCountBefore = targetDb.prepare('SELECT COUNT(*) as count FROM transactions').get();
console.log(`📊 Target database currently has ${targetCountBefore.count} transactions`);

if (sourceCount.count === 0) {
  console.log('✅ No transactions to migrate.');
  sourceDb.close();
  targetDb.close();
  process.exit(0);
}

// Prepare statements
const selectStmt = sourceDb.prepare(`
  SELECT 
    id, type, subtype, amount, date, description,
    account_id, from_account_id, to_account_id,
    category_id, contact_id, project_id, building_id, property_id, unit_id,
    invoice_id, bill_id, payslip_id, contract_id, agreement_id, batch_id,
    is_system, created_at, updated_at
  FROM transactions
`);

const insertStmt = targetDb.prepare(`
  INSERT OR REPLACE INTO transactions (
    id, type, subtype, amount, date, description,
    account_id, from_account_id, to_account_id,
    category_id, contact_id, project_id, building_id, property_id, unit_id,
    invoice_id, bill_id, payslip_id, contract_id, agreement_id, batch_id,
    is_system, created_at, updated_at
  ) VALUES (
    @id, @type, @subtype, @amount, @date, @description,
    @account_id, @from_account_id, @to_account_id,
    @category_id, @contact_id, @project_id, @building_id, @property_id, @unit_id,
    @invoice_id, @bill_id, @payslip_id, @contract_id, @agreement_id, @batch_id,
    @is_system, @created_at, @updated_at
  )
`);

// Migrate in batches
const BATCH_SIZE = 1000;
let migrated = 0;
let errors = 0;

const transaction = targetDb.transaction((batch) => {
  for (const row of batch) {
    try {
      insertStmt.run({
        id: row.id,
        type: row.type,
        subtype: row.subtype || null,
        amount: row.amount,
        date: row.date,
        description: row.description || null,
        account_id: row.account_id || '',
        from_account_id: row.from_account_id || null,
        to_account_id: row.to_account_id || null,
        category_id: row.category_id || null,
        contact_id: row.contact_id || null,
        project_id: row.project_id || null,
        building_id: row.building_id || null,
        property_id: row.property_id || null,
        unit_id: row.unit_id || null,
        invoice_id: row.invoice_id || null,
        bill_id: row.bill_id || null,
        payslip_id: row.payslip_id || null,
        contract_id: row.contract_id || null,
        agreement_id: row.agreement_id || null,
        batch_id: row.batch_id || null,
        is_system: row.is_system || 0,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
      });
      migrated++;
    } catch (err) {
      console.error(`❌ Error migrating transaction ${row.id}:`, err.message);
      errors++;
    }
  }
});

// Process in batches
const allRows = selectStmt.all();
for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
  const batch = allRows.slice(i, i + BATCH_SIZE);
  transaction(batch);
  console.log(`   Migrated ${Math.min(i + BATCH_SIZE, allRows.length)}/${allRows.length} transactions...`);
}

// Verify migration
const targetCountAfter = targetDb.prepare('SELECT COUNT(*) as count FROM transactions').get();
console.log(`\n✅ Migration complete!`);
console.log(`   Migrated: ${migrated} transactions`);
console.log(`   Errors: ${errors}`);
console.log(`   Target database now has: ${targetCountAfter.count} transactions`);

if (migrated !== sourceCount.count) {
  console.warn(`⚠️  Migration count mismatch. Expected ${sourceCount.count}, migrated ${migrated}`);
}

// Close databases
sourceDb.close();
targetDb.close();

console.log('\n🎉 Data migration complete! The native backend is now ready to use.');
console.log('   You can now enable the native backend in the app.');


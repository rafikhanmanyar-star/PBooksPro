const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

// Basic on-disk SQLite using better-sqlite3.
// This is scaffolding for a future renderer migration (IPC-backed data access).

const dbPath = path.join(app.getPath('userData'), 'native_finance_db.sqlite');

// Open database
const db = new Database(dbPath);

// Enable WAL for better write performance
db.pragma('journal_mode = WAL');

// Full transaction schema matching sql.js schema
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

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

--// Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tx_project_date ON transactions(project_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_subtype ON transactions(subtype);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_invoice ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tx_bill ON transactions(bill_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON categories(type);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
`;

db.exec(SCHEMA_SQL);

const statements = {
  listTransactions: db.prepare(`
    SELECT *
    FROM transactions
    WHERE (@projectId IS NULL OR project_id = @projectId)
    ORDER BY date DESC, created_at DESC
    LIMIT @limit OFFSET @offset
  `),
  countTransactions: db.prepare(`
    SELECT COUNT(*) as count
    FROM transactions
    WHERE (@projectId IS NULL OR project_id = @projectId)
  `),
  totals: db.prepare(`
    SELECT
      SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END) AS totalIncome,
      SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END) AS totalExpense
    FROM transactions
    WHERE (@projectId IS NULL OR project_id = @projectId)
  `),
  upsertTransaction: db.prepare(`
    INSERT INTO transactions (
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
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type,
      subtype=excluded.subtype,
      amount=excluded.amount,
      date=excluded.date,
      description=excluded.description,
      account_id=excluded.account_id,
      from_account_id=excluded.from_account_id,
      to_account_id=excluded.to_account_id,
      category_id=excluded.category_id,
      contact_id=excluded.contact_id,
      project_id=excluded.project_id,
      building_id=excluded.building_id,
      property_id=excluded.property_id,
      unit_id=excluded.unit_id,
      invoice_id=excluded.invoice_id,
      bill_id=excluded.bill_id,
      payslip_id=excluded.payslip_id,
      contract_id=excluded.contract_id,
      agreement_id=excluded.agreement_id,
      batch_id=excluded.batch_id,
      is_system=excluded.is_system,
      updated_at=datetime('now')
  `),
};

// Bulk upsert using a single transaction for maximum performance
const bulkUpsert = db.transaction((transactions) => {
  const now = new Date().toISOString();
  for (const tx of transactions) {
    statements.upsertTransaction.run({
      id: tx.id,
      type: tx.type,
      subtype: tx.subtype || null,
      amount: tx.amount,
      date: tx.date,
      description: tx.description || null,
      account_id: tx.account_id || '',
      from_account_id: tx.from_account_id || null,
      to_account_id: tx.to_account_id || null,
      category_id: tx.category_id || null,
      contact_id: tx.contact_id || null,
      project_id: tx.project_id || null,
      building_id: tx.building_id || null,
      property_id: tx.property_id || null,
      unit_id: tx.unit_id || null,
      invoice_id: tx.invoice_id || null,
      bill_id: tx.bill_id || null,
      payslip_id: tx.payslip_id || null,
      contract_id: tx.contract_id || null,
      agreement_id: tx.agreement_id || null,
      batch_id: tx.batch_id || null,
      is_system: tx.is_system || 0,
      created_at: tx.created_at || now,
      updated_at: now,
    });
  }
});
module.exports = {
  dbPath,
  db,
  listTransactions(args = {}) {
    const { projectId = null, limit = 200, offset = 0 } = args;
    return statements.listTransactions.all({ projectId, limit, offset });
  },
  getTotals(args = {}) {
    const { projectId = null } = args;
    return statements.totals.get({ projectId });
  },
  countTransactions(args = {}) {
    const { projectId = null } = args;
    return statements.countTransactions.get({ projectId });
  },
  bulkUpsertTransactions(transactions) {
    return bulkUpsert(transactions);
  },
  upsertTransaction(tx) {
    const now = new Date().toISOString();
    statements.upsertTransaction.run({
      id: tx.id,
      type: tx.type,
      subtype: tx.subtype || null,
      amount: tx.amount,
      date: tx.date,
      description: tx.description || null,
      account_id: tx.account_id || '',
      from_account_id: tx.from_account_id || null,
      to_account_id: tx.to_account_id || null,
      category_id: tx.category_id || null,
      contact_id: tx.contact_id || null,
      project_id: tx.project_id || null,
      building_id: tx.building_id || null,
      property_id: tx.property_id || null,
      unit_id: tx.unit_id || null,
      invoice_id: tx.invoice_id || null,
      bill_id: tx.bill_id || null,
      payslip_id: tx.payslip_id || null,
      contract_id: tx.contract_id || null,
      agreement_id: tx.agreement_id || null,
      batch_id: tx.batch_id || null,
      is_system: tx.is_system || 0,
      created_at: tx.created_at || now,
      updated_at: now,
    });
  },
};


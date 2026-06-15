#!/usr/bin/env node
/**
 * Deduplicate PBooksPro local SQLite database
 *
 * After cloud migration, the same logical record can appear twice (different ids,
 * same business key). This script finds rows that duplicate a UNIQUE key,
 * keeps one row per key (newest by updated_at, then lowest id), updates any
 * foreign keys that pointed to the removed ids to point to the kept id, then
 * deletes the duplicate rows.
 *
 * Uses sql.js (pure JS) so it works with any Node.js version — no native modules.
 *
 * IMPORTANT: Close the PBooks Pro app before running (so the DB is not locked).
 *
 * Usage:
 *   node scripts/dedupe-local-db.cjs
 *   node scripts/dedupe-local-db.cjs /path/to/PBooksPro.db
 *   node scripts/dedupe-local-db.cjs --dry-run    # report only, no changes
 *
 * Or: npm run dedupe-local-db
 *     npm run dedupe-local-db -- --dry-run
 */

'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

function getDefaultDbPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'pbooks-pro', 'pbookspro', 'PBooksPro.db');
}

const DRY_RUN = process.argv.includes('--dry-run');
const dbPathArg = process.argv.find((a) => !a.startsWith('-') && a.endsWith('.db'));
const dbPath = dbPathArg ? path.resolve(dbPathArg) : getDefaultDbPath();

if (!fs.existsSync(dbPath)) {
  console.error('Database not found:', dbPath);
  process.exit(1);
}

// Tables with UNIQUE key(s) and tables that reference this table's id.
const DEDUPE_CONFIG = [
  { table: 'users', uniqueCols: ['tenant_id', 'username'], referrers: [] },
  { table: 'invoices', uniqueCols: ['tenant_id', 'invoice_number'], referrers: [{ table: 'transactions', column: 'invoice_id' }] },
  { table: 'bills', uniqueCols: ['tenant_id', 'bill_number'], referrers: [{ table: 'transactions', column: 'bill_id' }, { table: 'pm_cycle_allocations', column: 'bill_id' }, { table: 'sales_returns', column: 'refund_bill_id' }] },
  { table: 'budgets', uniqueCols: ['category_id', 'project_id'], referrers: [] },
  { table: 'rental_agreements', uniqueCols: ['tenant_id', 'agreement_number'], referrers: [{ table: 'invoices', column: 'agreement_id' }] },
  { table: 'project_agreements', uniqueCols: ['tenant_id', 'agreement_number'], referrers: [{ table: 'project_agreement_units', column: 'agreement_id' }, { table: 'sales_returns', column: 'agreement_id' }, { table: 'invoices', column: 'agreement_id' }, { table: 'transactions', column: 'agreement_id' }, { table: 'bills', column: 'project_agreement_id' }] },
  { table: 'sales_returns', uniqueCols: ['tenant_id', 'return_number'], referrers: [] },
  { table: 'contracts', uniqueCols: ['tenant_id', 'contract_number'], referrers: [{ table: 'contract_categories', column: 'contract_id' }, { table: 'bills', column: 'contract_id' }, { table: 'transactions', column: 'contract_id' }] },
  { table: 'pm_cycle_allocations', uniqueCols: ['tenant_id', 'project_id', 'cycle_id'], referrers: [] },
  { table: 'purchase_orders', uniqueCols: ['tenant_id', 'po_number'], referrers: [] },
  { table: 'registered_suppliers', uniqueCols: ['buyer_tenant_id', 'supplier_tenant_id'], referrers: [] },
  { table: 'project_agreement_units', uniqueCols: ['agreement_id', 'unit_id'], referrers: [] },
  { table: 'contract_categories', uniqueCols: ['contract_id', 'category_id'], referrers: [] },
  { table: 'payroll_departments', uniqueCols: ['tenant_id', 'name'], referrers: [{ table: 'payroll_employees', column: 'department_id' }, { table: 'payroll_departments', column: 'parent_department_id' }] },
  { table: 'payroll_grades', uniqueCols: ['tenant_id', 'name'], referrers: [] },
  { table: 'payroll_runs', uniqueCols: ['tenant_id', 'month', 'year'], referrers: [{ table: 'payslips', column: 'payroll_run_id' }] },
  { table: 'payslips', uniqueCols: ['payroll_run_id', 'employee_id'], referrers: [{ table: 'transactions', column: 'payslip_id' }] },
  { table: 'payroll_salary_components', uniqueCols: ['tenant_id', 'name', 'type'], referrers: [] },
  { table: 'whatsapp_menu_sessions', uniqueCols: ['tenant_id', 'phone_number'], referrers: [] },
];

function tableExists(db, name) {
  const stmt = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
  stmt.bind([name]);
  const found = stmt.step();
  stmt.free();
  return found;
}

function columnExists(db, table, col) {
  const stmt = db.prepare(`PRAGMA table_info("${table}")`);
  let found = false;
  while (stmt.step()) {
    const row = stmt.getAsObject();
    if (row.name === col) { found = true; break; }
  }
  stmt.free();
  return found;
}

function execSelect(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function findDuplicates(db, table, uniqueCols) {
  const hasUpdatedAt = columnExists(db, table, 'updated_at');
  const orderBy = hasUpdatedAt
    ? 'ORDER BY COALESCE(updated_at,\'\') DESC, id ASC'
    : 'ORDER BY id ASC';
  const partitionBy = uniqueCols.map((c) => `"${c}"`).join(', ');
  const sql = `
    WITH d AS (
      SELECT id,
        ROW_NUMBER() OVER (PARTITION BY ${partitionBy} ${orderBy}) AS rn
      FROM "${table}"
    )
    SELECT id, rn FROM d WHERE rn > 1
  `;
  try {
    return execSelect(db, sql);
  } catch (e) {
    return [];
  }
}

function getKeeperId(db, table, uniqueCols, duplicateId) {
  const selCols = uniqueCols.map((c) => `"${c}"`).join(', ');
  const row = execSelect(db, `SELECT ${selCols} FROM "${table}" WHERE id = ?`, [duplicateId])[0];
  if (!row) return null;
  const keyVals = uniqueCols.map((c) => row[c]);
  const hasUpdatedAt = columnExists(db, table, 'updated_at');
  const orderBy = hasUpdatedAt ? 'ORDER BY COALESCE(updated_at,\'\') DESC, id ASC' : 'ORDER BY id ASC';
  const whereParts = uniqueCols.map((c, i) => {
    const v = keyVals[i];
    return v === null || v === undefined ? `"${c}" IS NULL` : `"${c}" = ?`;
  });
  const params = keyVals.filter((v) => v != null);
  const where = whereParts.join(' AND ');
  const keeperRow = execSelect(db, `SELECT id FROM "${table}" WHERE ${where} ${orderBy} LIMIT 1`, params)[0];
  return keeperRow ? keeperRow.id : null;
}

function runSql(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  stmt.step();
  stmt.free();
}

async function runDedupe() {
  console.log('PBooksPro DB deduplication');
  console.log('Database:', dbPath);
  console.log('Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE');
  console.log('');

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  let totalRemoved = 0;

  for (const { table, uniqueCols, referrers } of DEDUPE_CONFIG) {
    if (!tableExists(db, table)) continue;
    if (!columnExists(db, table, 'id')) continue; // skip composite-PK tables

    const duplicates = findDuplicates(db, table, uniqueCols);
    if (duplicates.length === 0) continue;

    const dupIds = [...new Set(duplicates.map((d) => d.id))];
    const keeperMap = new Map();
    for (const dupId of dupIds) {
      const keeperId = getKeeperId(db, table, uniqueCols, dupId);
      if (keeperId && keeperId !== dupId) keeperMap.set(dupId, keeperId);
    }

    if (keeperMap.size === 0) continue;

    console.log(`[${table}] ${keeperMap.size} duplicate row(s) to remove (keeping one per unique key)`);

    if (!DRY_RUN) {
      runSql(db, 'BEGIN');
      try {
        for (const [dupId, keeperId] of keeperMap) {
          for (const { table: refTable, column } of referrers) {
            if (!tableExists(db, refTable) || !columnExists(db, refTable, column)) continue;
            runSql(db, `UPDATE "${refTable}" SET "${column}" = ? WHERE "${column}" = ?`, [keeperId, dupId]);
          }
          runSql(db, `DELETE FROM "${table}" WHERE id = ?`, [dupId]);
        }
        runSql(db, 'COMMIT');
      } catch (e) {
        runSql(db, 'ROLLBACK');
        throw e;
      }
    }

    totalRemoved += keeperMap.size;
  }

  if (totalRemoved === 0) {
    console.log('No duplicate rows found (by UNIQUE keys).');
  } else {
    console.log('');
    console.log('Total duplicate rows removed:', totalRemoved);
  }

  if (!DRY_RUN && totalRemoved > 0) {
    const r = execSelect(db, 'PRAGMA integrity_check')[0];
    console.log('Integrity check:', r.integrity_check);
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log('Database saved.');
  }

  db.close();
}

runDedupe().catch((err) => {
  console.error(err);
  process.exit(1);
});

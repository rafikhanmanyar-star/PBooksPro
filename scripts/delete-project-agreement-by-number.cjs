#!/usr/bin/env node
/**
 * Delete a project sales agreement by agreement_number (e.g. P-AGR-0095) and all
 * linked installment invoices, transactions, and junction rows. Use when an agreement
 * was saved without a unit and orphaned tree/list data appears.
 *
 * Order (SQLite, PRAGMA foreign_keys = OFF):
 *   1. Transactions linked to those invoices (invoice_id) or agreement_id
 *   2. sales_returns for that agreement (if any — script aborts unless --force-skip-returns)
 *   3. Clear bills.project_agreement_id if set
 *   4. project_received_assets referencing those invoices (delete rows)
 *   5. recurring_invoice_templates.agreement_id cleared
 *   6. invoices for that agreement
 *   7. project_agreement_units (also CASCADE on agreement delete)
 *   8. project_agreements
 *
 * Usage:
 *   Close PBooks Pro first (avoid DB lock).
 *
 *   node scripts/delete-project-agreement-by-number.cjs P-AGR-0095
 *   node scripts/delete-project-agreement-by-number.cjs P-AGR-0095 "C:\\path\\to\\company.db"
 *   node scripts/delete-project-agreement-by-number.cjs P-AGR-0095 --dry-run
 *   PBOOKS_COMPANY_DB=C:\\path\\to\\company.db node scripts/delete-project-agreement-by-number.cjs P-AGR-0095
 *
 * Default DB path: if PBOOKS_COMPANY_DB is unset and no path arg, uses the only *.db
 * in %APPDATA%\\pbooks-pro\\pbookspro\\data\\companies (if exactly one file).
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(
  process.env.APPDATA || path.join(process.env.HOME || '', '.config'),
  'pbooks-pro',
  'pbookspro'
);

function discoverSingleCompanyDb() {
  const companiesDir = path.join(BASE_DIR, 'data', 'companies');
  if (!fs.existsSync(companiesDir)) return null;
  const files = fs.readdirSync(companiesDir).filter((f) => f.endsWith('.db'));
  if (files.length !== 1) return null;
  return path.resolve(companiesDir, files[0]);
}

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== '');
  const dryRun = args.includes('--dry-run');
  const forceSkipReturns = args.includes('--force-skip-returns');
  const positional = args.filter((a) => !a.startsWith('-'));
  const agreementNumber = positional[0];
  const pathArg = positional[1];
  const envPath = process.env.PBOOKS_COMPANY_DB;
  const dbPath =
    pathArg ? path.resolve(pathArg) : envPath ? path.resolve(envPath) : discoverSingleCompanyDb();
  return { agreementNumber, dbPath, dryRun, forceSkipReturns };
}

function tableExists(db, name) {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
  return r.length > 0 && r[0].values.length > 0;
}

function runQuery(db, sql, params = []) {
  if (params.length === 0) {
    db.run(sql);
    return db.getRowsModified();
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  return db.getRowsModified();
}

function runSelect(db, sql, params = []) {
  if (params.length === 0) {
    const result = db.exec(sql);
    if (result.length === 0 || result[0].values.length === 0) return [];
    const { columns, values } = result[0];
    return values.map((row) => {
      const obj = {};
      columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function main() {
  const { agreementNumber, dbPath, dryRun, forceSkipReturns } = parseArgs();

  if (!agreementNumber || agreementNumber.startsWith('-')) {
    console.error('Usage: node scripts/delete-project-agreement-by-number.cjs <AGREEMENT_NUMBER> [path-to-company.db]');
    process.exit(1);
  }

  if (!dbPath || !fs.existsSync(dbPath)) {
    console.error('Database not found. Set PBOOKS_COMPANY_DB or pass the full path to your company .db file.');
    console.error('Tried:', dbPath || '(no default single company DB)');
    process.exit(1);
  }

  console.log('Delete project agreement by number\n');
  console.log('Agreement:', agreementNumber);
  console.log('Database: ', dbPath);
  if (dryRun) console.log('Mode: DRY RUN (no changes)\n');

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  db.run('PRAGMA foreign_keys = OFF');

  try {
    if (!tableExists(db, 'project_agreements')) {
      console.log('No project_agreements table. Nothing to do.');
      db.close();
      return;
    }

    const paRows = runSelect(db, 'SELECT id, agreement_number FROM project_agreements WHERE agreement_number = ? AND (deleted_at IS NULL OR deleted_at = \'\')', [
      agreementNumber,
    ]);
    if (paRows.length === 0) {
      const any = runSelect(db, 'SELECT id, agreement_number FROM project_agreements WHERE agreement_number = ?', [agreementNumber]);
      if (any.length) {
        console.log('Found agreement only soft-deleted rows; use a DB tool or restore from backup if needed.');
      }
      console.log('No project agreement with that number (or it is soft-deleted). Nothing to delete.');
      db.close();
      return;
    }

    const paId = paRows[0].id;

    const invoices = runSelect(db, 'SELECT id FROM invoices WHERE agreement_id = ?', [paId]);
    const invoiceIds = invoices.map((r) => r.id);

    const srReturns = tableExists(db, 'sales_returns')
      ? runSelect(db, 'SELECT id, return_number FROM sales_returns WHERE agreement_id = ? AND (deleted_at IS NULL OR deleted_at = \'\')', [paId])
      : [];

    if (srReturns.length > 0 && !forceSkipReturns) {
      console.error(
        `\nThis agreement has ${srReturns.length} sales return record(s). Delete those in the app first, or re-run with --force-skip-returns (deletes sales_returns rows — use with care).`
      );
      db.close();
      process.exit(1);
    }

    const txByInvoice =
      invoiceIds.length && tableExists(db, 'transactions')
        ? runSelect(
            db,
            `SELECT id FROM transactions WHERE invoice_id IN (${invoiceIds.map(() => '?').join(',')})`,
            invoiceIds
          )
        : [];

    const txByAgreement =
      tableExists(db, 'transactions')
        ? runSelect(db, 'SELECT id FROM transactions WHERE agreement_id = ?', [paId])
        : [];

    const txIds = [...new Set([...txByInvoice.map((t) => t.id), ...txByAgreement.map((t) => t.id)])];

    const billsToClear =
      tableExists(db, 'bills') && runSelect(db, 'SELECT id FROM bills WHERE project_agreement_id = ?', [paId]).length;

    const assets =
      invoiceIds.length && tableExists(db, 'project_received_assets')
        ? runSelect(
            db,
            `SELECT id FROM project_received_assets WHERE invoice_id IN (${invoiceIds.map(() => '?').join(',')})`,
            invoiceIds
          )
        : [];

    const recurring =
      tableExists(db, 'recurring_invoice_templates')
        ? runSelect(db, 'SELECT id FROM recurring_invoice_templates WHERE agreement_id = ?', [paId])
        : [];

    console.log('\nWill delete / update:');
    console.log('  - Project agreement id:', paId);
    console.log('  - Invoices (agreement_id):', invoiceIds.length);
    console.log('  - Transactions (invoice or agreement link):', txIds.length);
    console.log('  - Bills with project_agreement_id (cleared):', billsToClear);
    console.log('  - project_received_assets (by invoice):', assets.length);
    console.log('  - recurring_invoice_templates (cleared):', recurring.length);
    console.log('  - sales_returns:', forceSkipReturns ? srReturns.length : 0);

    if (dryRun) {
      console.log('\n(Dry run – no changes made)');
      db.close();
      return;
    }

    console.log('\nDeleting...');

    if (txIds.length && tableExists(db, 'transactions')) {
      const ph = txIds.map(() => '?').join(',');
      runQuery(db, `DELETE FROM transactions WHERE id IN (${ph})`, txIds);
      console.log('  ✓ Deleted', txIds.length, 'transaction(s)');
    }

    if (forceSkipReturns && srReturns.length && tableExists(db, 'sales_returns')) {
      runQuery(db, 'DELETE FROM sales_returns WHERE agreement_id = ?', [paId]);
      console.log('  ✓ Deleted', srReturns.length, 'sales_return(s)');
    }

    if (billsToClear && tableExists(db, 'bills')) {
      runQuery(db, 'UPDATE bills SET project_agreement_id = NULL WHERE project_agreement_id = ?', [paId]);
      console.log('  ✓ Cleared project_agreement_id on bill(s)');
    }

    if (assets.length && tableExists(db, 'project_received_assets')) {
      const ph = invoiceIds.map(() => '?').join(',');
      runQuery(db, `DELETE FROM project_received_assets WHERE invoice_id IN (${ph})`, invoiceIds);
      console.log('  ✓ Deleted', assets.length, 'project_received_assets row(s)');
    }

    if (recurring.length && tableExists(db, 'recurring_invoice_templates')) {
      runQuery(db, 'UPDATE recurring_invoice_templates SET agreement_id = NULL WHERE agreement_id = ?', [paId]);
      console.log('  ✓ Cleared recurring_invoice_templates');
    }

    if (invoiceIds.length && tableExists(db, 'invoices')) {
      const ph = invoiceIds.map(() => '?').join(',');
      runQuery(db, `DELETE FROM invoices WHERE id IN (${ph})`, invoiceIds);
      console.log('  ✓ Deleted', invoiceIds.length, 'invoice(s)');
    }

    if (tableExists(db, 'project_agreement_units')) {
      runQuery(db, 'DELETE FROM project_agreement_units WHERE agreement_id = ?', [paId]);
      console.log('  ✓ Deleted project_agreement_units rows');
    }

    runQuery(db, 'DELETE FROM project_agreements WHERE id = ?', [paId]);
    console.log('  ✓ Deleted project_agreement');

    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log('\nDone. Restart PBooks Pro and verify the agreement and tree.');
  } finally {
    db.run('PRAGMA foreign_keys = ON');
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

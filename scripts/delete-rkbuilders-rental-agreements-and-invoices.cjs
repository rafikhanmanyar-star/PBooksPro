#!/usr/bin/env node
/**
 * Delete Rental Agreements and Rental Invoices from Rkbuilders Company Database
 *
 * Removes rental agreements, rental invoices, and any transactions (invoice payments)
 * that reference those invoices. Use this when you need to clear rental data to
 * fix issues and re-import from updated Excel files.
 *
 * Order of deletion (to respect dependencies):
 *   1. Transactions where invoice_id points to a rental invoice
 *   2. Recurring invoice templates that reference a rental agreement (set agreement_id to NULL)
 *   3. Invoices that are rental (invoice_type = 'Rental' OR agreement_id in rental_agreements)
 *   4. Rental agreements
 *
 * Usage:
 *   node scripts/delete-rkbuilders-rental-agreements-and-invoices.cjs
 *   node scripts/delete-rkbuilders-rental-agreements-and-invoices.cjs --dry-run
 *   node scripts/delete-rkbuilders-rental-agreements-and-invoices.cjs "C:\path\to\rkbuilders.db"
 *
 * IMPORTANT: Close the PBooks Pro app before running to avoid file locks.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(
  process.env.APPDATA || path.join(process.env.HOME || '', '.config'),
  'pbooks-pro',
  'pbookspro'
);
const DEFAULT_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const pathArg = args.find((a) => !a.startsWith('-'));
  const dbPath = pathArg ? path.resolve(pathArg) : DEFAULT_DB;
  return { dbPath, dryRun };
}

function tableExists(db, name) {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`);
  return r.length > 0 && r[0].values.length > 0;
}

function runQuery(db, sql, params = []) {
  try {
    if (params.length === 0) {
      db.run(sql);
      return db.getRowsModified();
    }
    const stmt = db.prepare(sql);
    stmt.bind(params);
    stmt.step();
    stmt.free();
    return db.getRowsModified();
  } catch (e) {
    throw e;
  }
}

function runSelect(db, sql, params = []) {
  if (params.length === 0) {
    const result = db.exec(sql);
    if (result.length === 0 || result[0].values.length === 0) return [];
    const { columns, values } = result[0];
    return values.map((row) => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
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
  const { dbPath, dryRun } = parseArgs();

  if (!fs.existsSync(dbPath)) {
    console.error('Database not found:', dbPath);
    process.exit(1);
  }

  console.log('Rkbuilders: Delete Rental Agreements & Rental Invoices\n');
  console.log('Database:', dbPath);
  if (dryRun) console.log('Mode: DRY RUN (no changes will be written)\n');

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  db.run('PRAGMA foreign_keys = OFF');

  try {
    if (!tableExists(db, 'rental_agreements')) {
      console.log('No rental_agreements table found. Nothing to do.');
      db.close();
      return;
    }

    const rentalIds = runSelect(db, 'SELECT id FROM rental_agreements');
    const rentalIdList = rentalIds.map((r) => r.id);
    if (rentalIdList.length === 0) {
      console.log('No rental agreements in database. Nothing to do.');
      db.close();
      return;
    }

    const placeholders = rentalIdList.map(() => '?').join(',');
    const rentalInvoices = runSelect(
      db,
      `SELECT id FROM invoices WHERE invoice_type = 'Rental' OR agreement_id IN (${placeholders})`,
      rentalIdList
    );
    const invoiceIdList = rentalInvoices.map((i) => i.id);

    let txCount = 0;
    if (tableExists(db, 'transactions') && invoiceIdList.length > 0) {
      const invPlaceholders = invoiceIdList.map(() => '?').join(',');
      const txRows = runSelect(
        db,
        `SELECT id FROM transactions WHERE invoice_id IN (${invPlaceholders})`,
        invoiceIdList
      );
      txCount = txRows.length;
    }

    let templateCount = 0;
    if (tableExists(db, 'recurring_invoice_templates')) {
      const templateRows = runSelect(
        db,
        `SELECT id FROM recurring_invoice_templates WHERE agreement_id IN (${placeholders})`,
        rentalIdList
      );
      templateCount = templateRows.length;
    }

    console.log('\nWill delete:');
    console.log('  - Rental agreements:', rentalIds.length);
    console.log('  - Rental invoices:  ', rentalInvoices.length);
    console.log('  - Invoice payment transactions:', txCount);
    console.log('  - Recurring templates (agreement_id cleared):', templateCount);

    if (dryRun) {
      console.log('\n(Dry run – no changes made)');
      db.close();
      return;
    }

    console.log('\nDeleting...');

    if (txCount > 0 && tableExists(db, 'transactions')) {
      const invPlaceholders = invoiceIdList.map(() => '?').join(',');
      runQuery(db, `DELETE FROM transactions WHERE invoice_id IN (${invPlaceholders})`, invoiceIdList);
      console.log('  ✓ Deleted', txCount, 'transaction(s) (invoice payments)');
    }

    if (templateCount > 0 && tableExists(db, 'recurring_invoice_templates')) {
      runQuery(db, `UPDATE recurring_invoice_templates SET agreement_id = NULL WHERE agreement_id IN (${placeholders})`, rentalIdList);
      console.log('  ✓ Cleared agreement_id on', templateCount, 'recurring_invoice_templates');
    }

    if (invoiceIdList.length > 0 && tableExists(db, 'invoices')) {
      const invPlaceholders = invoiceIdList.map(() => '?').join(',');
      runQuery(db, `DELETE FROM invoices WHERE id IN (${invPlaceholders})`, invoiceIdList);
      console.log('  ✓ Deleted', invoiceIdList.length, 'rental invoice(s)');
    }

    runQuery(db, `DELETE FROM rental_agreements WHERE id IN (${placeholders})`, rentalIdList);
    console.log('  ✓ Deleted', rentalIdList.length, 'rental agreement(s)');

    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log('\nDone. You can now import updated rental agreements and rental invoices.');
  } finally {
    db.run('PRAGMA foreign_keys = ON');
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

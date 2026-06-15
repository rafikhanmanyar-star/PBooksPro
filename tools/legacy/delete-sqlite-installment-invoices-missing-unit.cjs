#!/usr/bin/env node
/**
 * List or delete local (SQLite) **Installment** invoices that have no unit or a unit id
 * that does not exist in `units` — the same situation that shows them under
 * "General Project Invoice" in Selling > Invoices (Group by Unit).
 *
 * Typical use after duplicating invoices before the form fix: remove the bad rows, then
 * recreate them with Duplicate + correct unit.
 *
 * Usage (close PBooks Pro first to avoid DB lock):
 *
 *   # Dry-run: show candidates (default project name substring: "Water tanker")
 *   node scripts/delete-sqlite-installment-invoices-missing-unit.cjs --dry-run
 *
 *   # Your company file (example paths on Windows):
 *   node scripts/delete-sqlite-installment-invoices-missing-unit.cjs "C:\Users\YOU\AppData\Roaming\pbooks-pro\pbookspro\data\companies\rkbuilders.db" --dry-run
 *
 *   # Narrow by project name substring, amount, or explicit ids (comma-separated)
 *   node scripts/delete-sqlite-installment-invoices-missing-unit.cjs --db "path\to\company.db" --project "Water tanker" --amount 2500 --dry-run
 *   node scripts/delete-sqlite-installment-invoices-missing-unit.cjs --db "path\to\company.db" --ids "id1,id2" --confirm
 *
 *   # Actually delete (requires --confirm)
 *   node scripts/delete-sqlite-installment-invoices-missing-unit.cjs --db "path\to\company.db" --project "Water tanker" --confirm
 *
 * Env: PBOOKS_SQLITE_DB — default path if no --db / positional path
 *
 * PostgreSQL: use the SQL in a comment at the bottom of this file with psql or DBeaver
 * (same filters: project name, installment, missing/invalid unit_id).
 */

'use strict';

const path = require('path');
const fs = require('fs');

const DEFAULT_PROJECT_SUBSTRING = 'Water tanker';

function parseArgs() {
  const args = process.argv.slice(2);
  let dbPath = process.env.PBOOKS_SQLITE_DB || '';
  const flagDry = args.includes('--dry-run');
  const flagConfirm = args.includes('--confirm');
  let projectSub = DEFAULT_PROJECT_SUBSTRING;
  let amount = null;
  let ids = null;
  const loose = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--db' && args[i + 1]) { dbPath = path.resolve(args[++i]); }
    else if (a === '--project' && args[i + 1]) projectSub = args[++i];
    else if (a === '--amount' && args[i + 1]) amount = parseFloat(args[++i]);
    else if (a === '--ids' && args[i + 1]) ids = String(args[++i])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    else if (!a.startsWith('-')) loose.push(a);
  }
  if (!dbPath && loose[0] && !loose[0].startsWith('--')) {
    dbPath = path.resolve(loose[0]);
  }
  if (!dbPath) {
    const appData = process.env.APPDATA || path.join(process.env.HOME || '', 'AppData', 'Roaming');
    const guess = path.join(appData, 'pbooks-pro', 'pbookspro', 'data', 'companies', 'rkbuilders.db');
    dbPath = guess;
  }
  /** List-only unless --confirm; --dry-run always lists (even if --confirm is present). */
  const dryRun = flagDry || !flagConfirm;
  const doDelete = flagConfirm && !flagDry;
  return { dbPath, dryRun, doDelete, projectSub, amount, ids };
}

function tableExists(db, name) {
  const r = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name.replace(/'/g, "''")}'`);
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
      const o = {};
      columns.forEach((c, j) => { o[c] = row[j]; });
      return o;
    });
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function buildCandidateSql() {
  return `
    SELECT
      i.id,
      i.invoice_number,
      i.amount,
      i.unit_id,
      i.project_id,
      i.agreement_id,
      i.issue_date,
      i.invoice_type,
      i.paid_amount,
      i.deleted_at,
      p.name AS project_name
    FROM invoices i
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE (i.deleted_at IS NULL OR i.deleted_at = '')
      AND i.invoice_type = 'Installment'
      AND p.name IS NOT NULL
      AND LOWER(p.name) LIKE LOWER('%' || ? || '%')
      AND (
        i.unit_id IS NULL
        OR TRIM(COALESCE(i.unit_id, '')) = ''
        OR NOT EXISTS (SELECT 1 FROM units u WHERE u.id = i.unit_id)
      )
  `;
}

async function main() {
  const { dbPath, dryRun, doDelete, projectSub, amount, ids } = parseArgs();

  if (!fs.existsSync(dbPath)) {
    console.error('Database not found:', dbPath);
    console.error('Set PBOOKS_SQLITE_DB or pass the full path to your company .db file.');
    process.exit(1);
  }

  console.log('PBooks Pro — remove Installment invoices with missing/invalid unit (SQLite)\n');
  console.log('Database:', dbPath);
  if (!(ids && ids.length)) console.log('Project name contains:', projectSub);
  if (ids && ids.length) console.log('Filter by id(s) only:', ids.join(', '));
  if (amount != null && !Number.isNaN(amount)) console.log('Amount filter:', amount);
  console.log('Mode:', dryRun || !doDelete ? 'DRY RUN (list only, no writes)' : 'DELETE\n');

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  try {
    if (!tableExists(db, 'invoices')) {
      console.error('No invoices table.');
      process.exit(1);
    }

    let rows;
    if (ids && ids.length) {
      const idPh = ids.map(() => '?').join(',');
      const byIdsSql = `
        SELECT
          i.id, i.invoice_number, i.amount, i.unit_id, i.project_id, i.agreement_id,
          i.issue_date, i.invoice_type, i.paid_amount, i.deleted_at, p.name AS project_name
        FROM invoices i
        LEFT JOIN projects p ON p.id = i.project_id
        WHERE (i.deleted_at IS NULL OR i.deleted_at = '')
          AND i.invoice_type = 'Installment'
          AND i.id IN (${idPh})
          AND (
            i.unit_id IS NULL
            OR TRIM(COALESCE(i.unit_id, '')) = ''
            OR NOT EXISTS (SELECT 1 FROM units u WHERE u.id = i.unit_id)
          )`;
      rows = runSelect(db, byIdsSql, ids);
    } else {
      const baseSql = buildCandidateSql();
      rows = runSelect(db, baseSql, [projectSub]);
    }
    if (amount != null && !Number.isNaN(amount)) {
      rows = rows.filter((r) => Math.abs((r.amount || 0) - amount) < 0.01);
    }

    if (rows.length === 0) {
      console.log('No matching invoices. Widen --project, remove --amount/--ids, or check project name in `projects` table.');
      return;
    }

    console.log(`Found ${rows.length} candidate(s):\n`);
    console.table(rows);

    if (dryRun) {
      console.log('\nRe-run with --confirm (and same filters) to delete these rows, after closing the app.');
      return;
    }

    const invoiceIds = rows.map((r) => r.id);
    const ph = invoiceIds.map(() => '?').join(',');

    db.run('PRAGMA foreign_keys = OFF');

    if (tableExists(db, 'transactions') && invoiceIds.length) {
      const tx = runSelect(
        db,
        `SELECT id, amount, date, invoice_id FROM transactions WHERE invoice_id IN (${ph}) AND (deleted_at IS NULL OR deleted_at = '')`,
        invoiceIds
      );
      if (tx.length) {
        console.log('\nThese income/payment rows reference the invoices (will be deleted to avoid orphan links):');
        console.table(tx);
        runQuery(db, `DELETE FROM transactions WHERE invoice_id IN (${ph})`, invoiceIds);
        console.log('Deleted', tx.length, 'transaction(s).');
      }
    }

    runQuery(db, `DELETE FROM invoices WHERE id IN (${ph})`, invoiceIds);
    console.log('Deleted', invoiceIds.length, 'invoice(s).');

    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log('\nWrote', dbPath);
    console.log('Re-open PBooks Pro and re-create the invoices (Duplicate + set Unit) with the new build.');
  } finally {
    db.run('PRAGMA foreign_keys = ON');
    db.close();
  }
}

/**
 * -- PostgreSQL (API / tenant DB): adjust tenant_id and name pattern. Soft-deleted rows use deleted_at.
 *
 * SELECT i.id, i.invoice_number, i.amount, i.unit_id, i.project_id, p.name
 * FROM invoices i
 * JOIN projects p ON p.id = i.project_id AND p.tenant_id = i.tenant_id
 * WHERE i.tenant_id = 'YOUR_TENANT_ID'
 *   AND i.deleted_at IS NULL
 *   AND i.invoice_type = 'Installment'
 *   AND p.name ILIKE '%Water tanker%'
 *   AND (i.unit_id IS NULL OR btrim(i.unit_id::text) = ''
 *        OR NOT EXISTS (SELECT 1 FROM units u WHERE u.tenant_id = i.tenant_id AND u.id = i.unit_id));
 *
 * -- Then delete child transactions and invoices (or use app UI if visible).
 */

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

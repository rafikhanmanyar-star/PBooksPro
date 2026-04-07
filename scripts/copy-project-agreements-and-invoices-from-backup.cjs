#!/usr/bin/env node
/**
 * Copy extra project agreements and project invoices from backup DB to Old DB.
 *
 * Compares:
 *   - project_agreements (by id)
 *   - invoices that reference project_agreements (agreement_id in project_agreements)
 *
 * Copies from SOURCE (backup) into TARGET (Old db) only rows that exist in SOURCE
 * but not in TARGET. Also copies project_agreement_units for the copied agreements.
 *
 * Uses sql.js (no native addon) so it runs on any Node version.
 *
 * Usage:
 *   node scripts/copy-project-agreements-and-invoices-from-backup.cjs
 *   node scripts/copy-project-agreements-and-invoices-from-backup.cjs "F:\AntiGravity projects\excel import and export"
 *   node scripts/copy-project-agreements-and-invoices-from-backup.cjs --backup "path\to\backup.db" --target "path\to\old.db"
 *
 * Default paths (if no args):
 *   BASE_DIR = "F:\AntiGravity projects\excel import and export"
 *   BACKUP_DB = BASE_DIR + "\rkbuilders_auto_20260308_backup_20260310_010839.db"
 *   TARGET_DB = BASE_DIR + "\rkbuilders_Old.db"
 */

const path = require('path');
const fs = require('fs');

const DEFAULT_BASE = 'F:\\AntiGravity projects\\excel import and export';
const BACKUP_FILENAME = 'rkbuilders_auto_20260308_backup_20260310_010839.db';
const TARGET_FILENAME = 'rkbuilders_Old.db';

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const backupIdx = process.argv.indexOf('--backup');
  const targetIdx = process.argv.indexOf('--target');
  const baseDir =
    backupIdx >= 0 && process.argv[backupIdx + 1]
      ? path.dirname(process.argv[backupIdx + 1])
      : targetIdx >= 0 && process.argv[targetIdx + 1]
        ? path.dirname(process.argv[targetIdx + 1])
        : args[0] && !args[0].endsWith('.db')
          ? args[0]
          : DEFAULT_BASE;
  const backupDb =
    backupIdx >= 0 && process.argv[backupIdx + 1]
      ? path.resolve(process.argv[backupIdx + 1])
      : path.join(baseDir, BACKUP_FILENAME);
  const targetDb =
    targetIdx >= 0 && process.argv[targetIdx + 1]
      ? path.resolve(process.argv[targetIdx + 1])
      : path.join(baseDir, TARGET_FILENAME);
  return { baseDir, backupDb, targetDb };
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

function exists(db, sql, params = []) {
  const rows = runSelect(db, sql, params);
  return rows.length > 0;
}

function insertRow(db, table, columns, row) {
  const colList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT OR IGNORE INTO ${table} (${colList}) VALUES (${placeholders})`;
  const stmt = db.prepare(sql);
  const values = columns.map((c) => row[c] != null ? row[c] : null);
  stmt.bind(values);
  stmt.step();
  stmt.free();
}

async function main() {
  const { backupDb, targetDb } = parseArgs();

  console.log('='.repeat(70));
  console.log('  Copy extra project agreements & project invoices: backup → Old db');
  console.log('='.repeat(70));
  console.log('\nBackup (source):', backupDb);
  console.log('Target (dest): ', targetDb);
  console.log('');

  if (!fs.existsSync(backupDb)) {
    console.error('Backup database not found:', backupDb);
    process.exit(1);
  }
  if (!fs.existsSync(targetDb)) {
    console.error('Target database not found:', targetDb);
    process.exit(1);
  }

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({
    locateFile: (file) => {
      const wasmPath = path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
      if (fs.existsSync(wasmPath)) return wasmPath;
      return `https://sql.js.org/dist/${file}`;
    },
  });

  const backupBuf = fs.readFileSync(backupDb);
  const targetBuf = fs.readFileSync(targetDb);
  const backup = new SQL.Database(backupBuf);
  const target = new SQL.Database(targetBuf);

  const report = {
    projectAgreements: { backup: 0, target: 0, extra: [], copied: 0, skipped: 0 },
    projectAgreementUnits: { copied: 0, skipped: 0 },
    projectInvoices: { backup: 0, target: 0, extra: [], copied: 0, skipped: 0 },
  };

  try {
    // --- 1) Project agreements: compare and list extra ---
    const backupAgreementIds = runSelect(
      backup,
      "SELECT id FROM project_agreements WHERE deleted_at IS NULL OR deleted_at = ''"
    ).map((r) => r.id);
    const targetAgreementIds = new Set(
      runSelect(
        target,
        "SELECT id FROM project_agreements WHERE deleted_at IS NULL OR deleted_at = ''"
      ).map((r) => r.id)
    );

    report.projectAgreements.backup = backupAgreementIds.length;
    report.projectAgreements.target = targetAgreementIds.size;
    const extraAgreementIds = backupAgreementIds.filter((id) => !targetAgreementIds.has(id));
    report.projectAgreements.extra = extraAgreementIds;

    console.log('--- Project agreements ---');
    console.log('  In backup:', report.projectAgreements.backup);
    console.log('  In target:', report.projectAgreements.target);
    console.log('  Extra in backup (to copy):', extraAgreementIds.length);
    if (extraAgreementIds.length > 0) {
      console.log('  IDs:', extraAgreementIds.slice(0, 20).join(', ') + (extraAgreementIds.length > 20 ? '...' : ''));
    }

    const paColResult = backup.exec('PRAGMA table_info(project_agreements)');
    const paColumns = paColResult.length && paColResult[0].values.length
      ? paColResult[0].values.map((v) => v[1])
      : [];

    const actuallyCopiedAgreementIds = [];

    for (const id of extraAgreementIds) {
      const rows = runSelect(backup, 'SELECT * FROM project_agreements WHERE id = ?', [id]);
      const row = rows[0];
      if (!row) continue;
      const clientExists = exists(target, 'SELECT 1 FROM contacts WHERE id = ?', [row.client_id]);
      const projectExists = exists(target, 'SELECT 1 FROM projects WHERE id = ?', [row.project_id]);
      if (!clientExists || !projectExists) {
        console.log('  Skip agreement', id, '- missing client_id or project_id in target');
        report.projectAgreements.skipped++;
        continue;
      }
      try {
        insertRow(target, 'project_agreements', paColumns, row);
        report.projectAgreements.copied++;
        actuallyCopiedAgreementIds.push(id);
      } catch (err) {
        console.log('  Skip agreement', id, '-', err.message);
        report.projectAgreements.skipped++;
      }
    }
    console.log('  Copied:', report.projectAgreements.copied, 'Skipped:', report.projectAgreements.skipped);

    // --- 2) Project agreement units for the agreements we actually copied ---
    for (const aid of actuallyCopiedAgreementIds) {
      const units = runSelect(backup, 'SELECT unit_id FROM project_agreement_units WHERE agreement_id = ?', [aid])
        .map((r) => r.unit_id);
      for (const uid of units) {
        const unitExists = exists(target, 'SELECT 1 FROM units WHERE id = ?', [uid]);
        if (!unitExists) {
          report.projectAgreementUnits.skipped++;
          continue;
        }
        try {
          insertRow(target, 'project_agreement_units', ['agreement_id', 'unit_id'], { agreement_id: aid, unit_id: uid });
          report.projectAgreementUnits.copied++;
        } catch (_) {
          report.projectAgreementUnits.skipped++;
        }
      }
    }
    console.log('\n--- Project agreement units ---');
    console.log('  Copied:', report.projectAgreementUnits.copied, 'Skipped:', report.projectAgreementUnits.skipped);

    // --- 3) Project invoices: invoices that reference project_agreements ---
    const backupProjectInvoiceIds = runSelect(
      backup,
      `SELECT i.id FROM invoices i
       INNER JOIN project_agreements pa ON pa.id = i.agreement_id
       WHERE i.agreement_id IS NOT NULL AND (i.deleted_at IS NULL OR i.deleted_at = '')`
    ).map((r) => r.id);
    const targetInvoiceIds = new Set(runSelect(target, 'SELECT id FROM invoices').map((r) => r.id));
    const extraInvoiceIds = backupProjectInvoiceIds.filter((id) => !targetInvoiceIds.has(id));
    const allowedAgreementIds = new Set(runSelect(target, 'SELECT id FROM project_agreements').map((r) => r.id));
    const invoicesToCopy = extraInvoiceIds.filter((invId) => {
      const rows = runSelect(backup, 'SELECT agreement_id FROM invoices WHERE id = ?', [invId]);
      return rows.length > 0 && allowedAgreementIds.has(rows[0].agreement_id);
    });

    report.projectInvoices.backup = backupProjectInvoiceIds.length;
    report.projectInvoices.target = runSelect(target, 'SELECT COUNT(*) as c FROM invoices')[0]?.c ?? 0;
    report.projectInvoices.extra = invoicesToCopy;

    console.log('\n--- Project invoices (invoices linked to project agreements) ---');
    console.log('  In backup (with project agreement):', report.projectInvoices.backup);
    console.log('  In target (total invoices):', report.projectInvoices.target);
    console.log('  Extra in backup (to copy):', invoicesToCopy.length);

    const invColResult = backup.exec('PRAGMA table_info(invoices)');
    const invColumns = invColResult.length && invColResult[0].values.length
      ? invColResult[0].values.map((v) => v[1])
      : [];

    for (const id of invoicesToCopy) {
      const rows = runSelect(backup, 'SELECT * FROM invoices WHERE id = ?', [id]);
      const row = rows[0];
      if (!row) continue;
      if (!exists(target, 'SELECT 1 FROM contacts WHERE id = ?', [row.contact_id])) {
        report.projectInvoices.skipped++;
        continue;
      }
      if (row.category_id && !exists(target, 'SELECT 1 FROM categories WHERE id = ?', [row.category_id])) {
        report.projectInvoices.skipped++;
        continue;
      }
      try {
        insertRow(target, 'invoices', invColumns, row);
        report.projectInvoices.copied++;
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE')) {
          report.projectInvoices.skipped++;
        } else {
          console.log('  Skip invoice', id, '-', err.message);
          report.projectInvoices.skipped++;
        }
      }
    }
    console.log('  Copied:', report.projectInvoices.copied, 'Skipped:', report.projectInvoices.skipped);

    console.log('\n' + '='.repeat(70));
    console.log('Summary:');
    console.log('  Project agreements copied:', report.projectAgreements.copied);
    console.log('  Project agreement units copied:', report.projectAgreementUnits.copied);
    console.log('  Project invoices copied:', report.projectInvoices.copied);
    console.log('='.repeat(70));

    const data = target.export();
    fs.writeFileSync(targetDb, Buffer.from(data));
    console.log('\nTarget database saved.');
  } finally {
    backup.close();
    target.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

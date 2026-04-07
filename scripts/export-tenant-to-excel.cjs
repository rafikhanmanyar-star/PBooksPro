/**
 * Export a single tenant's data from Render PostgreSQL to Excel (.xlsx).
 * Foreign-key IDs are replaced with human-readable names (e.g. contact_id -> contact_name,
 * property_id -> property_name) so the Excel is readable and usable for reference/import prep.
 *
 * Usage:
 *   Set DATABASE_URL (or PG_URL) in environment, then:
 *   node scripts/export-tenant-to-excel.cjs [tenant_id] [output.xlsx]
 *
 * Examples:
 *   $env:DATABASE_URL="postgresql://user:pass@host/db"; node scripts/export-tenant-to-excel.cjs
 *   node scripts/export-tenant-to-excel.cjs tenant_1767873389330_fce675e2
 *   node scripts/export-tenant-to-excel.cjs tenant_1767873389330_fce675e2 ./exports/tenant-data.xlsx
 *
 * Default tenant_id: tenant_1767873389330_fce675e2
 * Default output: ./tenant-export-<tenant_id>-<date>.xlsx
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const XLSX = require('xlsx');

const projectRoot = path.join(__dirname, '..');
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(projectRoot, '.env') });
  dotenv.config({ path: path.join(projectRoot, 'server', '.env') });
} catch (_) {}

const DEFAULT_TENANT = 'tenant_1767873389330_fce675e2';

const DATABASE_URL = (process.env.DATABASE_URL || process.env.PG_URL || '').trim();
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL (or PG_URL) is required.');
  console.error('');
  console.error('Example:');
  console.error('  $env:DATABASE_URL="postgresql://user:pass@host/dbname"; node scripts/export-tenant-to-excel.cjs');
  process.exit(1);
}

// Tables with tenant_id (or tenants by id). Order matches schema/FK for reference.
const TABLES = [
  { table: 'tenants', tenantCol: 'id', isIdCol: true },
  { table: 'users', tenantCol: 'tenant_id' },
  { table: 'accounts', tenantCol: 'tenant_id' },
  { table: 'contacts', tenantCol: 'tenant_id' },
  { table: 'vendors', tenantCol: 'tenant_id' },
  { table: 'categories', tenantCol: 'tenant_id' },
  { table: 'projects', tenantCol: 'tenant_id' },
  { table: 'buildings', tenantCol: 'tenant_id' },
  { table: 'properties', tenantCol: 'tenant_id' },
  { table: 'units', tenantCol: 'tenant_id' },
  { table: 'documents', tenantCol: 'tenant_id' },
  { table: 'plan_amenities', tenantCol: 'tenant_id' },
  { table: 'installment_plans', tenantCol: 'tenant_id' },
  { table: 'budgets', tenantCol: 'tenant_id' },
  { table: 'rental_agreements', tenantCol: 'tenant_id' },
  { table: 'project_agreements', tenantCol: 'tenant_id' },
  { table: 'sales_returns', tenantCol: 'tenant_id' },
  { table: 'contracts', tenantCol: 'tenant_id' },
  { table: 'pm_cycle_allocations', tenantCol: 'tenant_id' },
  { table: 'transactions', tenantCol: 'tenant_id' },
  { table: 'invoices', tenantCol: 'tenant_id' },
  { table: 'bills', tenantCol: 'tenant_id' },
  { table: 'quotations', tenantCol: 'tenant_id' },
  { table: 'recurring_invoice_templates', tenantCol: 'tenant_id' },
  { table: 'purchase_orders', tenantCol: 'tenant_id' },
  { table: 'registered_suppliers', tenantCol: 'tenant_id' },
  { table: 'payroll_departments', tenantCol: 'tenant_id' },
  { table: 'payroll_grades', tenantCol: 'tenant_id' },
  { table: 'payroll_employees', tenantCol: 'tenant_id' },
  { table: 'payroll_runs', tenantCol: 'tenant_id' },
  { table: 'payslips', tenantCol: 'tenant_id' },
  { table: 'payroll_salary_components', tenantCol: 'tenant_id' },
  { table: 'whatsapp_menu_sessions', tenantCol: 'tenant_id' },
];

// Optional cloud-only tables (skip if not present)
const OPTIONAL_TABLES = [
  { table: 'sync_outbox', tenantCol: 'tenant_id' },
  { table: 'sync_metadata', tenantCol: 'tenant_id' },
];

// Junction tables: no tenant_id; scope by parent table
const JUNCTION_TABLES = [
  {
    table: 'project_agreement_units',
    sql: `SELECT pau.* FROM project_agreement_units pau
          INNER JOIN project_agreements pa ON pa.id = pau.agreement_id
          WHERE pa.tenant_id = $1`,
  },
  {
    table: 'contract_categories',
    sql: `SELECT cc.* FROM contract_categories cc
          INNER JOIN contracts c ON c.id = cc.contract_id
          WHERE c.tenant_id = $1`,
  },
];

const MAX_CELL_LENGTH = 32000; // Excel cell limit 32767

/** Per-table: replace these _id columns with _name (or _number) using the given lookup key. */
const ID_TO_NAME_REPLACEMENTS = {
  rental_agreements: [
    { idCol: 'contact_id', nameCol: 'contact_name', lookup: 'contacts' },
    { idCol: 'property_id', nameCol: 'property_name', lookup: 'properties' },
    { idCol: 'broker_id', nameCol: 'broker_name', lookup: 'contacts' },
    { idCol: 'owner_id', nameCol: 'owner_name', lookup: 'contacts' },
  ],
  project_agreements: [
    { idCol: 'client_id', nameCol: 'client_name', lookup: 'contacts' },
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'rebate_broker_id', nameCol: 'rebate_broker_name', lookup: 'contacts' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  properties: [
    { idCol: 'owner_id', nameCol: 'owner_name', lookup: 'contacts' },
    { idCol: 'building_id', nameCol: 'building_name', lookup: 'buildings' },
  ],
  units: [
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'contact_id', nameCol: 'contact_name', lookup: 'contacts' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  invoices: [
    { idCol: 'contact_id', nameCol: 'contact_name', lookup: 'contacts' },
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'building_id', nameCol: 'building_name', lookup: 'buildings' },
    { idCol: 'property_id', nameCol: 'property_name', lookup: 'properties' },
    { idCol: 'unit_id', nameCol: 'unit_name', lookup: 'units' },
    { idCol: 'category_id', nameCol: 'category_name', lookup: 'categories' },
    { idCol: 'agreement_id', nameCol: 'agreement_number', lookup: 'agreement_number' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  bills: [
    { idCol: 'contact_id', nameCol: 'contact_name', lookup: 'contacts' },
    { idCol: 'vendor_id', nameCol: 'vendor_name', lookup: 'vendors' },
    { idCol: 'category_id', nameCol: 'category_name', lookup: 'categories' },
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'building_id', nameCol: 'building_name', lookup: 'buildings' },
    { idCol: 'property_id', nameCol: 'property_name', lookup: 'properties' },
    { idCol: 'project_agreement_id', nameCol: 'project_agreement_number', lookup: 'project_agreement_numbers' },
    { idCol: 'contract_id', nameCol: 'contract_number', lookup: 'contracts' },
    { idCol: 'staff_id', nameCol: 'staff_name', lookup: 'contacts' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  transactions: [
    { idCol: 'account_id', nameCol: 'account_name', lookup: 'accounts' },
    { idCol: 'from_account_id', nameCol: 'from_account_name', lookup: 'accounts' },
    { idCol: 'to_account_id', nameCol: 'to_account_name', lookup: 'accounts' },
    { idCol: 'category_id', nameCol: 'category_name', lookup: 'categories' },
    { idCol: 'contact_id', nameCol: 'contact_name', lookup: 'contacts' },
    { idCol: 'vendor_id', nameCol: 'vendor_name', lookup: 'vendors' },
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'building_id', nameCol: 'building_name', lookup: 'buildings' },
    { idCol: 'property_id', nameCol: 'property_name', lookup: 'properties' },
    { idCol: 'unit_id', nameCol: 'unit_name', lookup: 'units' },
    { idCol: 'invoice_id', nameCol: 'invoice_number', lookup: 'invoice_numbers' },
    { idCol: 'bill_id', nameCol: 'bill_number', lookup: 'bill_numbers' },
    { idCol: 'contract_id', nameCol: 'contract_number', lookup: 'contracts' },
    { idCol: 'agreement_id', nameCol: 'agreement_number', lookup: 'agreement_number' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  contracts: [
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'vendor_id', nameCol: 'vendor_name', lookup: 'vendors' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  recurring_invoice_templates: [
    { idCol: 'contact_id', nameCol: 'contact_name', lookup: 'contacts' },
    { idCol: 'property_id', nameCol: 'property_name', lookup: 'properties' },
    { idCol: 'building_id', nameCol: 'building_name', lookup: 'buildings' },
    { idCol: 'agreement_id', nameCol: 'agreement_number', lookup: 'agreement_number' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  pm_cycle_allocations: [
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'bill_id', nameCol: 'bill_number', lookup: 'bill_numbers' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  sales_returns: [
    { idCol: 'agreement_id', nameCol: 'agreement_number', lookup: 'project_agreement_numbers' },
    { idCol: 'refund_bill_id', nameCol: 'refund_bill_number', lookup: 'bill_numbers' },
  ],
  installment_plans: [
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'lead_id', nameCol: 'lead_name', lookup: 'contacts' },
    { idCol: 'unit_id', nameCol: 'unit_name', lookup: 'units' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  budgets: [
    { idCol: 'category_id', nameCol: 'category_name', lookup: 'categories' },
    { idCol: 'project_id', nameCol: 'project_name', lookup: 'projects' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  quotations: [
    { idCol: 'vendor_id', nameCol: 'vendor_name', lookup: 'vendors' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  accounts: [
    { idCol: 'parent_account_id', nameCol: 'parent_account_name', lookup: 'accounts' },
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  documents: [
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  projects: [
    { idCol: 'user_id', nameCol: 'user_name', lookup: 'users' },
  ],
  categories: [
    { idCol: 'parent_category_id', nameCol: 'parent_category_name', lookup: 'categories' },
  ],
  project_agreement_units: [
    { idCol: 'agreement_id', nameCol: 'agreement_number', lookup: 'project_agreement_numbers' },
    { idCol: 'unit_id', nameCol: 'unit_name', lookup: 'units' },
  ],
  contract_categories: [
    { idCol: 'contract_id', nameCol: 'contract_number', lookup: 'contracts' },
    { idCol: 'category_id', nameCol: 'category_name', lookup: 'categories' },
  ],
};

/** Load id->name (or number) lookups for the tenant. */
async function loadLookups(pg, tenantId) {
  const lookups = {};
  const get = (table, idCol, nameCol) =>
    pg.query(`SELECT id, ${nameCol} FROM "${table}" WHERE tenant_id = $1`, [tenantId])
      .then((r) => {
        const map = {};
        (r.rows || []).forEach((row) => { map[row.id] = row[nameCol] ?? ''; });
        return map;
      });

  const tables = [
    ['contacts', 'name'],
    ['vendors', 'name'],
    ['categories', 'name'],
    ['projects', 'name'],
    ['buildings', 'name'],
    ['properties', 'name'],
    ['units', 'name'],
    ['accounts', 'name'],
  ];
  for (const [table, nameCol] of tables) {
    try {
      lookups[table] = await get(table, 'id', nameCol);
    } catch (e) {
      lookups[table] = {};
    }
  }

  try {
    const [rental, project] = await Promise.all([
      pg.query('SELECT id, agreement_number FROM rental_agreements WHERE tenant_id = $1', [tenantId]),
      pg.query('SELECT id, agreement_number FROM project_agreements WHERE tenant_id = $1', [tenantId]),
    ]);
  lookups.rental_agreement_numbers = {};
  (rental.rows || []).forEach((row) => { lookups.rental_agreement_numbers[row.id] = row.agreement_number ?? ''; });
  lookups.project_agreement_numbers = {};
  (project.rows || []).forEach((row) => { lookups.project_agreement_numbers[row.id] = row.agreement_number ?? ''; });
  lookups.agreement_number = { ...lookups.rental_agreement_numbers, ...lookups.project_agreement_numbers };
  } catch (e) {
    lookups.agreement_number = {};
    lookups.rental_agreement_numbers = {};
    lookups.project_agreement_numbers = {};
  }

  try {
    const [inv, bill] = await Promise.all([
      pg.query('SELECT id, invoice_number FROM invoices WHERE tenant_id = $1', [tenantId]),
      pg.query('SELECT id, bill_number FROM bills WHERE tenant_id = $1', [tenantId]),
    ]);
    lookups.invoice_numbers = {};
    (inv.rows || []).forEach((row) => { lookups.invoice_numbers[row.id] = row.invoice_number ?? ''; });
    lookups.bill_numbers = {};
    (bill.rows || []).forEach((row) => { lookups.bill_numbers[row.id] = row.bill_number ?? ''; });
  } catch (e) {
    lookups.invoice_numbers = {};
    lookups.bill_numbers = {};
  }

  try {
    const r = await pg.query('SELECT id, contract_number FROM contracts WHERE tenant_id = $1', [tenantId]);
    lookups.contracts = {};
    (r.rows || []).forEach((row) => { lookups.contracts[row.id] = row.contract_number ?? ''; });
  } catch (e) {
    lookups.contracts = {};
  }

  try {
    const r = await pg.query('SELECT id, name FROM users WHERE tenant_id = $1', [tenantId]);
    lookups.users = {};
    (r.rows || []).forEach((row) => { lookups.users[row.id] = row.name || row.id || ''; });
  } catch (e) {
    lookups.users = {};
  }

  return lookups;
}

/** Replace _id columns with _name (or _number) using lookups; remove original _id columns. */
function applyIdToNameTransform(tableName, row, lookups) {
  const replacements = ID_TO_NAME_REPLACEMENTS[tableName];
  if (!replacements || !lookups) return row;
  const out = { ...row };
  for (const { idCol, nameCol, lookup } of replacements) {
    const idVal = out[idCol];
    if (idVal === undefined) continue;
    const map = lookups[lookup];
    if (map) out[nameCol] = map[idVal] ?? idVal;
    delete out[idCol];
  }
  return out;
}

/** Convert PG row to JSON-serializable for Excel; truncate long text to avoid Excel limit */
function rowToPlain(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null;
      continue;
    }
    let val;
    if (v instanceof Date) val = v.toISOString();
    else if (Buffer.isBuffer(v)) val = '[BINARY]';
    else if (typeof v === 'object' && v.constructor?.name === 'Object') val = JSON.stringify(v);
    else val = v;
    const str = String(val);
    out[k] = str.length > MAX_CELL_LENGTH ? str.slice(0, MAX_CELL_LENGTH) + '...[truncated]' : str;
  }
  return out;
}

async function tableExists(pg, tableName) {
  const r = await pg.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return (r.rows && r.rows.length > 0);
}

async function main() {
  const tenantId = process.argv[2] || DEFAULT_TENANT;
  let outputPath = process.argv[3];
  if (!outputPath) {
    const date = new Date().toISOString().slice(0, 10);
    const safe = tenantId.replace(/[^a-z0-9_]/gi, '_');
    outputPath = path.join(projectRoot, `tenant-export-${safe}-${date}.xlsx`);
  } else {
    outputPath = path.resolve(process.cwd(), outputPath);
  }

  const outDir = path.dirname(outputPath);
  if (outDir !== '.' && !fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Connecting to PostgreSQL...');
  const pg = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: true } });
  await pg.connect();

  const workbook = XLSX.utils.book_new();
  let sheetCount = 0;
  let skipped = 0;

  console.log('Loading lookups (contacts, properties, etc.)...');
  const lookups = await loadLookups(pg, tenantId);

  try {
    // 1) Tenant-scoped tables
    for (const { table, tenantCol, isIdCol } of TABLES) {
      const exists = await tableExists(pg, table);
      if (!exists) {
        console.log('  Skip (table missing):', table);
        skipped++;
        continue;
      }
      const col = tenantCol;
      const sql = isIdCol
        ? `SELECT * FROM "${table}" WHERE "${col}" = $1`
        : `SELECT * FROM "${table}" WHERE "${col}" = $1`;
      const res = await pg.query(sql, [tenantId]);
      const rows = (res.rows || []).map((row) => {
        const transformed = applyIdToNameTransform(table, row, lookups);
        return rowToPlain(transformed);
      });
      const sheetName = table.length > 31 ? table.slice(0, 31) : table; // Excel sheet name length limit
      const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no rows)']]);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      console.log('  Exported:', table, '(' + rows.length + ' rows)');
      sheetCount++;
    }

    // 2) Optional tables
    for (const { table, tenantCol } of OPTIONAL_TABLES) {
      const exists = await tableExists(pg, table);
      if (!exists) {
        skipped++;
        continue;
      }
      const sql = `SELECT * FROM "${table}" WHERE "${tenantCol}" = $1`;
      const res = await pg.query(sql, [tenantId]);
      const rows = (res.rows || []).map(rowToPlain);
      const sheetName = table.length > 31 ? table.slice(0, 31) : table;
      const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no rows)']]);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      console.log('  Exported:', table, '(' + rows.length + ' rows)');
      sheetCount++;
    }

    // 3) Junction tables
    for (const { table, sql } of JUNCTION_TABLES) {
      const exists = await tableExists(pg, table);
      if (!exists) {
        console.log('  Skip (table missing):', table);
        skipped++;
        continue;
      }
      const res = await pg.query(sql, [tenantId]);
      const rows = (res.rows || []).map((row) => {
        const transformed = applyIdToNameTransform(table, row, lookups);
        return rowToPlain(transformed);
      });
      const sheetName = table.length > 31 ? table.slice(0, 31) : table;
      const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no rows)']]);
      XLSX.utils.book_append_sheet(workbook, ws, sheetName);
      console.log('  Exported:', table, '(' + rows.length + ' rows)');
      sheetCount++;
    }

    // rental_agreements: if PG has org_id, re-export with tenant_id OR org_id and normalize (one sheet)
    const hasRentalOrgId = await pg.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rental_agreements' AND column_name = 'org_id' LIMIT 1`
    ).then((r) => r.rows.length > 0);
    if (hasRentalOrgId && workbook.SheetNames.includes('rental_agreements')) {
      const res = await pg.query(
        `SELECT * FROM rental_agreements WHERE tenant_id = $1 OR org_id = $1`,
        [tenantId]
      );
      const rows = (res.rows || []).map((row) => {
        let r = row;
        if (r.tenant_id == null || r.tenant_id === '') r = { ...r, tenant_id: r.org_id };
        if (r.org_id !== undefined) { r = { ...r }; delete r.org_id; }
        r = applyIdToNameTransform('rental_agreements', r, lookups);
        return rowToPlain(r);
      });
      const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([['(no rows)']]);
      workbook.Sheets['rental_agreements'] = ws;
      console.log('  Updated rental_agreements (with org_id fallback):', rows.length, 'rows');
    }

    XLSX.writeFile(workbook, outputPath);
    console.log('');
    console.log('Done. Sheets:', sheetCount, '| Skipped:', skipped);
    console.log('Output:', outputPath);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

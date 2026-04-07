#!/usr/bin/env node
/**
 * Export pbookspro.db to Excel format for bulk import
 * 
 * Exports all data from pbookspro.db to Excel format that matches
 * the app's bulk import feature requirements.
 * 
 * Usage: node scripts/export-pbookspro-to-excel.cjs [output-file.xlsx]
 */

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const SOURCE_DB = fs.existsSync(path.resolve(BASE_DIR, 'PBooksPro.db')) 
  ? path.resolve(BASE_DIR, 'PBooksPro.db')
  : path.resolve(BASE_DIR, 'pbookspro.db');

const OUTPUT_FILE = process.argv[2] || path.resolve(BASE_DIR, 'pbookspro-export.xlsx');

async function main() {
  console.log('='.repeat(70));
  console.log('  Export pbookspro.db to Excel for Bulk Import');
  console.log('='.repeat(70));
  console.log(`\nSource DB: ${SOURCE_DB}`);
  console.log(`Output File: ${OUTPUT_FILE}\n`);

  if (!fs.existsSync(SOURCE_DB)) {
    console.error(`❌ Source database not found: ${SOURCE_DB}`);
    process.exit(1);
  }

  // Use sql.js for compatibility
  const initSqlJs = require('sql.js');
  const fileBuffer = fs.readFileSync(SOURCE_DB);
  
  console.log('📦 Loading SQLite database...');
  const SQL = await initSqlJs({
    locateFile: (file) => {
      const wasmPath = path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
      if (fs.existsSync(wasmPath)) {
        return wasmPath;
      }
      return `https://sql.js.org/dist/${file}`;
    }
  });
  
  const db = new SQL.Database(fileBuffer);
  console.log('✅ Database loaded\n');

  const workbook = XLSX.utils.book_new();
  let totalRows = 0;

  // Helper function to query and convert to Excel format
  function queryToSheet(query, headers, sheetName) {
    try {
      const result = db.exec(query);
      if (result.length === 0 || result[0].values.length === 0) {
        console.log(`   ⚠️  ${sheetName}: No data found`);
        return;
      }

      const rows = result[0].values.map(row => {
        const obj = {};
        headers.forEach((header, idx) => {
          obj[header] = row[idx] !== null && row[idx] !== undefined ? row[idx] : '';
        });
        return obj;
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      console.log(`   ✅ ${sheetName}: ${rows.length} rows`);
      totalRows += rows.length;
    } catch (error) {
      console.log(`   ⚠️  ${sheetName}: Error - ${error.message}`);
    }
  }

  console.log('📊 Exporting data...\n');

  // 1. Accounts
  queryToSheet(
    `SELECT name, type, balance, 
     CASE WHEN is_permanent = 1 THEN 'true' ELSE 'false' END as isPermanent,
     description, parent_account_id as parentAccountId
     FROM accounts WHERE tenant_id = 'local' OR tenant_id IS NULL OR tenant_id = ''`,
    ['name', 'type', 'balance', 'isPermanent', 'description', 'parentAccountId'],
    'Accounts'
  );

  // 2. Contacts
  queryToSheet(
    `SELECT name, type, description, contact_no as contactNo, 
     company_name as companyName, address
     FROM contacts WHERE tenant_id = 'local' OR tenant_id IS NULL OR tenant_id = ''`,
    ['name', 'type', 'description', 'contactNo', 'companyName', 'address'],
    'Contacts'
  );

  // 3. Categories (description column may not exist in older schemas)
  try {
    const catResult = db.exec(`PRAGMA table_info(categories)`);
    const hasDescription = catResult.length > 0 && catResult[0].values.some(col => col[1] === 'description');
    
    const catQuery = hasDescription 
      ? `SELECT name, type, description, parent_category_id as parentCategoryId,
         CASE WHEN is_permanent = 1 THEN 'true' ELSE 'false' END as isPermanent,
         CASE WHEN is_rental = 1 THEN 'true' ELSE 'false' END as isRental
         FROM categories WHERE tenant_id = 'local' OR tenant_id IS NULL OR tenant_id = ''`
      : `SELECT name, type, '' as description, parent_category_id as parentCategoryId,
         CASE WHEN is_permanent = 1 THEN 'true' ELSE 'false' END as isPermanent,
         CASE WHEN is_rental = 1 THEN 'true' ELSE 'false' END as isRental
         FROM categories WHERE tenant_id = 'local' OR tenant_id IS NULL OR tenant_id = ''`;
    
    queryToSheet(catQuery, ['name', 'type', 'description', 'parentCategoryId', 'isPermanent', 'isRental'], 'Categories');
  } catch (e) {
    console.log(`   ⚠️  Categories: Error - ${e.message}`);
  }

  // 4. Projects
  queryToSheet(
    `SELECT name, description, color, status
     FROM projects WHERE tenant_id = 'local' OR tenant_id IS NULL OR tenant_id = ''`,
    ['name', 'description', 'color', 'status'],
    'Projects'
  );

  // 5. Buildings
  queryToSheet(
    `SELECT name, description, color
     FROM buildings WHERE tenant_id = 'local' OR tenant_id IS NULL OR tenant_id = ''`,
    ['name', 'description', 'color'],
    'Buildings'
  );

  // 6. Properties (need to join with contacts and buildings for names)
  queryToSheet(
    `SELECT p.name, 
     COALESCE(c.name, p.owner_id) as ownerName,
     COALESCE(b.name, p.building_id) as buildingName,
     p.description,
     p.monthly_service_charge as monthlyServiceCharge
     FROM properties p
     LEFT JOIN contacts c ON p.owner_id = c.id
     LEFT JOIN buildings b ON p.building_id = b.id
     WHERE p.tenant_id = 'local' OR p.tenant_id IS NULL OR p.tenant_id = ''`,
    ['name', 'ownerName', 'buildingName', 'description', 'monthlyServiceCharge'],
    'Properties'
  );

  // 7. Units (need to join with projects and contacts)
  try {
    const unitResult = db.exec(`PRAGMA table_info(units)`);
    const hasOwnerId = unitResult.length > 0 && unitResult[0].values.some(col => col[1] === 'owner_id');
    const hasContactId = unitResult.length > 0 && unitResult[0].values.some(col => col[1] === 'contact_id');
    
    const ownerCol = hasContactId ? 'u.contact_id' : (hasOwnerId ? 'u.owner_id' : 'NULL');
    
    queryToSheet(
      `SELECT u.name,
       COALESCE(p.name, u.project_id) as projectName,
       COALESCE(c.name, ${ownerCol}) as ownerName,
       u.sale_price as salePrice,
       COALESCE(u.description, '') as description
       FROM units u
       LEFT JOIN projects p ON u.project_id = p.id
       LEFT JOIN contacts c ON ${ownerCol} = c.id
       WHERE u.tenant_id = 'local' OR u.tenant_id IS NULL OR u.tenant_id = ''`,
      ['name', 'projectName', 'ownerName', 'salePrice', 'description'],
      'Units'
    );
  } catch (e) {
    console.log(`   ⚠️  Units: Error - ${e.message}`);
  }

  // 8. Rental Agreements
  queryToSheet(
    `SELECT ra.agreement_number as agreementNumber,
     COALESCE(c.name, ra.tenant_id) as tenantName,
     COALESCE(prop.name, ra.property_id) as propertyName,
     ra.start_date as startDate,
     ra.end_date as endDate,
     ra.monthly_rent as monthlyRent,
     ra.rent_due_date as rentDueDate
     FROM rental_agreements ra
     LEFT JOIN contacts c ON ra.tenant_id = c.id
     LEFT JOIN properties prop ON ra.property_id = prop.id
     WHERE ra.tenant_id = 'local' OR ra.tenant_id IS NULL OR ra.tenant_id = ''`,
    ['agreementNumber', 'tenantName', 'propertyName', 'startDate', 'endDate', 'monthlyRent', 'rentDueDate'],
    'RentalAgreements'
  );

  // 9. Project Agreements (ProjectSellingAgreements)
  queryToSheet(
    `SELECT pa.agreement_number as agreementNumber,
     COALESCE(c.name, pa.client_id) as clientName,
     COALESCE(p.name, pa.project_id) as projectName,
     pa.selling_price as sellingPrice,
     pa.issue_date as issueDate
     FROM project_agreements pa
     LEFT JOIN contacts c ON pa.client_id = c.id
     LEFT JOIN projects p ON pa.project_id = p.id
     WHERE pa.tenant_id = 'local' OR pa.tenant_id IS NULL OR pa.tenant_id = ''`,
    ['agreementNumber', 'clientName', 'projectName', 'sellingPrice', 'issueDate'],
    'ProjectSellingAgreements'
  );

  // 10. Invoices
  queryToSheet(
    `SELECT i.invoice_number as invoiceNumber,
     COALESCE(c.name, i.contact_id) as contactName,
     i.amount,
     i.issue_date as issueDate,
     i.due_date as dueDate,
     i.invoice_type as invoiceType
     FROM invoices i
     LEFT JOIN contacts c ON i.contact_id = c.id
     WHERE i.tenant_id = 'local' OR i.tenant_id IS NULL OR i.tenant_id = ''`,
    ['invoiceNumber', 'contactName', 'amount', 'issueDate', 'dueDate', 'invoiceType'],
    'RentalInvoices'
  );

  // 11. Bills
  queryToSheet(
    `SELECT b.bill_number as billNumber,
     COALESCE(c.name, b.contact_id) as contactName,
     b.amount,
     b.issue_date as issueDate,
     b.due_date as dueDate,
     b.description
     FROM bills b
     LEFT JOIN contacts c ON b.contact_id = c.id
     WHERE b.tenant_id = 'local' OR b.tenant_id IS NULL OR b.tenant_id = ''`,
    ['billNumber', 'contactName', 'amount', 'issueDate', 'dueDate', 'description'],
    'Bills'
  );

  // 12. Transactions
  queryToSheet(
    `SELECT t.type,
     t.amount,
     t.date,
     t.description,
     COALESCE(a.name, t.account_id) as accountName,
     t.invoice_id as invoiceNumber,
     t.bill_id as billNumber
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.tenant_id = 'local' OR t.tenant_id IS NULL OR t.tenant_id = ''`,
    ['type', 'amount', 'date', 'description', 'accountName', 'invoiceNumber', 'billNumber'],
    'Transactions'
  );

  // 13. Vendors
  queryToSheet(
    `SELECT name, contact_no as contactNo, company_name as companyName, address, description
     FROM vendors WHERE tenant_id = 'local' OR tenant_id IS NULL OR tenant_id = ''`,
    ['name', 'contactNo', 'companyName', 'address', 'description'],
    'Vendors'
  );

  // 14. Loan Transactions (filter for loan types)
  queryToSheet(
    `SELECT t.subtype,
     t.amount,
     t.date,
     t.description,
     COALESCE(a.name, t.account_id) as bankAccountName,
     COALESCE(c.name, t.contact_id) as contactName
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN contacts c ON t.contact_id = c.id
     WHERE (t.type = 'Loan' OR t.subtype IN ('Give', 'Receive', 'Repay', 'Collect'))
     AND (t.tenant_id = 'local' OR t.tenant_id IS NULL OR t.tenant_id = '')`,
    ['subtype', 'amount', 'date', 'description', 'bankAccountName', 'contactName'],
    'LoanTransactions'
  );

  console.log(`\n✅ Export complete! Total rows: ${totalRows}`);
  console.log(`\n📁 Writing to: ${OUTPUT_FILE}`);

  // Write the workbook
  XLSX.writeFile(workbook, OUTPUT_FILE);
  
  console.log(`\n✅ Excel file created successfully!`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Open the app and go to Settings > Import/Export`);
  console.log(`   2. Click "Bulk Import"`);
  console.log(`   3. Select the file: ${OUTPUT_FILE}`);
  console.log(`   4. Review the import mapping and proceed`);
  console.log(`\n⚠️  Note: Make sure to import in this order:`);
  console.log(`   1. Accounts`);
  console.log(`   2. Contacts`);
  console.log(`   3. Categories, Projects, Buildings`);
  console.log(`   4. Properties, Units`);
  console.log(`   5. Rental Agreements, Project Agreements`);
  console.log(`   6. Invoices, Bills, Transactions`);
  console.log(`\n   The app will guide you through the import process.`);

  db.close();
}

main().catch(error => {
  console.error('❌ Export failed:', error);
  process.exit(1);
});

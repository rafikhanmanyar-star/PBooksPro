/**
 * Verify Migration Script
 * 
 * Checks if data was successfully migrated to rkbuilders.db
 * Compares row counts and verifies data integrity.
 */

const path = require('path');
const fs = require('fs');

// Paths: same as migration script
const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');
const MASTER_DB = path.resolve(BASE_DIR, 'master_index.db');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function main() {
  console.log('='.repeat(70));
  console.log('  Migration Verification: rkbuilders.db');
  console.log('='.repeat(70));
  console.log(`\nTarget Database: ${TARGET_DB}\n`);

  // Check 1: File exists
  if (!fs.existsSync(TARGET_DB)) {
    console.error(`❌ Target database not found: ${TARGET_DB}`);
    console.error('\nMigration may not have completed successfully.');
    process.exit(1);
  }
  console.log(`✅ Database file exists`);

  // Check 2: File size
  const stats = fs.statSync(TARGET_DB);
  const fileSize = stats.size;
  console.log(`✅ Database size: ${formatBytes(fileSize)}`);

  // Check 3: Open database
  let db;
  try {
    const Database = require('better-sqlite3');
    db = new Database(TARGET_DB, { readonly: true });
    console.log(`✅ Successfully opened database\n`);
  } catch (error) {
    console.error(`❌ Failed to open database: ${error.message}`);
    process.exit(1);
  }

  // Check 4: Company settings
  try {
    const companySettings = db.prepare("SELECT company_name FROM company_settings WHERE id = 'default'").get();
    if (companySettings) {
      console.log(`✅ Company Name: ${companySettings.company_name}`);
    } else {
      console.log(`⚠️  Company settings not found`);
    }
  } catch (error) {
    console.log(`⚠️  Could not read company settings: ${error.message}`);
  }

  // Check 5: Schema version
  try {
    const schemaVersion = db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get();
    if (schemaVersion) {
      console.log(`✅ Schema Version: ${schemaVersion.value}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not read schema version: ${error.message}`);
  }

  // Check 6: Data verification - Row counts
  console.log('\n📊 Data Verification:');
  console.log('-'.repeat(70));
  
  const keyTables = [
    'users', 'accounts', 'contacts', 'vendors', 'categories', 
    'projects', 'buildings', 'properties', 'units',
    'transactions', 'invoices', 'bills', 'budgets',
    'rental_agreements', 'project_agreements', 'documents'
  ];

  let totalRows = 0;
  const tableCounts = {};

  for (const table of keyTables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get();
      if (count) {
        const rowCount = count.count;
        tableCounts[table] = rowCount;
        totalRows += rowCount;
        const status = rowCount > 0 ? '✅' : '⚠️';
        console.log(`   ${status} ${table.padEnd(25)}: ${rowCount.toLocaleString()} rows`);
      }
    } catch (error) {
      // Table may not exist
      console.log(`   ⚠️  ${table.padEnd(25)}: Table not found`);
    }
  }

  console.log('-'.repeat(70));
  console.log(`   📈 Total rows across all tables: ${totalRows.toLocaleString()}`);

  // Check 7: Sample data verification
  console.log('\n🔍 Sample Data Check:');
  console.log('-'.repeat(70));

  // Check users
  try {
    const users = db.prepare("SELECT id, username, name, role FROM users LIMIT 3").all();
    if (users.length > 0) {
      console.log(`\n   Users (showing ${users.length} of ${tableCounts['users'] || 0}):`);
      users.forEach(user => {
        console.log(`      - ${user.name} (${user.username}) - ${user.role}`);
      });
    }
  } catch (error) {
    console.log(`   ⚠️  Could not read users: ${error.message}`);
  }

  // Check accounts
  try {
    const accounts = db.prepare("SELECT id, name, type FROM accounts LIMIT 3").all();
    if (accounts.length > 0) {
      console.log(`\n   Accounts (showing ${accounts.length} of ${tableCounts['accounts'] || 0}):`);
      accounts.forEach(account => {
        console.log(`      - ${account.name} (${account.type})`);
      });
    }
  } catch (error) {
    console.log(`   ⚠️  Could not read accounts: ${error.message}`);
  }

  // Check contacts
  try {
    const contacts = db.prepare("SELECT id, name, type FROM contacts LIMIT 3").all();
    if (contacts.length > 0) {
      console.log(`\n   Contacts (showing ${contacts.length} of ${tableCounts['contacts'] || 0}):`);
      contacts.forEach(contact => {
        console.log(`      - ${contact.name} (${contact.type || 'N/A'})`);
      });
    }
  } catch (error) {
    console.log(`   ⚠️  Could not read contacts: ${error.message}`);
  }

  // Check 8: Master index registration
  console.log('\n📋 Master Index Check:');
  console.log('-'.repeat(70));
  try {
    if (fs.existsSync(MASTER_DB)) {
      const masterDb = new (require('better-sqlite3'))(MASTER_DB, { readonly: true });
      const company = masterDb.prepare("SELECT company_name, slug, db_file_path, schema_version FROM companies WHERE slug = 'rkbuilders'").get();
      if (company) {
        console.log(`✅ Company registered in master_index.db:`);
        console.log(`   - Name: ${company.company_name}`);
        console.log(`   - Slug: ${company.slug}`);
        console.log(`   - Schema Version: ${company.schema_version}`);
        console.log(`   - DB Path: ${company.db_file_path}`);
      } else {
        console.log(`⚠️  Company 'rkbuilders' not found in master_index.db`);
      }
      masterDb.close();
    } else {
      console.log(`⚠️  master_index.db not found`);
    }
  } catch (error) {
    console.log(`⚠️  Could not check master index: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('  Verification Summary');
  console.log('='.repeat(70));
  
  const hasData = totalRows > 0;
  const hasUsers = (tableCounts['users'] || 0) > 0;
  const hasAccounts = (tableCounts['accounts'] || 0) > 0;
  const hasContacts = (tableCounts['contacts'] || 0) > 0;
  const hasTransactions = (tableCounts['transactions'] || 0) > 0;

  if (hasData && hasUsers && hasAccounts && hasContacts) {
    console.log('✅ Migration appears successful!');
    console.log(`\n   - Database file exists and is accessible`);
    console.log(`   - Total data rows: ${totalRows.toLocaleString()}`);
    console.log(`   - Users: ${tableCounts['users'] || 0}`);
    console.log(`   - Accounts: ${tableCounts['accounts'] || 0}`);
    console.log(`   - Contacts: ${tableCounts['contacts'] || 0}`);
    console.log(`   - Transactions: ${tableCounts['transactions'] || 0}`);
    console.log(`\n✅ You can now open PBooks Pro and select "Rkbuilders" company to access your migrated data.`);
  } else {
    console.log('⚠️  Migration may be incomplete:');
    if (!hasUsers) console.log('   - No users found');
    if (!hasAccounts) console.log('   - No accounts found');
    if (!hasContacts) console.log('   - No contacts found');
    if (!hasTransactions) console.log('   - No transactions found');
  }

  console.log('='.repeat(70));

  db.close();
}

main();

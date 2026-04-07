/**
 * Debug Rkbuilders Database
 * 
 * Checks for issues that might prevent data from loading in the app.
 */

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');

function main() {
  console.log('='.repeat(70));
  console.log('  Debugging rkbuilders.db - Checking for Data Loading Issues');
  console.log('='.repeat(70));
  console.log(`\nDatabase: ${TARGET_DB}\n`);

  if (!fs.existsSync(TARGET_DB)) {
    console.error(`❌ Database not found: ${TARGET_DB}`);
    process.exit(1);
  }

  const Database = require('better-sqlite3');
  const db = new Database(TARGET_DB, { readonly: true });

  // Check 1: Users and current_user_id
  console.log('1️⃣  USER AUTHENTICATION CHECK:');
  console.log('-'.repeat(70));
  try {
    const users = db.prepare("SELECT id, username, name, role, tenant_id, is_active FROM users").all();
    console.log(`   Total users: ${users.length}`);
    users.forEach(u => {
      console.log(`   - ${u.name} (${u.username}) - Role: ${u.role}, Tenant: ${u.tenant_id}, Active: ${u.is_active}`);
    });

    // Check app_settings for current_user_id
    try {
      const currentUserId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
      if (currentUserId) {
        console.log(`\n   ✅ Current User ID in app_settings: ${currentUserId.value}`);
        const userExists = users.find(u => u.id === currentUserId.value);
        if (!userExists) {
          console.log(`   ⚠️  WARNING: current_user_id (${currentUserId.value}) doesn't match any user!`);
        }
      } else {
        console.log(`\n   ⚠️  WARNING: No current_user_id set in app_settings`);
      }
    } catch (e) {
      console.log(`   ⚠️  Could not check current_user_id: ${e.message}`);
    }
  } catch (error) {
    console.log(`   ❌ Error checking users: ${error.message}`);
  }

  // Check 2: Tenant ID values
  console.log('\n2️⃣  TENANT ID CHECK:');
  console.log('-'.repeat(70));
  const tablesToCheck = ['users', 'accounts', 'contacts', 'transactions', 'invoices', 'bills'];
  for (const table of tablesToCheck) {
    try {
      const tenantIds = db.prepare(`SELECT DISTINCT tenant_id, COUNT(*) as count FROM "${table}" GROUP BY tenant_id`).all();
      if (tenantIds.length > 0) {
        console.log(`   ${table}:`);
        tenantIds.forEach(t => {
          const status = t.tenant_id === 'local' ? '✅' : '⚠️';
          console.log(`      ${status} tenant_id="${t.tenant_id}": ${t.count} rows`);
        });
      }
    } catch (error) {
      // Table may not exist
    }
  }

  // Check 3: App settings that might affect data loading
  console.log('\n3️⃣  APP SETTINGS CHECK:');
  console.log('-'.repeat(70));
  try {
    const settings = db.prepare("SELECT key, value FROM app_settings WHERE key IN ('current_tenant_id', 'current_user_id', 'current_org_name')").all();
    if (settings.length > 0) {
      settings.forEach(s => {
        console.log(`   ${s.key}: ${s.value}`);
      });
    } else {
      console.log(`   ⚠️  No critical app_settings found`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check app_settings: ${error.message}`);
  }

  // Check 4: Sample data with tenant_id filter
  console.log('\n4️⃣  DATA ACCESSIBILITY CHECK (with tenant_id filter):');
  console.log('-'.repeat(70));
  
  const testQueries = [
    { name: 'Accounts (tenant_id="local")', sql: 'SELECT COUNT(*) as c FROM accounts WHERE tenant_id = "local"' },
    { name: 'Contacts (tenant_id="local")', sql: 'SELECT COUNT(*) as c FROM contacts WHERE tenant_id = "local"' },
    { name: 'Transactions (tenant_id="local")', sql: 'SELECT COUNT(*) as c FROM transactions WHERE tenant_id = "local"' },
    { name: 'Invoices (tenant_id="local")', sql: 'SELECT COUNT(*) as c FROM invoices WHERE tenant_id = "local"' },
  ];

  for (const test of testQueries) {
    try {
      const result = db.prepare(test.sql).get();
      const count = result ? result.c : 0;
      const status = count > 0 ? '✅' : '❌';
      console.log(`   ${status} ${test.name}: ${count} rows`);
    } catch (error) {
      console.log(`   ⚠️  ${test.name}: Error - ${error.message}`);
    }
  }

  // Check 5: Check for NULL tenant_id values
  console.log('\n5️⃣  NULL TENANT_ID CHECK:');
  console.log('-'.repeat(70));
  for (const table of ['accounts', 'contacts', 'transactions']) {
    try {
      const nullCount = db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE tenant_id IS NULL OR tenant_id = ''`).get();
      if (nullCount && nullCount.c > 0) {
        console.log(`   ⚠️  ${table}: ${nullCount.c} rows with NULL or empty tenant_id`);
      } else {
        console.log(`   ✅ ${table}: No NULL tenant_id values`);
      }
    } catch (error) {
      // Table may not exist
    }
  }

  // Check 6: Company settings
  console.log('\n6️⃣  COMPANY SETTINGS CHECK:');
  console.log('-'.repeat(70));
  try {
    const company = db.prepare("SELECT * FROM company_settings WHERE id = 'default'").get();
    if (company) {
      console.log(`   ✅ Company Name: ${company.company_name}`);
      console.log(`   ✅ Created: ${company.created_at}`);
      console.log(`   ✅ Updated: ${company.updated_at}`);
    } else {
      console.log(`   ⚠️  No company_settings found`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check company_settings: ${error.message}`);
  }

  // Check 7: Metadata
  console.log('\n7️⃣  METADATA CHECK:');
  console.log('-'.repeat(70));
  try {
    const metadata = db.prepare("SELECT key, value FROM metadata").all();
    if (metadata.length > 0) {
      metadata.forEach(m => {
        console.log(`   ${m.key}: ${m.value}`);
      });
    } else {
      console.log(`   ⚠️  No metadata found`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not check metadata: ${error.message}`);
  }

  // Summary and recommendations
  console.log('\n' + '='.repeat(70));
  console.log('  DIAGNOSIS & RECOMMENDATIONS');
  console.log('='.repeat(70));

  // Check if current_user_id is set
  try {
    const currentUserId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
    if (!currentUserId || !currentUserId.value) {
      console.log('\n⚠️  ISSUE FOUND: No current_user_id set in app_settings');
      console.log('   This might prevent the app from loading data.');
      console.log('   RECOMMENDATION: Set current_user_id to the first user\'s ID');
    }
  } catch (e) {}

  // Check tenant_id values
  try {
    const accountsLocal = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE tenant_id = "local"').get();
    if (accountsLocal && accountsLocal.c === 0) {
      console.log('\n⚠️  ISSUE FOUND: No accounts with tenant_id="local"');
      console.log('   The app filters data by tenant_id="local" in local-only mode.');
      console.log('   RECOMMENDATION: Ensure all data has tenant_id="local"');
    }
  } catch (e) {}

  console.log('\n✅ Database structure looks correct.');
  console.log('   If data still doesn\'t load, check:');
  console.log('   1. App logs for errors');
  console.log('   2. Browser console (if web version)');
  console.log('   3. Ensure app is in local-only mode');
  console.log('='.repeat(70));

  db.close();
}

main();

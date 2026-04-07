/**
 * Deep Check Rkbuilders Database
 * 
 * Comprehensive check for all potential issues preventing data loading.
 */

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');

function main() {
  console.log('='.repeat(70));
  console.log('  Deep Check: rkbuilders.db - Data Loading Issues');
  console.log('='.repeat(70));
  console.log(`\nDatabase: ${TARGET_DB}\n`);

  if (!fs.existsSync(TARGET_DB)) {
    console.error(`❌ Database not found: ${TARGET_DB}`);
    process.exit(1);
  }

  const Database = require('better-sqlite3');
  const db = new Database(TARGET_DB, { readonly: true });

  // 1. Check user and authentication
  console.log('1️⃣  USER & AUTHENTICATION:');
  console.log('-'.repeat(70));
  const user = db.prepare('SELECT id, username, name, role, tenant_id, is_active FROM users WHERE username = ?').get('admin');
  if (user) {
    console.log(`✅ User found: ${user.name} (${user.username})`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Tenant ID: ${user.tenant_id}`);
    console.log(`   Active: ${user.is_active}`);
  } else {
    console.log(`❌ User "admin" not found!`);
  }

  const currentUserId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
  console.log(`\n   current_user_id: ${currentUserId ? currentUserId.value : 'NOT SET'}`);
  
  const currentTenantId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_tenant_id'").get();
  console.log(`   current_tenant_id: ${currentTenantId ? currentTenantId.value : 'NOT SET'}`);

  // 2. Check data with tenant_id filter
  console.log('\n2️⃣  DATA ACCESSIBILITY (tenant_id = "local"):');
  console.log('-'.repeat(70));
  const tables = ['accounts', 'contacts', 'transactions', 'invoices', 'bills'];
  for (const table of tables) {
    try {
      const total = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
      const withTenant = db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE tenant_id = ?`).get('local').c;
      const status = withTenant === total && total > 0 ? '✅' : '⚠️';
      console.log(`   ${status} ${table.padEnd(20)}: ${withTenant}/${total} rows with tenant_id='local'`);
    } catch (error) {
      console.log(`   ⚠️  ${table.padEnd(20)}: Error - ${error.message}`);
    }
  }

  // 3. Check for any NULL or empty tenant_id
  console.log('\n3️⃣  NULL/EMPTY TENANT_ID CHECK:');
  console.log('-'.repeat(70));
  for (const table of ['accounts', 'contacts', 'transactions']) {
    try {
      const nullCount = db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE tenant_id IS NULL OR tenant_id = ''`).get().c;
      if (nullCount > 0) {
        console.log(`   ⚠️  ${table}: ${nullCount} rows with NULL/empty tenant_id`);
      } else {
        console.log(`   ✅ ${table}: No NULL/empty tenant_id`);
      }
    } catch (error) {}
  }

  // 4. Check app_settings that might affect data loading
  console.log('\n4️⃣  APP SETTINGS (all relevant keys):');
  console.log('-'.repeat(70));
  const settings = db.prepare("SELECT key, value FROM app_settings ORDER BY key").all();
  const relevantKeys = ['current_user_id', 'current_tenant_id', 'tenantId', 'current_org_name', 'current_org_id'];
  settings.forEach(s => {
    if (relevantKeys.some(k => s.key.includes(k) || s.key.toLowerCase().includes('user') || s.key.toLowerCase().includes('tenant'))) {
      console.log(`   ${s.key}: ${s.value}`);
    }
  });

  // 5. Check if data exists but might be filtered out
  console.log('\n5️⃣  SAMPLE DATA CHECK (first 3 rows of each table):');
  console.log('-'.repeat(70));
  for (const table of ['accounts', 'contacts', 'transactions']) {
    try {
      const rows = db.prepare(`SELECT * FROM "${table}" WHERE tenant_id = ? LIMIT 3`).all('local');
      if (rows.length > 0) {
        console.log(`\n   ${table} (showing ${rows.length} rows):`);
        rows.forEach((row, idx) => {
          const keys = Object.keys(row).slice(0, 5); // Show first 5 columns
          const preview = keys.map(k => `${k}=${row[k]}`).join(', ');
          console.log(`      [${idx + 1}] ${preview}...`);
        });
      } else {
        console.log(`\n   ⚠️  ${table}: No rows found with tenant_id='local'`);
      }
    } catch (error) {
      console.log(`\n   ⚠️  ${table}: Error - ${error.message}`);
    }
  }

  // 6. Check company settings
  console.log('\n6️⃣  COMPANY SETTINGS:');
  console.log('-'.repeat(70));
  const company = db.prepare("SELECT * FROM company_settings WHERE id = 'default'").get();
  if (company) {
    console.log(`   Company Name: ${company.company_name}`);
    console.log(`   Created: ${company.created_at}`);
    console.log(`   Updated: ${company.updated_at}`);
  }

  // 7. Summary and recommendations
  console.log('\n' + '='.repeat(70));
  console.log('  DIAGNOSIS:');
  console.log('='.repeat(70));

  const accountsCount = db.prepare('SELECT COUNT(*) as c FROM accounts WHERE tenant_id = ?').get('local').c;
  const contactsCount = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE tenant_id = ?').get('local').c;
  const transactionsCount = db.prepare('SELECT COUNT(*) as c FROM transactions WHERE tenant_id = ?').get('local').c;

  if (accountsCount === 0 && contactsCount === 0 && transactionsCount === 0) {
    console.log('\n❌ CRITICAL: No data found with tenant_id="local"');
    console.log('   The app filters data by tenant_id="local" in local-only mode.');
    console.log('   RECOMMENDATION: Check if tenant_id values are actually "local"');
  } else if (currentUserId && currentUserId.value === 'admin' && user) {
    console.log('\n✅ User settings look correct:');
    console.log(`   - current_user_id: ${currentUserId.value}`);
    console.log(`   - User exists: ${user.username}`);
    console.log(`   - Data available: ${accountsCount} accounts, ${contactsCount} contacts, ${transactionsCount} transactions`);
    console.log('\n⚠️  If data still doesn\'t load, possible issues:');
    console.log('   1. App might be looking for user ID instead of username');
    console.log('   2. App might need a different app_settings key');
    console.log('   3. Check browser console / app logs for errors');
    console.log('   4. Ensure app is in local-only mode');
  }

  console.log('='.repeat(70));

  db.close();
}

main();

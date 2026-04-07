/**
 * Fix Rkbuilders Database User Settings - Set to username "admin"
 */

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');

function main() {
  console.log('='.repeat(70));
  console.log('  Fixing User Settings - Setting current_user_id to "admin"');
  console.log('='.repeat(70));
  console.log(`\nDatabase: ${TARGET_DB}\n`);

  if (!fs.existsSync(TARGET_DB)) {
    console.error(`❌ Database not found: ${TARGET_DB}`);
    process.exit(1);
  }

  const Database = require('better-sqlite3');
  const db = new Database(TARGET_DB);

  try {
    // Get the user with username "admin"
    const user = db.prepare('SELECT id, username, name FROM users WHERE username = ?').get('admin');
    
    if (!user) {
      console.error('❌ No user with username "admin" found!');
      const allUsers = db.prepare('SELECT id, username, name FROM users').all();
      console.log('\nAvailable users:');
      allUsers.forEach(u => console.log(`  - ${u.username} (ID: ${u.id}, Name: ${u.name})`));
      db.close();
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name} (${user.username})`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Username: ${user.username}\n`);

    // Check current setting
    const currentSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
    console.log(`Current current_user_id setting: ${currentSetting ? currentSetting.value : 'NOT SET'}`);

    // Update current_user_id to "admin" (username) as requested
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_user_id', 'admin', datetime('now'))").run();
    console.log(`✅ Updated current_user_id to: admin`);

    // Also ensure current_tenant_id is set to 'local'
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_tenant_id', 'local', datetime('now'))").run();
    console.log(`✅ Set current_tenant_id to: local`);

    // Also try setting it to the user ID in case the app needs that
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_user_id_by_id', ?, datetime('now'))").run(user.id);
    console.log(`✅ Also set current_user_id_by_id to: ${user.id} (as backup)`);

    // Verify the fix
    const updated = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
    console.log(`\n✅ Verification: current_user_id is now: ${updated.value}`);

    // Check all app_settings related to user/tenant
    console.log('\n📋 All User/Tenant Settings:');
    const allSettings = db.prepare("SELECT key, value FROM app_settings WHERE key LIKE '%user%' OR key LIKE '%tenant%'").all();
    allSettings.forEach(s => {
      console.log(`   ${s.key}: ${s.value}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('✅ User settings updated successfully!');
    console.log('   current_user_id is now set to "admin"');
    console.log('='.repeat(70));

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    db.close();
    process.exit(1);
  }

  db.close();
}

main();

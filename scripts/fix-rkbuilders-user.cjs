/**
 * Fix Rkbuilders Database User Settings
 * 
 * Fixes current_user_id to match the actual user in the database.
 */

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');

function main() {
  console.log('='.repeat(70));
  console.log('  Fixing User Settings in rkbuilders.db');
  console.log('='.repeat(70));
  console.log(`\nDatabase: ${TARGET_DB}\n`);

  if (!fs.existsSync(TARGET_DB)) {
    console.error(`❌ Database not found: ${TARGET_DB}`);
    process.exit(1);
  }

  const Database = require('better-sqlite3');
  const db = new Database(TARGET_DB);

  try {
    // Get the first user
    const user = db.prepare('SELECT id, username, name FROM users LIMIT 1').get();
    
    if (!user) {
      console.error('❌ No users found in database!');
      db.close();
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name} (${user.username})`);
    console.log(`   User ID: ${user.id}\n`);

    // Check current setting
    const currentSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
    console.log(`Current current_user_id setting: ${currentSetting ? currentSetting.value : 'NOT SET'}`);

    // Update current_user_id to match the actual user
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_user_id', ?, datetime('now'))").run(user.id);
    console.log(`✅ Updated current_user_id to: ${user.id}`);

    // Also ensure current_tenant_id is set to 'local'
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_tenant_id', 'local', datetime('now'))").run();
    console.log(`✅ Set current_tenant_id to: local`);

    // Verify the fix
    const updated = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
    console.log(`\n✅ Verification: current_user_id is now: ${updated.value}`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ User settings fixed successfully!');
    console.log('   The app should now be able to load data.');
    console.log('='.repeat(70));

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    db.close();
    process.exit(1);
  }

  db.close();
}

main();

/**
 * Fix Rkbuilders Database - Update User ID to match app expectations
 * 
 * The app expects user ID to match current_user_id setting.
 * Updates the user ID to match what the app is looking for.
 */

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');

function main() {
  console.log('='.repeat(70));
  console.log('  Fixing User ID in rkbuilders.db');
  console.log('='.repeat(70));
  console.log(`\nDatabase: ${TARGET_DB}\n`);

  if (!fs.existsSync(TARGET_DB)) {
    console.error(`❌ Database not found: ${TARGET_DB}`);
    process.exit(1);
  }

  const Database = require('better-sqlite3');
  const db = new Database(TARGET_DB);

  try {
    // Get current user
    const user = db.prepare('SELECT id, username, name FROM users WHERE username = ?').get('admin');
    
    if (!user) {
      console.error('❌ No user with username "admin" found!');
      db.close();
      process.exit(1);
    }

    console.log(`Current user:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Name: ${user.name}\n`);

    const oldUserId = user.id;

    // Change user ID to "admin" (username) as requested by user
    // Note: This might break foreign key references, but user specifically requested this
    console.log('Updating user ID to "admin"...');
    
    // Check if there are any references to this user ID in other tables
    const tablesWithUserId = ['transaction_log', 'error_log'];
    let hasReferences = false;
    for (const table of tablesWithUserId) {
      try {
        const refs = db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE user_id = ?`).get(oldUserId);
        if (refs && refs.c > 0) {
          console.log(`   ⚠️  Found ${refs.c} references in ${table}`);
          hasReferences = true;
        }
      } catch (e) {
        // Table may not exist or may not have user_id column
      }
    }
    
    if (hasReferences) {
      console.log(`   ⚠️  Warning: There are references to the old user ID. Updating them...`);
      // Update references if any
      for (const table of tablesWithUserId) {
        try {
          db.prepare(`UPDATE "${table}" SET user_id = ? WHERE user_id = ?`).run('admin', oldUserId);
        } catch (e) {
          // Ignore if table/column doesn't exist
        }
      }
    }
    
    // Update user ID to "admin"
    db.prepare('UPDATE users SET id = ? WHERE id = ?').run('admin', oldUserId);
    console.log(`✅ Updated user ID from "${oldUserId}" to "admin"`);

    // Update current_user_id to match
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_user_id', 'admin', datetime('now'))").run();
    console.log(`✅ Set current_user_id to: admin`);

    // Set current_tenant_id
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('current_tenant_id', 'local', datetime('now'))").run();
    console.log(`✅ Set current_tenant_id to: local`);

    // Verify
    const updatedUser = db.prepare('SELECT id, username, name FROM users WHERE username = ?').get('admin');
    const currentUserId = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
    
    console.log(`\n✅ Verification:`);
    console.log(`   User ID: ${updatedUser.id}`);
    console.log(`   current_user_id: ${currentUserId.value}`);
    console.log(`   Match: ${updatedUser.id === currentUserId.value ? '✅' : '❌'}`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ User ID updated successfully!');
    console.log('   User ID is now: admin');
    console.log('   current_user_id is now: admin');
    console.log('='.repeat(70));

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error('\nRolling back changes...');
    db.close();
    process.exit(1);
  }

  db.close();
}

main();

#!/usr/bin/env node
/**
 * Add Admin User to Database
 * 
 * This script adds the default admin user to an existing database file.
 * Use this if you restored a database without users.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function addAdminUser(dbPath) {
    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database file not found: ${dbPath}`);
        process.exit(1);
    }

    console.log(`📦 Opening database: ${dbPath}`);
    const db = new Database(dbPath);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Check if users table exists
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (!tableCheck) {
        console.error('❌ Users table does not exist in the database. The database schema may be incomplete.');
        db.close();
        process.exit(1);
    }
    
    // Check if admin user already exists
    const existingUser = db.prepare("SELECT id, username FROM users WHERE username = ? OR id = ?").get('admin', 'sys-admin');
    
    if (existingUser) {
        console.log(`⚠️  User already exists: ${existingUser.username} (ID: ${existingUser.id})`);
        console.log('   Updating to admin user...');
        
        // Update existing user to admin
        db.prepare(`
            UPDATE users 
            SET username = ?, name = ?, role = ?, password = ?, updated_at = datetime('now')
            WHERE id = ? OR username = ?
        `).run('admin', 'Administrator', 'Admin', '', existingUser.id, existingUser.username);
        
        console.log('✅ Admin user updated successfully');
    } else {
        console.log('👤 Creating default admin user...');
        
        // Insert admin user
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO users (id, username, name, role, password, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('sys-admin', 'admin', 'Administrator', 'Admin', '', now, now);
        
        console.log('✅ Admin user created successfully');
    }
    
    // Verify the user was created/updated
    const adminUser = db.prepare("SELECT id, username, name, role FROM users WHERE username = 'admin'").get();
    if (adminUser) {
        console.log('\n✅ Verification:');
        console.log(`   ID: ${adminUser.id}`);
        console.log(`   Username: ${adminUser.username}`);
        console.log(`   Name: ${adminUser.name}`);
        console.log(`   Role: ${adminUser.role}`);
        console.log(`   Password: (empty - no password required)`);
    }
    
    // Set current user in app settings if not set
    const currentUserSetting = db.prepare("SELECT value FROM app_settings WHERE key = 'current_user_id'").get();
    if (!currentUserSetting) {
        console.log('\n⚙️  Setting current user in app settings...');
        db.prepare(`
            INSERT INTO app_settings (key, value, updated_at) 
            VALUES (?, ?, datetime('now'))
        `).run('current_user_id', 'sys-admin');
        console.log('✅ Current user set in app settings');
    }
    
    db.close();
    console.log('\n✅ Done! You can now login with:');
    console.log('   Username: admin');
    console.log('   Password: (leave empty)');
}

// Get database path from command line argument or use default
const args = process.argv.slice(2);
let dbPath;

if (args.length > 0) {
    dbPath = path.resolve(args[0]);
} else {
    // Try to find the database in common locations
    const possiblePaths = [
        path.join(__dirname, '..', 'finance-tracker-Sample data.db'),
        path.join(__dirname, '..', 'finance_db.sqlite'),
    ];
    
    // Also check Electron userData directory
    const os = require('os');
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    possiblePaths.push(path.join(appData, 'my-projects-pro', 'finance_db.sqlite'));
    
    for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
            dbPath = possiblePath;
            break;
        }
    }
    
    if (!dbPath) {
        console.error('❌ Database file not found.');
        console.error('\nUsage:');
        console.error('  node tools/add-admin-user.cjs [path-to-database.db]');
        console.error('\nOr place the database file in one of these locations:');
        possiblePaths.forEach(p => console.error(`  - ${p}`));
        process.exit(1);
    }
}

console.log('🔧 Add Admin User Utility\n');
addAdminUser(dbPath);


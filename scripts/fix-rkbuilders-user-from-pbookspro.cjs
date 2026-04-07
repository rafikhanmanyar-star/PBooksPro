#!/usr/bin/env node
/**
 * Fix user_id issue in rkbuilders.db
 * 
 * 1. Checks what user_id was used in pbookspro.db
 * 2. Checks if that user exists in rkbuilders.db
 * 3. If not, adds the user from pbookspro.db to rkbuilders.db
 * 4. Sets current_user_id in rkbuilders.db to match
 */

const path = require('path');
const fs = require('fs');

const BASE_DIR = process.env.PBOOKS_BASE_DIR || path.join(process.env.APPDATA || path.join(process.env.HOME || '', '.config'), 'pbooks-pro', 'pbookspro');
const SOURCE_DB = fs.existsSync(path.resolve(BASE_DIR, 'PBooksPro.db')) 
  ? path.resolve(BASE_DIR, 'PBooksPro.db')
  : path.resolve(BASE_DIR, 'pbookspro.db');
const TARGET_DB = path.resolve(BASE_DIR, 'data', 'companies', 'rkbuilders.db');

function main() {
  console.log('='.repeat(70));
  console.log('  Fix User ID Issue: pbookspro.db → rkbuilders.db');
  console.log('='.repeat(70));
  console.log(`\nSource DB: ${SOURCE_DB}`);
  console.log(`Target DB: ${TARGET_DB}\n`);

  if (!fs.existsSync(SOURCE_DB)) {
    console.error(`❌ Source database not found: ${SOURCE_DB}`);
    process.exit(1);
  }

  if (!fs.existsSync(TARGET_DB)) {
    console.error(`❌ Target database not found: ${TARGET_DB}`);
    console.error(`   Run the migration script first: npm run migrate-pbookspro-to-rkbuilders`);
    process.exit(1);
  }

  // Use sql.js for compatibility (works in Node.js without native modules)
  const initSqlJs = require('sql.js');
  const fileBuffer = fs.readFileSync(SOURCE_DB);
  
  // Initialize sql.js
  let SQL, sourceDb, targetDb;
  
  // Use async initialization
  const initPromise = initSqlJs({
    locateFile: (file) => {
      // Try to find sql-wasm.wasm in node_modules
      const wasmPath = path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', file);
      if (fs.existsSync(wasmPath)) {
        return wasmPath;
      }
      // Fallback to CDN (won't work offline, but better than nothing)
      return `https://sql.js.org/dist/${file}`;
    }
  }).then(SQLModule => {
    SQL = SQLModule;
    sourceDb = new SQL.Database(fileBuffer);
    
    // Read target DB
    const targetFileBuffer = fs.readFileSync(TARGET_DB);
    targetDb = new SQL.Database(targetFileBuffer);
    
    return { sourceDb, targetDb };
  });

  // Wait for initialization
  const { sourceDb: srcDb, targetDb: tgtDb } = await initPromise;
  sourceDb = srcDb;
  targetDb = tgtDb;

  try {
    // Step 1: Get users from source DB
    console.log('1️⃣  Checking users in pbookspro.db...');
    console.log('-'.repeat(70));
    
    let sourceUsers = [];
    try {
      const usersResult = sourceDb.exec("SELECT id, username, name, email, role, password_hash, tenant_id, is_active FROM users");
      if (usersResult.length > 0) {
        sourceUsers = usersResult[0].values.map(row => ({
          id: row[0],
          username: row[1],
          name: row[2],
          email: row[3],
          role: row[4],
          password_hash: row[5],
          tenant_id: row[6],
          is_active: row[7]
        }));
      }
    } catch (e) {
      console.error(`   ⚠️  Error reading users from source: ${e.message}`);
    }

    if (sourceUsers.length === 0) {
      console.log('   ⚠️  No users found in source database');
    } else {
      sourceUsers.forEach(u => {
        console.log(`   - ${u.name || u.username} (ID: ${u.id}, Username: ${u.username}, Role: ${u.role})`);
      });
    }

    // Get current_user_id from source
    let sourceCurrentUserId = null;
    try {
      const currentUserResult = sourceDb.exec("SELECT value FROM app_settings WHERE key = 'current_user_id'");
      if (currentUserResult.length > 0 && currentUserResult[0].values.length > 0) {
        sourceCurrentUserId = currentUserResult[0].values[0][0];
        console.log(`\n   ✅ Source current_user_id: ${sourceCurrentUserId}`);
      } else {
        console.log(`\n   ⚠️  No current_user_id found in source app_settings`);
      }
    } catch (e) {
      console.log(`\n   ⚠️  Could not read current_user_id from source: ${e.message}`);
    }

    // Step 2: Get users from target DB
    console.log('\n2️⃣  Checking users in rkbuilders.db...');
    console.log('-'.repeat(70));
    
    let targetUsers = [];
    try {
      const usersResult = targetDb.exec("SELECT id, username, name, email, role, password_hash, tenant_id, is_active FROM users");
      if (usersResult.length > 0) {
        targetUsers = usersResult[0].values.map(row => ({
          id: row[0],
          username: row[1],
          name: row[2],
          email: row[3],
          role: row[4],
          password_hash: row[5],
          tenant_id: row[6],
          is_active: row[7]
        }));
      }
    } catch (e) {
      console.error(`   ⚠️  Error reading users from target: ${e.message}`);
    }

    if (targetUsers.length === 0) {
      console.log('   ⚠️  No users found in target database');
    } else {
      targetUsers.forEach(u => {
        console.log(`   - ${u.name || u.username} (ID: ${u.id}, Username: ${u.username}, Role: ${u.role})`);
      });
    }

    // Get current_user_id from target
    let targetCurrentUserId = null;
    try {
      const currentUserResult = targetDb.exec("SELECT value FROM app_settings WHERE key = 'current_user_id'");
      if (currentUserResult.length > 0 && currentUserResult[0].values.length > 0) {
        targetCurrentUserId = currentUserResult[0].values[0][0];
        console.log(`\n   Current target current_user_id: ${targetCurrentUserId}`);
      } else {
        console.log(`\n   ⚠️  No current_user_id found in target app_settings`);
      }
    } catch (e) {
      console.log(`\n   ⚠️  Could not read current_user_id from target: ${e.message}`);
    }

    // Step 3: Find the user to use
    let userToAdd = null;
    let userIdToSet = null;

    if (sourceCurrentUserId) {
      // Try to find the user from source by ID
      userToAdd = sourceUsers.find(u => u.id === sourceCurrentUserId);
      if (userToAdd) {
        console.log(`\n3️⃣  Found user from source current_user_id: ${userToAdd.name || userToAdd.username} (${userToAdd.id})`);
        
        // Check if this user exists in target
        const existsInTarget = targetUsers.find(u => u.id === userToAdd.id);
        if (!existsInTarget) {
          console.log(`   ⚠️  User ${userToAdd.id} does not exist in rkbuilders.db - will add it`);
          userIdToSet = userToAdd.id;
        } else {
          console.log(`   ✅ User ${userToAdd.id} already exists in rkbuilders.db`);
          userIdToSet = userToAdd.id;
        }
      } else {
        console.log(`\n   ⚠️  Source current_user_id (${sourceCurrentUserId}) doesn't match any user in source DB`);
      }
    }

    // Fallback: use first user from source if no current_user_id
    if (!userToAdd && sourceUsers.length > 0) {
      userToAdd = sourceUsers[0];
      console.log(`\n3️⃣  Using first user from source: ${userToAdd.name || userToAdd.username} (${userToAdd.id})`);
      
      const existsInTarget = targetUsers.find(u => u.id === userToAdd.id);
      if (!existsInTarget) {
        console.log(`   ⚠️  User ${userToAdd.id} does not exist in rkbuilders.db - will add it`);
        userIdToSet = userToAdd.id;
      } else {
        console.log(`   ✅ User ${userToAdd.id} already exists in rkbuilders.db`);
        userIdToSet = userToAdd.id;
      }
    }

    // Step 4: Add user and set current_user_id
    if (userToAdd && userIdToSet) {
      console.log('\n4️⃣  Updating rkbuilders.db...');
      console.log('-'.repeat(70));

      const existsInTarget = targetUsers.find(u => u.id === userToAdd.id);
      
      if (!existsInTarget) {
        // Add the user
        console.log(`   Adding user: ${userToAdd.name || userToAdd.username} (${userToAdd.id})`);
        
        // Ensure users table has all required columns
        try {
          targetDb.run(`
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL,
              name TEXT,
              email TEXT,
              role TEXT NOT NULL DEFAULT 'user',
              password_hash TEXT,
              tenant_id TEXT NOT NULL DEFAULT 'local',
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);
        } catch (e) {
          // Table might already exist
        }

        // Insert or replace user
        targetDb.run(`
          INSERT OR REPLACE INTO users 
          (id, username, name, email, role, password_hash, tenant_id, is_active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `, [
          userToAdd.id,
          userToAdd.username || userToAdd.id,
          userToAdd.name || userToAdd.username || 'User',
          userToAdd.email || '',
          userToAdd.role || 'user',
          userToAdd.password_hash || '',
          'local', // Ensure tenant_id is 'local'
          userToAdd.is_active !== undefined ? userToAdd.is_active : 1
        ]);
        
        console.log(`   ✅ User added successfully`);
      }

      // Set current_user_id
      console.log(`   Setting current_user_id to: ${userIdToSet}`);
      
      try {
        targetDb.run(`
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
      } catch (e) {
        // Table might already exist
      }

      targetDb.run(`
        INSERT OR REPLACE INTO app_settings (key, value, updated_at)
        VALUES ('current_user_id', ?, datetime('now'))
      `, [userIdToSet]);

      targetDb.run(`
        INSERT OR REPLACE INTO app_settings (key, value, updated_at)
        VALUES ('current_tenant_id', 'local', datetime('now'))
      `);

      console.log(`   ✅ current_user_id set to: ${userIdToSet}`);
      console.log(`   ✅ current_tenant_id set to: local`);

      // Save the database
      const targetData = targetDb.export();
      const buffer = Buffer.from(targetData);
      fs.writeFileSync(TARGET_DB, buffer);
      
      console.log('\n✅ Database updated successfully!');
      console.log(`\n   User ID: ${userIdToSet}`);
      console.log(`   Username: ${userToAdd.username || userToAdd.id}`);
      console.log(`   Name: ${userToAdd.name || 'N/A'}`);
      console.log(`   Role: ${userToAdd.role || 'user'}`);
      console.log(`\n   Try opening the app now. Data should load correctly.`);
    } else {
      console.log('\n⚠️  Could not determine which user to use.');
      console.log('   Please check the databases manually.');
    }

  } finally {
    sourceDb.close();
    targetDb.close();
  }
}

main();

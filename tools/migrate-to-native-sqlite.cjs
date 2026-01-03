#!/usr/bin/env node
/**
 * Minimal migration helper: copy existing sql.js database (Electron userData)
 * to the native better-sqlite3 database path.
 *
 * Run this from the project root after installing better-sqlite3:
 *   node tools/migrate-to-native-sqlite.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mimic Electron's userData path on Windows
// Electron uses appId from package.json: "com.myprojects.pro" -> "my-projects-pro"
function getUserDataDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  // Try both possible paths (old and new appId formats)
  const possiblePaths = [
    path.join(appData, 'my-projects-pro'), // Current appId: com.myprojects.pro
    path.join(appData, 'PBooksPro'),  // Legacy/alternative format
    path.join(appData, 'finance-tracker-pro-v1.0.2'), // Old version path
  ];
  
  // Return the first existing path, or default to my-projects-pro
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  }
  
  // Default to my-projects-pro (current appId)
  return path.join(appData, 'my-projects-pro');
}

const userDataDir = getUserDataDir();
const legacyPath = path.join(userDataDir, 'finance_db.sqlite'); // used by sql.js electron storage
const nativePath = path.join(userDataDir, 'native_finance_db.sqlite'); // used by better-sqlite3 scaffolding

if (!fs.existsSync(legacyPath)) {
  console.error(`❌ Legacy database not found at ${legacyPath}. Make sure you have run the app at least once.`);
  process.exit(1);
}

try {
  fs.copyFileSync(legacyPath, nativePath);
  console.log(`✅ Copied legacy database to native path:\n  from: ${legacyPath}\n    to: ${nativePath}`);
  console.log('You can now start the app and point IPC calls to the native backend.');
} catch (err) {
  console.error('❌ Migration copy failed:', err);
  process.exit(1);
}


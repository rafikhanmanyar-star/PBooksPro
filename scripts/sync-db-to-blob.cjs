/**
 * sync-db-to-blob.cjs
 *
 * Copies PBooksPro.db → PBooksPro_sqljs.bin so the Electron renderer
 * loads the correct (migrated) database instead of the stale OPFS/IndexedDB copy.
 *
 * Run this after any migration that modifies PBooksPro.db directly (e.g. migrate-from-cloud.cjs).
 *
 * Usage:
 *   node scripts/sync-db-to-blob.cjs
 */

'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');

const dbDir  = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'pbooks-pro', 'pbookspro'
);
const dbPath   = path.join(dbDir, 'PBooksPro.db');
const blobPath = path.join(dbDir, 'PBooksPro_sqljs.bin');

if (!fs.existsSync(dbPath)) {
  console.error(`ERROR: PBooksPro.db not found at: ${dbPath}`);
  process.exit(1);
}

// If a WAL exists the main .db file may be stale — warn and continue.
const walPath = dbPath + '-wal';
if (fs.existsSync(walPath) && fs.statSync(walPath).size > 32) {
  console.log('WARNING: WAL file detected. Close the Electron app first to checkpoint WAL,');
  console.log('         then re-run this script for the cleanest result.');
}

const dbSize   = (fs.statSync(dbPath).size / 1024 / 1024).toFixed(1);
console.log(`Copying PBooksPro.db (${dbSize} MB) → PBooksPro_sqljs.bin ...`);
fs.copyFileSync(dbPath, blobPath);
const blobSize = (fs.statSync(blobPath).size / 1024 / 1024).toFixed(1);
console.log(`Done. Blob written: ${blobSize} MB`);
console.log();
console.log('Now run: npm run electron:local');
console.log('The app will load from the updated blob (our migrated data).');

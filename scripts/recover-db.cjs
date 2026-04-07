/**
 * Recover data from a corrupted PBooks Pro SQLite database.
 * Uses better-sqlite3 .backup() and integrity_check to assess damage,
 * then attempts row-level recovery into a new clean DB.
 */

const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(
  process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming'),
  'pbooks-pro', 'pbookspro'
);
const DB_PATH = path.join(DB_DIR, 'PBooksPro.db');
const BACKUP_PATH = path.join(DB_DIR, 'PBooksPro.db.corrupted.bak');
const RECOVERED_PATH = path.join(DB_DIR, 'PBooksPro_recovered.db');

console.log('=== PBooks Pro Database Recovery ===\n');
console.log('DB path:', DB_PATH);

if (!fs.existsSync(DB_PATH)) {
  console.log('ERROR: Database file not found at', DB_PATH);
  process.exit(1);
}

const Database = require('better-sqlite3');

// Step 1: Check integrity
console.log('\n--- Step 1: Integrity check ---');
let srcDb;
try {
  srcDb = new Database(DB_PATH, { readonly: true });
  const result = srcDb.pragma('integrity_check');
  console.log('Integrity check result:', JSON.stringify(result, null, 2));
} catch (e) {
  console.log('Could not open DB for integrity check:', e.message);
}

// Step 2: List tables and row counts
console.log('\n--- Step 2: Table inventory ---');
let tables = [];
try {
  if (!srcDb) srcDb = new Database(DB_PATH, { readonly: true });
  tables = srcDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`Found ${tables.length} tables:`);
  for (const t of tables) {
    try {
      const count = srcDb.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
      console.log(`  ${t.name}: ${count.c} rows`);
    } catch (e) {
      console.log(`  ${t.name}: ERROR reading - ${e.message}`);
    }
  }
} catch (e) {
  console.log('Could not list tables:', e.message);
}

// Step 3: Try to recover data table by table into a new DB
console.log('\n--- Step 3: Row-level recovery ---');
let recoveredCount = 0;
let failedTables = [];

try {
  // Read schema from the project
  const schemaPath = path.join(__dirname, '..', 'electron', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.log('ERROR: schema.sql not found at', schemaPath);
    console.log('Run: npm run electron:extract-schema first');
    process.exit(1);
  }

  // Remove old recovered DB if exists
  if (fs.existsSync(RECOVERED_PATH)) fs.unlinkSync(RECOVERED_PATH);

  const schema = fs.readFileSync(schemaPath, 'utf8');
  const newDb = new Database(RECOVERED_PATH);
  newDb.pragma('journal_mode = WAL');
  newDb.pragma('foreign_keys = OFF');
  // Strip SQL comments (may contain semicolons) before splitting
  const stripped = schema.replace(/--[^\n]*/g, '');
  const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      newDb.exec(stmt + ';');
    } catch (e) {
      // Ignore errors from individual CREATE statements
    }
  }

  // Get columns for each table in the NEW schema
  const newTables = newDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const newTableSet = new Set(newTables.map(t => t.name));

  for (const t of tables) {
    if (t.name === 'sqlite_sequence') continue;
    if (!newTableSet.has(t.name)) {
      console.log(`  SKIP ${t.name} (not in new schema)`);
      continue;
    }

    try {
      // Get column names from the NEW db
      const newCols = newDb.pragma(`table_info("${t.name}")`).map(c => c.name);
      // Get column names from the OLD db
      const oldCols = srcDb.pragma(`table_info("${t.name}")`).map(c => c.name);

      // Only copy columns that exist in both
      const commonCols = newCols.filter(c => oldCols.includes(c));
      if (commonCols.length === 0) {
        console.log(`  SKIP ${t.name} (no common columns)`);
        continue;
      }

      const colList = commonCols.map(c => `"${c}"`).join(', ');
      const placeholders = commonCols.map(() => '?').join(', ');

      // Read rows from old DB
      let rows;
      try {
        rows = srcDb.prepare(`SELECT ${colList} FROM "${t.name}"`).all();
      } catch (e) {
        console.log(`  FAIL ${t.name}: cannot read - ${e.message}`);
        failedTables.push(t.name);
        continue;
      }

      if (rows.length === 0) {
        console.log(`  OK   ${t.name}: 0 rows (empty)`);
        continue;
      }

      // Insert into new DB
      const insertStmt = newDb.prepare(
        `INSERT OR IGNORE INTO "${t.name}" (${colList}) VALUES (${placeholders})`
      );

      const insertMany = newDb.transaction((rows) => {
        let inserted = 0;
        for (const row of rows) {
          try {
            const values = commonCols.map(c => row[c] ?? null);
            insertStmt.run(...values);
            inserted++;
          } catch (_) { }
        }
        return inserted;
      });

      const inserted = insertMany(rows);
      console.log(`  OK   ${t.name}: ${inserted}/${rows.length} rows recovered`);
      recoveredCount += inserted;
    } catch (e) {
      console.log(`  FAIL ${t.name}: ${e.message}`);
      failedTables.push(t.name);
    }
  }

  newDb.close();
} catch (e) {
  console.log('Recovery error:', e.message);
}

if (srcDb) srcDb.close();

console.log(`\n--- Summary ---`);
console.log(`Total rows recovered: ${recoveredCount}`);
console.log(`Failed tables: ${failedTables.length > 0 ? failedTables.join(', ') : 'none'}`);

if (recoveredCount > 0) {
  // Rename corrupted DB and put recovered one in its place
  console.log(`\n--- Step 4: Swap databases ---`);
  try {
    if (fs.existsSync(BACKUP_PATH)) fs.unlinkSync(BACKUP_PATH);
    fs.renameSync(DB_PATH, BACKUP_PATH);
    fs.renameSync(RECOVERED_PATH, DB_PATH);
    console.log(`Corrupted DB backed up to: ${BACKUP_PATH}`);
    console.log(`Recovered DB installed at:  ${DB_PATH}`);
    console.log('\nRecovery complete! Restart the app to use the recovered database.');
  } catch (e) {
    console.log('Could not swap files:', e.message);
    console.log(`Manual steps:\n  1. Rename ${DB_PATH} -> ${BACKUP_PATH}\n  2. Rename ${RECOVERED_PATH} -> ${DB_PATH}`);
  }
} else {
  console.log('\nRecovery failed. The database may be too damaged.');
  console.log('You may need to delete the DB and start fresh.');
}

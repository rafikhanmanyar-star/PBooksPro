'use strict';
const initSqlJs = require('sql.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dbPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'pbooks-pro', 'pbookspro', 'PBooksPro.db');

initSqlJs().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);

  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  if (!tables.length) { console.log('No tables found.'); return; }

  const withoutTenantId = [];
  for (const [tname] of tables[0].values) {
    const cols = db.exec(`PRAGMA table_info("${tname}")`);
    if (!cols.length) continue;
    const colNames = cols[0].values.map(r => r[1]);
    if (!colNames.includes('tenant_id')) {
      withoutTenantId.push({ table: tname, cols: colNames });
    }
  }

  if (withoutTenantId.length === 0) {
    console.log('All tables have tenant_id. Schema looks good.');
  } else {
    console.log('Tables WITHOUT tenant_id column:');
    for (const { table, cols } of withoutTenantId) {
      console.log(`  ${table.padEnd(40)} cols: ${cols.slice(0, 6).join(', ')}`);
    }
  }
  db.close();
}).catch(err => { console.error('Error:', err.message); process.exit(1); });

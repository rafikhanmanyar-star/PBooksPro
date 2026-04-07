/**
 * PBooks Pro — Database schema validation & non-destructive repair (SQLite / better-sqlite3).
 * Expected schema is parsed from electron/schema.sql (extracted from services/database/schema.ts).
 */

const fs = require('fs');
const path = require('path');

/** @typedef {{ level: 'ok'|'warning'|'error', readOnly: boolean, blocking: boolean, version: number, messages: string[], warnings: string[], errors: string[], orphanFkSamples: { table: string, detail: string }[] }} SchemaHealth */

function log(msg) {
  console.log(`[SchemaValidator] ${msg}`);
}

function warn(msg) {
  console.warn(`[SchemaValidator] ${msg}`);
}

function loadTargetVersion() {
  const p = path.join(__dirname, 'schemaVersion.json');
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return typeof j.version === 'number' ? j.version : 1;
  } catch (e) {
    warn('schemaVersion.json missing or invalid; defaulting to 1');
    return 1;
  }
}

function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, '\n');
}

function splitTopLevelCommas(inner) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      const t = cur.trim();
      if (t) parts.push(t);
      cur = '';
      continue;
    }
    cur += c;
  }
  const last = cur.trim();
  if (last) parts.push(last);
  return parts;
}

/**
 * Parse CREATE TABLE blocks from schema SQL into { tables: { name: { columns: [...] } } }.
 * Column entries: { name, typeToken, notnull, pk, raw }
 */
function parseExpectedTables(schemaSql) {
  const tables = {};
  const cleaned = stripSqlComments(schemaSql);
  const re = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+["`]?(\w+)["`]?\s*\(/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const tableName = m[1];
    const startParen = m.index + m[0].length - 1;
    let depth = 0;
    let i = startParen;
    for (; i < cleaned.length; i++) {
      if (cleaned[i] === '(') depth++;
      else if (cleaned[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const inner = cleaned.slice(startParen + 1, i);
    const parts = splitTopLevelCommas(inner);
    const columns = [];
    for (const part of parts) {
      const p = part.replace(/\s+/g, ' ').trim();
      if (!p) continue;
      const upper = p.toUpperCase();
      if (upper.startsWith('FOREIGN KEY')) continue;
      if (upper.startsWith('CONSTRAINT ') && upper.includes(' FOREIGN KEY')) continue;
      // Table-level composite PRIMARY KEY / UNIQUE — not column definitions (was misparsed as column "PRIMARY").
      if (/^PRIMARY\s+KEY\s*\(/i.test(p)) continue;
      if (/^UNIQUE\s*\(/i.test(p)) continue;
      if (upper.startsWith('CHECK (')) continue;

      const nameMatch = /^["`]?(\w+)["`]?\s+(.+)$/i.exec(p);
      if (!nameMatch) continue;
      const colName = nameMatch[1];
      const rest = nameMatch[2].trim();
      const typeMatch = /^(INTEGER|TEXT|REAL|BLOB|NUMERIC|ANY)\b/i.exec(rest);
      const typeToken = typeMatch ? typeMatch[1].toUpperCase() : '';
      const notnull = /\bNOT\s+NULL\b/i.test(rest);
      const pk = /\bPRIMARY\s+KEY\b/i.test(rest);
      columns.push({ name: colName, typeToken, notnull, pk, raw: rest });
    }
    tables[tableName] = { columns };
  }
  return tables;
}

function extractIndexStatements(schemaSql) {
  const cleaned = stripSqlComments(schemaSql);
  const out = [];
  const re = /CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+[^;]+;/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    out.push(m[0].trim());
  }
  return out;
}

function normalizeSqliteType(t) {
  if (!t) return '';
  const u = String(t).toUpperCase().trim();
  if (u.includes('INT')) return 'INTEGER';
  if (u.includes('CHAR') || u.includes('CLOB') || u === 'TEXT') return 'TEXT';
  if (u.includes('BLOB')) return 'BLOB';
  if (u.includes('REAL') || u.includes('FLOA') || u.includes('DOUB')) return 'REAL';
  return u || 'TEXT';
}

function typesCompatible(expected, actual) {
  const e = normalizeSqliteType(expected);
  const a = normalizeSqliteType(actual);
  if (!e || !a) return true;
  if (e === a) return true;
  if ((e === 'INTEGER' || e === 'REAL') && (a === 'INTEGER' || a === 'REAL')) return true;
  return false;
}

function ensureSchemaMetaTable(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
      version INTEGER NOT NULL,
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getMetadataSchemaVersion(d) {
  try {
    const row = d.prepare('SELECT value FROM metadata WHERE key = ?').get('schema_version');
    if (row && row.value != null) return parseInt(String(row.value), 10) || 0;
  } catch (_) {}
  return 0;
}

function getSchemaMetaVersion(d) {
  try {
    const row = d.prepare('SELECT version FROM schema_meta WHERE id = 1').get();
    if (row && row.version != null) return parseInt(String(row.version), 10) || 0;
  } catch (_) {}
  return 0;
}

function setSchemaMetaVersion(d, version) {
  d.prepare(
    'INSERT OR REPLACE INTO schema_meta (id, version, last_updated) VALUES (1, ?, datetime(\'now\'))'
  ).run(version);
}

function syncMetadataSchemaVersion(d, version) {
  try {
    d.prepare(
      'INSERT OR REPLACE INTO metadata (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
    ).run('schema_version', String(version));
  } catch (_) {}
}

function timestampForFile() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}

function backupDatabaseFile(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath, path.extname(dbPath));
  const ext = path.extname(dbPath) || '.db';
  const backupPath = path.join(dir, `${base}_backup_${timestampForFile()}${ext}`);
  try {
    fs.copyFileSync(dbPath, backupPath);
    log(`Backup created: ${backupPath}`);
    return backupPath;
  } catch (e) {
    warn(`Backup failed: ${e && e.message}`);
    return null;
  }
}

function runRegisteredMigrations(d, fromV, toV, messages) {
  let migrations;
  try {
    migrations = require('./migrations/registry.cjs');
  } catch (e) {
    messages.push('No migration registry loaded');
    return;
  }
  if (typeof migrations.runMigrations !== 'function') return;
  migrations.runMigrations(d, fromV, toV, messages);
}

function tableExists(d, name) {
  const r = d
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
    .get(name);
  return !!r;
}

/**
 * pm_cycle_allocations.bill_id may reference deleted bills; clear FK orphans (bill_id → NULL).
 */
function repairPmCycleAllocationOrphanBills(d, messages) {
  try {
    if (!tableExists(d, 'pm_cycle_allocations') || !tableExists(d, 'bills')) return;
    const stmt = d.prepare(`
      UPDATE pm_cycle_allocations
      SET bill_id = NULL, updated_at = datetime('now')
      WHERE bill_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM bills WHERE bills.id = pm_cycle_allocations.bill_id)
    `);
    const r = stmt.run();
    if (r.changes > 0) {
      const msg = `Cleared orphan bill_id on ${r.changes} pm_cycle_allocations row(s) (referenced bills were missing)`;
      messages.push(msg);
      log(msg);
    }
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    messages.push(`Could not repair pm_cycle_allocations orphan bill_id: ${m}`);
    warn(`repairPmCycleAllocationOrphanBills: ${m}`);
  }
}

function addMissingColumns(d, expectedTables, warnings) {
  for (const [tableName, spec] of Object.entries(expectedTables)) {
    if (!tableExists(d, tableName)) continue;
    const existing = d.prepare(`PRAGMA table_info("${tableName}")`).all();
    const byName = new Map(existing.map((c) => [c.name, c]));
    for (const col of spec.columns) {
      if (byName.has(col.name)) continue;
      const def = col.raw || `${col.typeToken || 'TEXT'}`;
      try {
        d.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${def}`);
        log(`Added missing column: ${tableName}.${col.name}`);
      } catch (e) {
        warnings.push(`Could not add column ${tableName}.${col.name}: ${e && e.message}`);
      }
    }
  }
}

function validateColumns(d, expectedTables, warnings) {
  for (const [tableName, spec] of Object.entries(expectedTables)) {
    if (!tableExists(d, tableName)) {
      warnings.push(`Missing table (expected by schema): ${tableName}`);
      continue;
    }
    const existing = d.prepare(`PRAGMA table_info("${tableName}")`).all();
    const byName = new Map(existing.map((c) => [c.name, c]));
    for (const col of spec.columns) {
      const row = byName.get(col.name);
      if (!row) {
        warnings.push(`Column missing: ${tableName}.${col.name}`);
        continue;
      }
      if (col.typeToken && !typesCompatible(col.typeToken, row.type)) {
        warnings.push(
          `Type mismatch ${tableName}.${col.name}: expected ~${col.typeToken}, found ${row.type} (review migration)`
        );
      }
      if (col.notnull && !row.notnull) {
        warnings.push(
          `NOT NULL mismatch ${tableName}.${col.name}: expected NOT NULL, column allows NULL (non-destructive; review migration)`
        );
      }
      if (col.pk && !row.pk) {
        warnings.push(
          `PRIMARY KEY mismatch ${tableName}.${col.name}: expected PK (non-destructive; review migration)`
        );
      }
    }
  }
}

function ensureIndexesFromSchema(d, indexStatements, messages) {
  for (const stmt of indexStatements) {
    try {
      d.exec(stmt);
    } catch (e) {
      if (!String(e.message).includes('already exists')) {
        messages.push(`Index statement skipped: ${String(e.message).slice(0, 120)}`);
      }
    }
  }
}

function listIndexesForTable(d, tableName) {
  try {
    return d.prepare(`PRAGMA index_list("${tableName}")`).all();
  } catch (_) {
    return [];
  }
}

function validateIndexPresence(d, expectedTables, warnings) {
  for (const tableName of Object.keys(expectedTables)) {
    if (!tableExists(d, tableName)) continue;
    const idx = listIndexesForTable(d, tableName);
    if (idx.length === 0 && tableName !== 'schema_meta' && tableName !== 'metadata') {
      /* optional: warn only for large tables — skip noise */
    }
  }
}

function sampleOrphanForeignKeys(d, maxSamples) {
  const samples = [];
  const tables = d
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);

  for (const tableName of tables) {
    let fkList;
    try {
      fkList = d.prepare(`PRAGMA foreign_key_list("${tableName}")`).all();
    } catch (_) {
      continue;
    }
    for (const fk of fkList) {
      const parentTable = fk.table;
      const fromCol = fk.from;
      const toCol = fk.to || 'id';
      if (!fromCol || !parentTable) continue;
      if (!tableExists(d, parentTable)) {
        samples.push({ table: tableName, detail: `FK references missing parent table ${parentTable}` });
        if (samples.length >= maxSamples) return samples;
        continue;
      }
      try {
        const sql = `
          SELECT c."${fromCol}" AS v FROM "${tableName}" c
          LEFT JOIN "${parentTable}" p ON c."${fromCol}" = p."${toCol}"
          WHERE c."${fromCol}" IS NOT NULL AND c."${fromCol}" != ''
            AND p."${toCol}" IS NULL
          LIMIT 3
        `;
        const bad = d.prepare(sql).all();
        for (const row of bad) {
          samples.push({
            table: tableName,
            detail: `orphan FK ${fromCol}=${row.v} → ${parentTable}.${toCol}`,
          });
          if (samples.length >= maxSamples) return samples;
        }
      } catch (e) {
        /* ignore complex FK */
      }
    }
  }
  return samples;
}

const CORE_TABLES = ['metadata', 'schema_meta', 'users', 'accounts', 'transactions'];

/**
 * @param {import('better-sqlite3').Database} d
 * @param {string | null} dbPath
 * @returns {SchemaHealth}
 */
function runStartupValidation(d, dbPath) {
  const messages = [];
  const warnings = [];
  const errors = [];
  const targetVersion = loadTargetVersion();

  d.pragma('foreign_keys = ON');

  let expectedTables = {};
  let indexStatements = [];
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    expectedTables = parseExpectedTables(schemaSql);
    indexStatements = extractIndexStatements(schemaSql);
  } catch (e) {
    errors.push(`Failed to read or parse schema.sql: ${e && e.message}`);
    return {
      level: 'error',
      readOnly: true,
      blocking: true,
      version: targetVersion,
      messages,
      warnings,
      errors,
      orphanFkSamples: [],
    };
  }

  ensureSchemaMetaTable(d);

  let metaVer = getMetadataSchemaVersion(d);
  let schemaMetaVer = getSchemaMetaVersion(d);
  if (schemaMetaVer === 0 && metaVer > 0) {
    setSchemaMetaVersion(d, metaVer);
    schemaMetaVer = metaVer;
    messages.push(`Initialized schema_meta.version from metadata (${metaVer})`);
  } else if (schemaMetaVer === 0) {
    setSchemaMetaVersion(d, targetVersion);
    schemaMetaVer = targetVersion;
    messages.push(`Initialized schema_meta.version to ${targetVersion}`);
  }

  const effectiveFrom = Math.min(
    metaVer > 0 ? metaVer : 1e9,
    schemaMetaVer > 0 ? schemaMetaVer : 1e9
  );
  const fromVersion = effectiveFrom >= 1e9 ? 0 : effectiveFrom;
  if (fromVersion < targetVersion) {
    const backupPath = backupDatabaseFile(dbPath);
    if (backupPath) messages.push(`Pre-migration backup: ${path.basename(backupPath)}`);
    runRegisteredMigrations(d, fromVersion, targetVersion, messages);
  }

  addMissingColumns(d, expectedTables, warnings);

  repairPmCycleAllocationOrphanBills(d, messages);

  for (const t of CORE_TABLES) {
    if (!tableExists(d, t)) {
      errors.push(`Critical: required table missing: ${t}`);
    }
  }

  validateColumns(d, expectedTables, warnings);
  ensureIndexesFromSchema(d, indexStatements, warnings);
  validateIndexPresence(d, expectedTables, warnings);

  const orphanFkSamples = sampleOrphanForeignKeys(d, 20);
  for (const o of orphanFkSamples) {
    warnings.push(`FK orphan: ${o.table} — ${o.detail}`);
  }

  setSchemaMetaVersion(d, targetVersion);
  syncMetadataSchemaVersion(d, targetVersion);

  const blocking = errors.length > 0;
  const level = blocking ? 'error' : warnings.length > 0 ? 'warning' : 'ok';
  const readOnly = blocking;

  if (level === 'ok') log(`Schema OK (version ${targetVersion})`);
  else if (level === 'warning') warn(`Schema warnings: ${warnings.length}`);
  else warn(`Schema errors: ${errors.length}`);

  return {
    level,
    readOnly,
    blocking,
    version: targetVersion,
    messages,
    warnings,
    errors,
    orphanFkSamples,
  };
}

module.exports = {
  runStartupValidation,
  parseExpectedTables,
  loadTargetVersion,
};

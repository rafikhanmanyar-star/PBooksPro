/**
 * Compare staging vs production cloud DBs, generate SQL to add missing tables/columns
 * to PRODUCTION so it matches staging. Additive only (no DROP/DELETE). Idempotent.
 *
 * Usage:
 *   npm run generate-production-upgrade   # generate SQL only
 *   npm run generate-production-upgrade -- --run   # generate and run on production (prompt)
 *
 * Requires: DATABASE_URL (staging), PRODUCTION_DATABASE_URL (production)
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, readFileSync } from 'fs';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });
dotenv.config({ path: resolve(__dirname, '../.env') });

const useSSL = (u: string) =>
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'staging' ||
  (u && u.includes('.render.com'));

interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
  characterMaximumLength: number | null;
}

async function getTables(pool: Pool): Promise<string[]> {
  const r = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return r.rows.map((row: { table_name: string }) => row.table_name);
}

async function getTableColumns(pool: Pool, tableName: string): Promise<ColumnInfo[]> {
  const r = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return r.rows.map((row: any) => ({
    columnName: row.column_name,
    dataType: row.data_type,
    isNullable: row.is_nullable,
    columnDefault: row.column_default,
    characterMaximumLength: row.character_maximum_length,
  }));
}

function pgType(col: ColumnInfo): string {
  let t = col.dataType.toUpperCase();
  if (col.characterMaximumLength && (t.includes('CHAR') || t.includes('VARCHAR')))
    t = `VARCHAR(${col.characterMaximumLength})`;
  if (t === 'CHARACTER VARYING') t = col.characterMaximumLength ? `VARCHAR(${col.characterMaximumLength})` : 'TEXT';
  return t;
}

async function getReferencedTables(pool: Pool, tableName: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT ccu.table_name AS ref_table
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
    [tableName]
  );
  return r.rows.map((row: { ref_table: string }) => row.ref_table);
}

function topologicalSort(tables: string[], deps: Map<string, string[]>): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  const temp = new Set<string>();

  function visit(t: string) {
    if (temp.has(t)) throw new Error(`Cycle involving table ${t}`);
    if (visited.has(t)) return;
    temp.add(t);
    for (const ref of deps.get(t) || []) {
      if (tables.includes(ref)) visit(ref);
    }
    temp.delete(t);
    visited.add(t);
    order.push(t);
  }

  for (const t of tables) visit(t);
  return order;
}

async function getTableDefinition(pool: Pool, tableName: string): Promise<string> {
  const columns = await getTableColumns(pool, tableName);
  const pkR = await pool.query(
    `SELECT kcu.column_name FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [tableName]
  );
  const pks = pkR.rows.map((row: { column_name: string }) => row.column_name);

  const fkR = await pool.query(
    `SELECT kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name, rc.delete_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
    [tableName]
  );

  const uqR = await pool.query(
    `SELECT kcu.column_name, tc.constraint_name FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE' AND tc.constraint_name NOT LIKE '%_pkey'`,
    [tableName]
  );

  const chkR = await pool.query(
    `SELECT constraint_name, check_clause FROM information_schema.check_constraints
     WHERE constraint_name IN (
       SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = $1 AND constraint_type = 'CHECK'
     ) AND check_clause NOT LIKE '%IS NOT NULL%'`,
    [tableName]
  );

  const idxR = await pool.query(
    `SELECT i.indexdef FROM pg_indexes i
     WHERE i.schemaname = 'public' AND i.tablename = $1 AND i.indexname NOT LIKE '%_pkey'
     AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = i.indexname)`,
    [tableName]
  );

  const colDefs = columns.map(
    (c) =>
      `    ${c.columnName} ${pgType(c)}${c.isNullable === 'NO' ? ' NOT NULL' : ''}${c.columnDefault ? ` DEFAULT ${c.columnDefault}` : ''}`
  );
  let sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n${colDefs.join(',\n')}`;
  if (pks.length) sql += `,\n    PRIMARY KEY (${pks.join(', ')})`;
  sql += '\n);\n';

  for (const fk of fkR.rows) {
    const dr = fk.delete_rule === 'CASCADE' ? 'ON DELETE CASCADE' : fk.delete_rule === 'SET NULL' ? 'ON DELETE SET NULL' : fk.delete_rule === 'RESTRICT' ? 'ON DELETE RESTRICT' : '';
    const cn = `${tableName}_${fk.column_name}_fkey`;
    sql += `\nDO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${cn}') THEN\n`;
    sql += `    ALTER TABLE ${tableName} ADD CONSTRAINT ${cn} FOREIGN KEY (${fk.column_name}) REFERENCES ${fk.foreign_table_name}(${fk.foreign_column_name}) ${dr};\n`;
    sql += `  END IF;\nEND $$;\n`;
  }

  const uqGroups = new Map<string, string[]>();
  for (const uq of uqR.rows) {
    if (!uqGroups.has(uq.constraint_name)) uqGroups.set(uq.constraint_name, []);
    uqGroups.get(uq.constraint_name)!.push(uq.column_name);
  }
  for (const [cn, cols] of uqGroups) {
    sql += `\nDO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${cn}') THEN\n`;
    sql += `    ALTER TABLE ${tableName} ADD CONSTRAINT ${cn} UNIQUE (${cols.join(', ')});\n  END IF;\nEND $$;\n`;
  }

  const seen = new Set<string>();
  for (const chk of chkR.rows) {
    if (seen.has(chk.constraint_name)) continue;
    seen.add(chk.constraint_name);
    sql += `\nDO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${chk.constraint_name}') THEN\n`;
    sql += `    ALTER TABLE ${tableName} ADD CONSTRAINT ${chk.constraint_name} CHECK (${chk.check_clause});\n  END IF;\nEND $$;\n`;
  }

  for (const idx of idxR.rows) {
    sql += `\n${(idx.indexdef as string).replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS')};\n`;
  }

  return sql;
}

function defaultForType(col: ColumnInfo): string {
  const t = (col.dataType || '').toLowerCase();
  if (t.includes('int') || t === 'decimal' || t === 'numeric' || t === 'real' || t === 'double') return '0';
  if (t === 'boolean') return 'false';
  if (t === 'date') return 'CURRENT_DATE';
  if (t.includes('timestamp')) return 'NOW()';
  if (t.includes('char') || t === 'text') return "''";
  if (t === 'jsonb' || t === 'json') return "'{}'::jsonb";
  return 'NULL';
}

function generateAlterColumns(tableName: string, missing: ColumnInfo[]): string[] {
  const out: string[] = [];
  for (const col of missing) {
    const typ = pgType(col);
    const notNull = col.isNullable === 'NO';
    let def = '';
    if (col.columnDefault) def = ` DEFAULT ${col.columnDefault}`;
    else if (notNull) def = ` DEFAULT ${defaultForType(col)}`;
    const nn = notNull ? ' NOT NULL' : '';
    out.push(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${col.columnName} ${typ}${def}${nn};`);
  }
  return out;
}

async function main() {
  const runIt = process.argv.includes('--run');
  const stagingUrl = process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL;
  const prodUrl = process.env.PRODUCTION_DATABASE_URL;

  if (!stagingUrl) {
    console.error('DATABASE_URL or STAGING_DATABASE_URL is not set');
    process.exit(1);
  }
  if (!prodUrl) {
    console.error('PRODUCTION_DATABASE_URL is not set');
    process.exit(1);
  }

  const staging = new Pool({
    connectionString: stagingUrl,
    ssl: useSSL(stagingUrl) ? { rejectUnauthorized: false } : false,
  });
  const prod = new Pool({
    connectionString: prodUrl,
    ssl: useSSL(prodUrl) ? { rejectUnauthorized: false } : false,
  });

  try {
    await staging.query('SELECT 1');
    await prod.query('SELECT 1');
    console.log('Connected to staging and production.\n');

    const stagingTables = await getTables(staging);
    const prodTables = await getTables(prod);
    const prodSet = new Set(prodTables);
    const stagingSet = new Set(stagingTables);

    const missingTablesInProd = stagingTables.filter((t) => !prodSet.has(t));
    const extraInProd = prodTables.filter((t) => !stagingSet.has(t));

    console.log('=== COMPARISON (staging vs production) ===');
    console.log(`Staging: ${stagingTables.length} tables, Production: ${prodTables.length} tables`);

    if (missingTablesInProd.length) {
      console.log('\nTables in STAGING but MISSING in PRODUCTION:');
      missingTablesInProd.forEach((t) => console.log(`  - ${t}`));
    }
    if (extraInProd.length) {
      console.log('\nTables in PRODUCTION but not in staging (legacy, unchanged):');
      extraInProd.forEach((t) => console.log(`  - ${t}`));
    }

    const common = stagingTables.filter((t) => prodSet.has(t));
    const columnDiffs: { table: string; missingInProd: ColumnInfo[] }[] = [];

    for (const table of common) {
      const [sCols, pCols] = await Promise.all([getTableColumns(staging, table), getTableColumns(prod, table)]);
      const pColSet = new Set(pCols.map((c) => c.columnName));
      const missing = sCols.filter((c) => !pColSet.has(c.columnName));
      if (missing.length) columnDiffs.push({ table, missingInProd: missing });
    }

    if (columnDiffs.length) {
      console.log('\nColumns in STAGING but MISSING in PRODUCTION:');
      for (const d of columnDiffs) {
        console.log(`  ${d.table}: ${d.missingInProd.map((c) => c.columnName).join(', ')}`);
      }
    }

    const lines: string[] = [];
    lines.push('-- Production upgrade: add missing tables/columns from STAGING');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('-- Additive only. Idempotent. Safe to re-run.');
    lines.push('');
    lines.push('BEGIN;');
    lines.push('');

    let tablesCreated = 0;
    let columnsAdded = 0;

    if (missingTablesInProd.length) {
      let ordered: string[];
      try {
        const deps = new Map<string, string[]>();
        for (const t of missingTablesInProd) {
          const refs = await getReferencedTables(staging, t);
          deps.set(t, refs);
        }
        ordered = topologicalSort(missingTablesInProd, deps);
      } catch {
        ordered = [...missingTablesInProd].sort();
      }

      lines.push('-- ========== MISSING TABLES (create from staging) ==========');
      for (const tableName of ordered) {
        try {
          const def = await getTableDefinition(staging, tableName);
          lines.push(`-- Table: ${tableName}`);
          lines.push(def);
          lines.push('');
          tablesCreated++;
        } catch (e: any) {
          console.warn(`Could not generate definition for ${tableName}:`, e.message);
          lines.push(`-- ERROR: ${tableName} - ${e.message}`);
          lines.push('');
        }
      }
    }

    lines.push('-- ========== MISSING COLUMNS (add to production) ==========');
    for (const d of columnDiffs) {
      const stmts = generateAlterColumns(d.table, d.missingInProd);
      if (stmts.length) {
        lines.push(`-- ${d.table}: ${d.missingInProd.map((c) => c.columnName).join(', ')}`);
        lines.push(...stmts);
        lines.push('');
        columnsAdded += stmts.length;
      }
    }

    if (!tablesCreated && !columnsAdded) {
      lines.push('-- No schema changes needed; production matches staging.');
    }

    lines.push('COMMIT;');
    lines.push('');
    lines.push('-- End of migration.');

    const outPath = resolve(__dirname, '../migrations/production-upgrade-from-staging.sql');
    writeFileSync(outPath, lines.join('\n'));

    console.log('\n=== GENERATED ===');
    console.log(`Migration written to: ${outPath}`);
    console.log(`  Tables to create: ${tablesCreated}`);
    console.log(`  Columns to add:   ${columnsAdded}`);

    if (runIt && (tablesCreated || columnsAdded)) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((res) => {
        rl.question('\nRun this migration on PRODUCTION now? [y/N] ', res);
      });
      rl.close();
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        console.log('Executing migration on production...');
        const sql = readFileSync(outPath, 'utf8');
        await prod.query(sql);
        console.log('Done. Production schema updated.');
      } else {
        console.log('Skipped. Run manually: psql $PRODUCTION_DATABASE_URL -f server/migrations/production-upgrade-from-staging.sql');
      }
    } else if (tablesCreated || columnsAdded) {
      console.log('\nNext:');
      console.log('  1. Review the SQL file.');
      console.log('  2. Backup production DB.');
      console.log('  3. Run: psql $PRODUCTION_DATABASE_URL -f server/migrations/production-upgrade-from-staging.sql');
      console.log('  Or: npm run generate-production-upgrade -- --run');
    }
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await staging.end();
    await prod.end();
  }
}

main();

/**
 * Remove from PRODUCTION the columns that exist in production but NOT in staging.
 * Use after verify-schema-parity to make production column set match staging (drops legacy columns).
 *
 * Requires: DATABASE_URL (staging), PRODUCTION_DATABASE_URL (production)
 *
 * Usage:
 *   npm run drop-production-only-columns              # Dry run: generate SQL only
 *   npm run drop-production-only-columns -- --run    # Generate SQL and prompt to execute on production
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

const shouldUseSSL = (url: string) =>
  process.env.NODE_ENV === 'production' ||
  process.env.NODE_ENV === 'staging' ||
  (url && url.includes('.render.com'));

async function getTables(pool: Pool): Promise<string[]> {
  const r = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return r.rows.map((row: { table_name: string }) => row.table_name);
}

async function getColumns(pool: Pool, table: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map((row: { column_name: string }) => row.column_name);
}

async function main() {
  const runIt = process.argv.includes('--run');
  const stagingUrl = process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL;
  const prodUrl = process.env.PRODUCTION_DATABASE_URL;

  if (!stagingUrl) {
    console.error('❌ DATABASE_URL or STAGING_DATABASE_URL is not set');
    process.exit(1);
  }
  if (!prodUrl) {
    console.error('❌ PRODUCTION_DATABASE_URL is not set');
    process.exit(1);
  }

  const stagingPool = new Pool({
    connectionString: stagingUrl,
    ssl: shouldUseSSL(stagingUrl) ? { rejectUnauthorized: false } : false,
  });
  const prodPool = new Pool({
    connectionString: prodUrl,
    ssl: shouldUseSSL(prodUrl) ? { rejectUnauthorized: false } : false,
  });

  try {
    await stagingPool.query('SELECT 1');
    await prodPool.query('SELECT 1');
    console.log('✅ Connected to staging and production\n');

    const stagingTables = await getTables(stagingPool);
    const prodTables = await getTables(prodPool);
    const commonTables = stagingTables.filter((t) => new Set(prodTables).has(t));

    const tableToExtraColumns: { table: string; columns: string[] }[] = [];

    for (const table of commonTables) {
      const [stagingCols, prodCols] = await Promise.all([
        getColumns(stagingPool, table),
        getColumns(prodPool, table),
      ]);
      const stagingSet = new Set(stagingCols);
      const extraInProd = prodCols.filter((c) => !stagingSet.has(c));
      if (extraInProd.length > 0) {
        tableToExtraColumns.push({ table, columns: extraInProd });
      }
    }

    if (tableToExtraColumns.length === 0) {
      console.log('✅ No extra columns in production. Nothing to drop.\n');
      return;
    }

    console.log('📋 Columns in PRODUCTION but not in STAGING (will be dropped from production):');
    for (const { table, columns } of tableToExtraColumns) {
      console.log(`   ${table}: ${columns.join(', ')}`);
    }
    console.log('');

    const lines: string[] = [];
    lines.push('-- Drop columns that exist in production but not in staging');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('-- DESTRUCTIVE: Backup production before running. Data in these columns will be lost.');
    lines.push('');
    lines.push('BEGIN;');
    lines.push('');

    for (const { table, columns } of tableToExtraColumns) {
      const drops = columns.map((c) => `DROP COLUMN IF EXISTS "${c}"`).join(', ');
      lines.push(`ALTER TABLE public.${table} ${drops};`);
    }

    lines.push('');
    lines.push('COMMIT;');
    lines.push('');
    lines.push('-- End of script.');

    const outPath = resolve(__dirname, '../migrations/drop-production-only-columns.sql');
    writeFileSync(outPath, lines.join('\n'));

    const totalColumns = tableToExtraColumns.reduce((n, { columns }) => n + columns.length, 0);
    console.log(`📄 SQL written to: ${outPath}`);
    console.log(`   Tables affected: ${tableToExtraColumns.length}, columns to drop: ${totalColumns}\n`);

    if (runIt) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((res) => {
        rl.question(
          '⚠️  Run this script on PRODUCTION now? This will DROP the columns above. Type "yes" to confirm: ',
          res
        );
      });
      rl.close();
      if (answer.trim().toLowerCase() === 'yes') {
        console.log('Executing on production...');
        const sql = readFileSync(outPath, 'utf8');
        await prodPool.query(sql);
        console.log('✅ Done. Extra columns dropped from production.');
      } else {
        console.log('Skipped. Run manually when ready:');
        console.log(`   psql $PRODUCTION_DATABASE_URL -f server/migrations/drop-production-only-columns.sql`);
      }
    } else {
      console.log('Dry run. To execute on production:');
      console.log('   npm run drop-production-only-columns -- --run');
      console.log('   Or: psql $PRODUCTION_DATABASE_URL -f server/migrations/drop-production-only-columns.sql');
    }
  } catch (e: any) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  } finally {
    await stagingPool.end();
    await prodPool.end();
  }
}

main();

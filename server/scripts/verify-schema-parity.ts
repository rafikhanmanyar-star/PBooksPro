/**
 * Verify schema parity between staging and production databases.
 * Compares tables and columns; reports missing tables/columns in production vs staging.
 * Use before and after production upgrade to ensure no schema drift.
 *
 * Requires: DATABASE_URL (staging), PRODUCTION_DATABASE_URL (production)
 * Usage: npm run verify-schema-parity
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

async function getColumns(
  pool: Pool,
  table: string
): Promise<{ column_name: string; data_type: string; is_nullable: string }[]> {
  const r = await pool.query(
    `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [table]
  );
  return r.rows;
}

async function main() {
  const stagingUrl = process.env.DATABASE_URL || process.env.STAGING_DATABASE_URL;
  const prodUrl = process.env.PRODUCTION_DATABASE_URL;

  if (!stagingUrl) {
    console.error('❌ DATABASE_URL or STAGING_DATABASE_URL is not set');
    process.exit(1);
  }
  if (!prodUrl) {
    console.error('❌ PRODUCTION_DATABASE_URL is not set');
    console.log('   Set it in .env to compare staging vs production schema.');
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

    const stagingSet = new Set(stagingTables);
    const prodSet = new Set(prodTables);

    const missingInProd = stagingTables.filter((t) => !prodSet.has(t));
    const extraInProd = prodTables.filter((t) => !stagingSet.has(t));

    let hasDiff = false;

    if (missingInProd.length > 0) {
      hasDiff = true;
      console.log('❌ TABLES IN STAGING BUT MISSING IN PRODUCTION:');
      missingInProd.forEach((t) => console.log(`   - ${t}`));
      console.log('');
    }

    if (extraInProd.length > 0) {
      console.log('ℹ️  TABLES IN PRODUCTION BUT NOT IN STAGING (ok if legacy):');
      extraInProd.forEach((t) => console.log(`   - ${t}`));
      console.log('');
    }

    const common = stagingTables.filter((t) => prodSet.has(t));
    const columnDiffs: { table: string; missingInProd: string[]; extraInProd: string[] }[] = [];

    for (const table of common) {
      const [stagingCols, prodCols] = await Promise.all([
        getColumns(stagingPool, table),
        getColumns(prodPool, table),
      ]);
      const stagingColNames = new Set(stagingCols.map((c) => c.column_name));
      const prodColNames = new Set(prodCols.map((c) => c.column_name));

      const missingInProdCols = stagingCols
        .filter((c) => !prodColNames.has(c.column_name))
        .map((c) => c.column_name);
      const extraInProdCols = prodCols
        .filter((c) => !stagingColNames.has(c.column_name))
        .map((c) => c.column_name);

      if (missingInProdCols.length > 0 || extraInProdCols.length > 0) {
        columnDiffs.push({
          table,
          missingInProd: missingInProdCols,
          extraInProd: extraInProdCols,
        });
      }
    }

    if (columnDiffs.length > 0) {
      hasDiff = true;
      console.log('❌ COLUMN DIFFERENCES (staging vs production):');
      for (const d of columnDiffs) {
        if (d.missingInProd.length > 0) {
          console.log(`   ${d.table}: missing in production: ${d.missingInProd.join(', ')}`);
        }
        if (d.extraInProd.length > 0) {
          console.log(`   ${d.table}: extra in production (ok if legacy): ${d.extraInProd.join(', ')}`);
        }
      }
      console.log('');
    }

    if (!hasDiff && missingInProd.length === 0) {
      console.log('✅ Schema parity OK: staging and production have the same tables and columns.\n');
    } else if (missingInProd.length > 0 || columnDiffs.some((d) => d.missingInProd.length > 0)) {
      console.log(
        '⚠️  Production is missing tables or columns present in staging. Run migrations on production (deploy from staging/main).\n'
      );
      process.exit(1);
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

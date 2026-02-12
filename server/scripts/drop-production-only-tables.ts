/**
 * Remove from PRODUCTION the tables that exist in production but NOT in staging.
 * Use after verify-schema-parity to clean legacy/extra tables from production.
 *
 * Requires: DATABASE_URL (staging), PRODUCTION_DATABASE_URL (production)
 *
 * Usage:
 *   npm run drop-production-only-tables              # Dry run: generate SQL only
 *   npm run drop-production-only-tables -- --run    # Generate SQL and prompt to execute on production
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
    const stagingSet = new Set(stagingTables);

    const extraInProd = prodTables.filter((t) => !stagingSet.has(t));

    if (extraInProd.length === 0) {
      console.log('✅ No extra tables in production. Nothing to drop.\n');
      return;
    }

    console.log('📋 Tables in PRODUCTION but not in STAGING (will be dropped from production):');
    extraInProd.forEach((t) => console.log(`   - ${t}`));
    console.log('');

    const lines: string[] = [];
    lines.push('-- Drop tables that exist in production but not in staging');
    lines.push(`-- Generated: ${new Date().toISOString()}`);
    lines.push('-- DESTRUCTIVE: Backup production before running.');
    lines.push('-- Uses CASCADE to drop dependent objects (e.g. FKs, views).');
    lines.push('');
    lines.push('BEGIN;');
    lines.push('');

    for (const table of extraInProd) {
      lines.push(`DROP TABLE IF EXISTS public.${table} CASCADE;`);
    }

    lines.push('');
    lines.push('COMMIT;');
    lines.push('');
    lines.push('-- End of script.');

    const outPath = resolve(__dirname, '../migrations/drop-production-only-tables.sql');
    writeFileSync(outPath, lines.join('\n'));

    console.log(`📄 SQL written to: ${outPath}`);
    console.log(`   Tables to drop: ${extraInProd.length}\n`);

    if (runIt) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise<string>((res) => {
        rl.question(
          '⚠️  Run this script on PRODUCTION now? This will DROP the tables above. Type "yes" to confirm: ',
          res
        );
      });
      rl.close();
      if (answer.trim().toLowerCase() === 'yes') {
        console.log('Executing on production...');
        const sql = readFileSync(outPath, 'utf8');
        await prodPool.query(sql);
        console.log('✅ Done. Extra tables dropped from production.');
      } else {
        console.log('Skipped. Run manually when ready:');
        console.log(`   psql $PRODUCTION_DATABASE_URL -f server/migrations/drop-production-only-tables.sql`);
      }
    } else {
      console.log('Dry run. To execute on production:');
      console.log('   npm run drop-production-only-tables -- --run');
      console.log('   Or: psql $PRODUCTION_DATABASE_URL -f server/migrations/drop-production-only-tables.sql');
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

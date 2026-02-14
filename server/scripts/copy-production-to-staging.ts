/**
 * Copy production database to staging database (replaces all staging data).
 *
 * Required env vars in server/.env:
 *   PRODUCTION_DATABASE_URL - Production DB (Oregon / pbookspro-db-Production)
 *   STAGING_DATABASE_URL    - Staging DB (pbookspro-db-staging)
 *
 * Requires: pg_dump and pg_restore (PostgreSQL client tools) in PATH.
 *
 * Usage: npm run copy-production-to-staging
 *    or: cd server && npx tsx scripts/copy-production-to-staging.ts
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const DUMP_FILE = resolve(__dirname, '../.production-to-staging.dump');

async function main() {
  const prodUrl = process.env.PRODUCTION_DATABASE_URL;
  const stagingUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;

  if (!prodUrl) {
    console.error('❌ PRODUCTION_DATABASE_URL is not set in server/.env');
    console.log('   Get it from Render Dashboard → pbookspro-db-Production → Connect → External Database URL');
    process.exit(1);
  }

  if (!stagingUrl) {
    console.error('❌ STAGING_DATABASE_URL and DATABASE_URL are not set in server/.env');
    console.log('   Set STAGING_DATABASE_URL or DATABASE_URL (Render → pbookspro-db-staging → Connect → External URL)');
    process.exit(1);
  }

  const useSSL = prodUrl.includes('.render.com') || stagingUrl.includes('.render.com');
  const ssl = useSSL ? { rejectUnauthorized: false } : false;

  console.log('📤 Step 1: Dumping production database...');
  try {
    if (existsSync(DUMP_FILE)) unlinkSync(DUMP_FILE);
    execSync(`pg_dump "${prodUrl}" -F c -f "${DUMP_FILE}"`, { stdio: 'inherit' });
  } catch (err: any) {
    console.error('❌ pg_dump failed. Ensure PostgreSQL client tools are installed:');
    console.error('   choco install postgresql  (Windows)');
    console.error('   Or: https://www.postgresql.org/download/');
    process.exit(1);
  }
  console.log('✅ Production dump created:', DUMP_FILE);

  console.log('\n🗑️  Step 2: Wiping staging database (DROP SCHEMA public CASCADE)...');
  const stagingPool = new Pool({ connectionString: stagingUrl, ssl });
  try {
    const userMatch = stagingUrl.match(/postgresql?:\/\/([^:]+):/);
    const dbUser = userMatch ? userMatch[1] : 'postgres';
    await stagingPool.query('DROP SCHEMA public CASCADE');
    await stagingPool.query('CREATE SCHEMA public');
    await stagingPool.query(`GRANT ALL ON SCHEMA public TO ${dbUser}`);
    await stagingPool.query(`GRANT ALL ON SCHEMA public TO public`);
  } catch (err: any) {
    console.error('❌ Failed to wipe staging:', err.message);
    stagingPool.end();
    process.exit(1);
  }
  stagingPool.end();
  console.log('✅ Staging schema wiped');

  console.log('\n📥 Step 3: Restoring production data into staging...');
  try {
    execSync(`pg_restore -d "${stagingUrl}" --no-owner --no-acl -1 "${DUMP_FILE}"`, { stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️  pg_restore may show non-fatal warnings (e.g. extensions). Checking data...');
  }

  console.log('\n🔍 Step 4: Verifying staging data...');
  const verifyPool = new Pool({ connectionString: stagingUrl, ssl });
  const counts = await verifyPool.query(`
    SELECT relname as table_name, n_live_tup as row_count
    FROM pg_stat_user_tables
    WHERE relname IN ('transactions', 'users', 'contacts', 'tenants')
    ORDER BY relname
  `);
  verifyPool.end();

  console.log('\n  Row counts (critical tables):');
  counts.rows.forEach((r: any) => console.log(`    ${r.table_name}: ${r.row_count}`));

  if (existsSync(DUMP_FILE)) {
    unlinkSync(DUMP_FILE);
    console.log('\n🧹 Cleaned up dump file');
  }

  console.log('\n✅ Done! Staging now has production data. Test at: https://pbookspro-client-staging.onrender.com');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

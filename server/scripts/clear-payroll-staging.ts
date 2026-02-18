/**
 * Clear Payroll Tables in Staging DB
 *
 * Removes all payroll data to test the payroll system from scratch:
 * - Transaction rows linked to payslips
 * - Payslips
 * - Payroll runs
 * - Payroll employees
 * - Payroll departments
 * - Payroll grades
 * - Payroll salary components
 *
 * Usage:
 *   cd server && npx tsx scripts/clear-payroll-staging.ts
 *
 * Requires DATABASE_URL in server/.env (use staging DB URL).
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

const PAYROLL_TABLES = [
  { table: 'transactions', where: 'payslip_id IS NOT NULL', label: 'Payroll-linked transactions' },
  { table: 'payslips', where: null, label: 'Payslips' },
  { table: 'payroll_runs', where: null, label: 'Payroll runs' },
  { table: 'payroll_employees', where: null, label: 'Payroll employees' },
  { table: 'payroll_departments', where: null, label: 'Payroll departments' },
  { table: 'payroll_grades', where: null, label: 'Payroll grades' },
  { table: 'payroll_salary_components', where: null, label: 'Payroll salary components' },
] as const;

async function clearPayrollStaging() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set. Create server/.env with DATABASE_URL for staging DB.');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  const isStaging =
    dbUrl.includes('staging') || dbUrl.includes('_staging') || process.env.NODE_ENV === 'staging';

  if (!isStaging) {
    console.warn('⚠️  WARNING: DATABASE_URL does not appear to be staging!');
    console.warn('   URL:', dbUrl.replace(/:[^:@]+@/, ':****@'));
    const confirm = await question('\n   Continue anyway? (type "yes"): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled');
      process.exit(0);
    }
  }

  console.log('\n🔍 Connecting to database...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('.render.com') ? { rejectUnauthorized: false } : false,
  });

  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected\n');

    console.log('📊 Current row counts:');
    for (const { table, where, label } of PAYROLL_TABLES) {
      try {
        const sql = where ? `SELECT COUNT(*) FROM ${table} WHERE ${where}` : `SELECT COUNT(*) FROM ${table}`;
        const r = await pool.query(sql);
        console.log(`   ${table}: ${r.rows[0].count} rows`);
      } catch (e: any) {
        if (e.code === '42P01') {
          console.log(`   ${table}: (table missing)`);
        } else {
          throw e;
        }
      }
    }

    const confirm = await question('\n   Clear all payroll data? (type "CLEAR"): ');
    if (confirm !== 'CLEAR') {
      console.log('❌ Cancelled');
      process.exit(0);
    }

    console.log('\n🧹 Clearing payroll tables...\n');

    for (const { table, where, label } of PAYROLL_TABLES) {
      try {
        const sql = where ? `DELETE FROM ${table} WHERE ${where}` : `DELETE FROM ${table}`;
        const r = await pool.query(sql);
        console.log(`   ✅ ${label}: ${r.rowCount ?? 0} rows deleted`);
      } catch (e: any) {
        if (e.code === '42P01') {
          console.log(`   ⏭️  ${table}: skipped (table missing)`);
        } else {
          console.error(`   ❌ ${table}:`, e.message);
          throw e;
        }
      }
    }

    console.log('\n✅ Payroll tables cleared. Ready for fresh payroll testing.');
  } catch (e: any) {
    console.error('\n❌ Error:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
    rl.close();
  }
}

clearPayrollStaging().then(() => process.exit(0)).catch(() => process.exit(1));

/**
 * Cleanup Other Tenants - Delete ALL data except Admin@RKBuilders.com
 * Tenant to KEEP: tenant_1767873389330_fce675e2
 *
 * Usage:
 *   cd server && npx tsx scripts/cleanup-other-tenants.ts --production
 *   cd server && npx tsx scripts/cleanup-other-tenants.ts --staging
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const TENANT_TO_KEEP = 'tenant_1767873389330_fce675e2';
const TENANT_LABEL = 'Admin@RKBuilders.com';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

function getTargetDatabase(): { url: string; env: string } {
  const args = process.argv.slice(2);

  if (args.includes('--production')) {
    const url = process.env.PRODUCTION_DATABASE_URL;
    if (!url) {
      console.error('❌ PRODUCTION_DATABASE_URL is not set in server/.env');
      process.exit(1);
    }
    return { url, env: 'PRODUCTION' };
  }

  if (args.includes('--staging')) {
    const url = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) {
      console.error('❌ STAGING_DATABASE_URL / DATABASE_URL is not set in server/.env');
      process.exit(1);
    }
    return { url, env: 'STAGING' };
  }

  console.error('❌ Please specify a target database:\n');
  console.error('   npx tsx scripts/cleanup-other-tenants.ts --production');
  console.error('   npx tsx scripts/cleanup-other-tenants.ts --staging');
  process.exit(1);
}

// Tables with tenant_id, ordered so child tables are deleted before parents
const TABLES_WITH_TENANT_ID = [
  // Payroll (leaf → parent)
  'payslips',
  'payroll_runs',
  'payroll_employees',
  'payroll_departments',
  'payroll_grades',
  'payroll_salary_components',

  // Sync & audit
  'sync_conflicts',
  'idempotency_cache',

  // Sessions
  'user_sessions',

  // Transactions (before accounts — RESTRICT FK)
  'transactions',
  'payments',

  // Investments (references projects, accounts)
  'investments',

  // Installment plans (references projects, contacts, units)
  'installment_plans',

  // Contracts & quotations (reference projects, vendors)
  'contracts',
  'quotations',

  // Bills & invoices (reference contacts, vendors, categories)
  'bills',
  'invoices',

  // Agreements
  'project_agreements',

  // Recurring templates
  'recurring_invoice_templates',

  // Real estate (units → properties → buildings, projects)
  'units',
  'properties',
  'buildings',
  'projects',

  // Marketing, inventory, WhatsApp
  'plan_amenities',
  'inventory_batches',
  'whatsapp_menu_sessions',
  'whatsapp_configs',

  // Settings & modules
  'app_settings',
  'tenant_modules',

  // Core reference tables
  'categories',
  'vendors',
  'contacts',
  'accounts',

  // License keys & users
  'license_keys',
  'users',
];

// rental_agreements uses org_id instead of tenant_id
const ORG_ID_TABLES = ['rental_agreements'];

// Tables that may or may not exist (created by later migrations)
const OPTIONAL_TABLES = [
  'budgets',
  'documents',
  'sales_returns',
  'pm_cycle_allocations',
  'whatsapp_messages',
  'purchase_orders',
  'p2p_invoices',
  'p2p_bills',
];

async function main() {
  const { url: dbUrl, env: targetEnv } = getTargetDatabase();
  const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');

  console.log('\n=========================================================');
  console.log(`  TENANT CLEANUP — ${targetEnv} DATABASE`);
  console.log('  DELETE ALL DATA EXCEPT ONE TENANT');
  console.log('=========================================================');
  console.log(`\n  Target:    ${targetEnv}`);
  console.log(`  Database:  ${maskedUrl}`);
  console.log(`  Keeping:   ${TENANT_TO_KEEP} (${TENANT_LABEL})`);
  console.log(`  Deleting:  EVERYTHING belonging to all other tenants`);
  console.log('');

  if (targetEnv === 'PRODUCTION') {
    console.log('  ⚠️  WARNING: YOU ARE TARGETING THE PRODUCTION DATABASE!\n');
  }

  const confirm1 = await question('  Type "yes" to continue: ');
  if (confirm1.toLowerCase() !== 'yes') {
    console.log('  ❌ Cancelled.');
    process.exit(0);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query('SELECT NOW()');
    console.log('\n  ✅ Connected to database\n');

    // Show tenant list before deletion
    console.log('  📋 Current tenants in database:');
    const tenantsResult = await pool.query(
      `SELECT id, email, company_name FROM tenants ORDER BY created_at`
    );
    for (const t of tenantsResult.rows) {
      const marker = t.id === TENANT_TO_KEEP ? '  ✅ KEEP' : '  ❌ DELETE';
      console.log(`    ${marker}  ${t.id}  (${t.email || t.company_name || 'no email'})`);
    }

    const tenantsToDelete = tenantsResult.rows.filter((t: any) => t.id !== TENANT_TO_KEEP);
    if (tenantsToDelete.length === 0) {
      console.log('\n  ✅ No other tenants found — nothing to delete.');
      await pool.end();
      rl.close();
      process.exit(0);
    }

    // Show counts of records that will be deleted
    console.log('\n  📊 Records that will be deleted:');
    let totalToDelete = 0;

    for (const table of TABLES_WITH_TENANT_ID) {
      try {
        const r = await pool.query(
          `SELECT count(*) as cnt FROM ${table} WHERE tenant_id != $1`,
          [TENANT_TO_KEEP]
        );
        const cnt = parseInt(r.rows[0].cnt);
        if (cnt > 0) {
          console.log(`    ${table}: ${cnt.toLocaleString()}`);
          totalToDelete += cnt;
        }
      } catch {
        // table may not exist
      }
    }
    for (const table of ORG_ID_TABLES) {
      try {
        const r = await pool.query(
          `SELECT count(*) as cnt FROM ${table} WHERE org_id != $1`,
          [TENANT_TO_KEEP]
        );
        const cnt = parseInt(r.rows[0].cnt);
        if (cnt > 0) {
          console.log(`    ${table}: ${cnt.toLocaleString()}`);
          totalToDelete += cnt;
        }
      } catch {
        // table may not exist
      }
    }
    for (const table of OPTIONAL_TABLES) {
      try {
        const r = await pool.query(
          `SELECT count(*) as cnt FROM ${table} WHERE tenant_id != $1`,
          [TENANT_TO_KEEP]
        );
        const cnt = parseInt(r.rows[0].cnt);
        if (cnt > 0) {
          console.log(`    ${table}: ${cnt.toLocaleString()}`);
          totalToDelete += cnt;
        }
      } catch {
        // table doesn't exist — fine
      }
    }

    console.log(`\n  Total records to delete: ${totalToDelete.toLocaleString()}`);
    console.log(`  Tenants to remove: ${tenantsToDelete.length}`);

    // Final confirmation
    console.log('\n  ⚠️  THIS IS IRREVERSIBLE!');
    const confirm2 = await question('  Type "DELETE ALL" to proceed: ');
    if (confirm2 !== 'DELETE ALL') {
      console.log('  ❌ Cancelled — confirmation did not match.');
      await pool.end();
      rl.close();
      process.exit(0);
    }

    console.log('\n  🔧 Starting cleanup...\n');

    // Bypass RLS and disable FK triggers for the session
    await pool.query(`SET session_replication_role = 'replica'`);
    await pool.query(`SET row_security = off`);

    // Begin transaction
    await pool.query('BEGIN');

    let success = 0;
    let skipped = 0;

    // Delete from tenant_id tables
    for (const table of TABLES_WITH_TENANT_ID) {
      try {
        const idCol = 'tenant_id';
        const r = await pool.query(
          `DELETE FROM ${table} WHERE ${idCol} != $1`,
          [TENANT_TO_KEEP]
        );
        const deleted = r.rowCount ?? 0;
        if (deleted > 0) {
          console.log(`    ✅ ${table}: ${deleted.toLocaleString()} rows deleted`);
        }
        success++;
      } catch (err: any) {
        console.log(`    ⚠️  ${table}: skipped (${err.message.split('\n')[0]})`);
        skipped++;
      }
    }

    // Delete from org_id tables
    for (const table of ORG_ID_TABLES) {
      try {
        const r = await pool.query(
          `DELETE FROM ${table} WHERE org_id != $1`,
          [TENANT_TO_KEEP]
        );
        const deleted = r.rowCount ?? 0;
        if (deleted > 0) {
          console.log(`    ✅ ${table}: ${deleted.toLocaleString()} rows deleted`);
        }
        success++;
      } catch (err: any) {
        console.log(`    ⚠️  ${table}: skipped (${err.message.split('\n')[0]})`);
        skipped++;
      }
    }

    // Delete from optional tables
    for (const table of OPTIONAL_TABLES) {
      try {
        const r = await pool.query(
          `DELETE FROM ${table} WHERE tenant_id != $1`,
          [TENANT_TO_KEEP]
        );
        const deleted = r.rowCount ?? 0;
        if (deleted > 0) {
          console.log(`    ✅ ${table}: ${deleted.toLocaleString()} rows deleted`);
        }
        success++;
      } catch {
        // table doesn't exist — silently skip
      }
    }

    // Delete tenant records themselves
    const tenantDel = await pool.query(
      `DELETE FROM tenants WHERE id != $1`,
      [TENANT_TO_KEEP]
    );
    console.log(`    ✅ tenants: ${(tenantDel.rowCount ?? 0).toLocaleString()} rows deleted`);

    await pool.query('COMMIT');

    // Restore normal behavior
    await pool.query(`SET session_replication_role = 'origin'`);

    // Verification
    console.log('\n  📊 Verification — remaining row counts:');
    const allTables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    for (const row of allTables.rows) {
      try {
        const r = await pool.query(`SELECT count(*) as cnt FROM ${row.table_name}`);
        const cnt = parseInt(r.rows[0].cnt);
        if (cnt > 0) {
          console.log(`    ${row.table_name}: ${cnt.toLocaleString()}`);
        }
      } catch {
        // skip
      }
    }

    console.log(`\n  ✅ Cleanup complete! Only ${TENANT_LABEL} (${TENANT_TO_KEEP}) data remains.`);
    console.log(`     Tables processed: ${success}, Skipped: ${skipped}\n`);

  } catch (err: any) {
    console.error(`\n  ❌ Error: ${err.message}`);
    try { await pool.query('ROLLBACK'); } catch {}
    process.exit(1);
  } finally {
    await pool.end();
    rl.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

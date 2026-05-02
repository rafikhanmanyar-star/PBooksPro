#!/usr/bin/env npx tsx
/**
 * Rebuild `payroll_transactions` for PostgreSQL tenants from payslips + salary expense txs.
 * Run once after migration `055_payroll_ledger_transactions.sql` (and whenever you want a full resync).
 *
 * From repo root (loads root `.env` via backend loadEnv):
 *   npm run db:backfill-payroll-ledger -- --tenant <tenantId>
 *   npm run db:backfill-payroll-ledger -- --all
 *   npm run db:backfill-payroll-ledger -- --all --dry-run
 */

import '../loadEnv.js';
import { getPool } from '../db/pool.js';
import { syncPayrollLedgerForAllEmployees } from '../services/payrollLedgerService.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const tenant = arg('--tenant');
  const all = process.argv.includes('--all');
  const dryRun = process.argv.includes('--dry-run');

  if ((!tenant && !all) || (tenant && all)) {
    console.error('Usage: --tenant <tenantId> | --all  [--dry-run]');
    process.exit(1);
  }

  const pool = getPool();

  const tenantIds: string[] = tenant
    ? [tenant]
    : (await pool.query<{ id: string }>(`SELECT id FROM tenants ORDER BY id`)).rows.map((r) => r.id);

  if (tenantIds.length === 0) {
    console.log('No tenants to process.');
    await pool.end();
    return;
  }

  for (const tid of tenantIds) {
    const c = await pool.connect();
    try {
      if (dryRun) {
        const ec = await c.query<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM payroll_employees WHERE tenant_id = $1 AND deleted_at IS NULL`,
          [tid]
        );
        const pt = await c.query<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM payroll_transactions WHERE tenant_id = $1`,
          [tid]
        );
        console.log(
          `[dry-run] tenant=${tid} payroll_employees=${ec.rows[0]?.c ?? 0} existing_ledger_rows=${pt.rows[0]?.c ?? 0}`
        );
        continue;
      }

      await c.query('BEGIN');
      const n = await syncPayrollLedgerForAllEmployees(c, tid);
      await c.query('COMMIT');
      console.log(`Synced tenant=${tid} employees_processed=${n}`);
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      console.error(`Failed tenant=${tid}:`, e instanceof Error ? e.message : e);
      process.exitCode = 1;
      break;
    } finally {
      c.release();
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

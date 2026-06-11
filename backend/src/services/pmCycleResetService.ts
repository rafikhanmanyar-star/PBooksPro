/**
 * Reset PM Cycle module data for one tenant (PostgreSQL / API database).
 *
 * Identifies PM bills by:
 * - `pm_cycle_allocations.bill_id` for the tenant, and
 * - `bills.bill_number LIKE 'PM-ALLOC-%'` for the tenant (matches app-generated PM fee bills).
 *
 * Deletes related `transactions` rows:
 * - `bill_id` in the PM bill set, plus any row sharing the same `batch_id` (equity pairs);
 * - **Orphan PM payments** the Fee Ledger still shows: descriptions containing `[PM-ALLOC-`
 *   (see `ProjectPMManager` ledger), `batch_id` like `pm-eq-payout-%`, or ids `pm-pay-%` /
 *   `pm-exp-%` / `pm-inv-%` — these often have **no** `bill_id` so bill-only deletes miss them.
 *
 * Order: optional journal lines/entries/reversals → transactions → pm_cycle_allocations → bills.
 * Backup tables are created before deletes (unless dryRun).
 */

import type { Pool, PoolClient } from 'pg';
import { getPool, withTransaction } from '../db/pool.js';
import { PmCycleMaintenanceRepository } from '../modules/project-selling/repositories/PmCycleMaintenanceRepository.js';
import { JournalRepository } from '../modules/accounting/repositories/JournalRepository.js';

const TENANT_ID_RE = /^[a-zA-Z0-9._-]+$/;

export type PmCycleResetOptions = {
  tenantId: string;
  /** Must be true or the function throws (safety guard). */
  forceDelete: boolean;
  dryRun?: boolean;
  /** Optional pool for tests; defaults to getPool(). */
  pool?: Pool;
};

export type PmCycleResetResult = {
  tenantId: string;
  dryRun: boolean;
  backupSuffix: string | null;
  pmBillIds: string[];
  transactionIdsDeleted: number;
  pmCycleAllocationsDeleted: number;
  billsDeleted: number;
  journalLinesDeleted: number;
  journalEntriesDeleted: number;
  journalReversalsDeleted: number;
  durationMs: number;
};

function assertTenantId(tenantId: string): void {
  if (!tenantId || !TENANT_ID_RE.test(tenantId)) {
    throw new Error('Invalid tenantId: use only letters, digits, dots, hyphens, underscores.');
  }
}

function backupTableName(base: string, suffix: string): string {
  return `${base}_${suffix}`;
}

async function tableExists(client: PoolClient, name: string): Promise<boolean> {
  const r = await client.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${name}`]
  );
  return r.rows[0]?.exists === true;
}

/** Build timestamp suffix safe for PostgreSQL identifiers (digits only). */
export function makeBackupSuffix(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

export async function resetPmCycleData(opts: PmCycleResetOptions): Promise<PmCycleResetResult> {
  const started = Date.now();

  assertTenantId(opts.tenantId);
  if (!opts.forceDelete) {
    throw new Error('Force flag required to delete PM cycle data (set forceDelete: true).');
  }

  const tenantId = opts.tenantId;
  const dryRun = Boolean(opts.dryRun);
  const pool = opts.pool ?? getPool();
  const backupSuffix = dryRun ? null : makeBackupSuffix();

  const result: PmCycleResetResult = {
    tenantId,
    dryRun,
    backupSuffix,
    pmBillIds: [],
    transactionIdsDeleted: 0,
    pmCycleAllocationsDeleted: 0,
    billsDeleted: 0,
    journalLinesDeleted: 0,
    journalEntriesDeleted: 0,
    journalReversalsDeleted: 0,
    durationMs: 0,
  };

  await withTransaction(async (client) => {
    const pmRepo = new PmCycleMaintenanceRepository(tenantId);
    result.pmBillIds = await pmRepo.resolvePmBillIds(client);
    const transactionIds = await pmRepo.resolvePmTransactionIds(client, result.pmBillIds);

    if (dryRun) {
      result.transactionIdsDeleted = transactionIds.length;
      result.pmCycleAllocationsDeleted = await pmRepo.countAllocations(client);
      result.billsDeleted = await pmRepo.countPmBills(client, result.pmBillIds);
      result.durationMs = Date.now() - started;
      return;
    }

    if (!backupSuffix) throw new Error('backupSuffix required when not dry run');

    const b1 = backupTableName('backup_pm_cycle_allocations', backupSuffix);
    const b2 = backupTableName('backup_bills_pm_cycle', backupSuffix);
    const b3 = backupTableName('backup_transactions_pm_cycle', backupSuffix);

    await pmRepo.backupAllocations(client, b1);
    await pmRepo.backupPmBills(client, b2, result.pmBillIds);
    await pmRepo.backupTransactions(client, b3, transactionIds);

    const hasJournal = await tableExists(client, 'journal_entries');
    if (hasJournal && transactionIds.length > 0) {
      const journalDeleted = await new JournalRepository(tenantId).deleteByTransactionSourceIds(
        client,
        transactionIds
      );
      result.journalReversalsDeleted = journalDeleted.reversals;
      result.journalLinesDeleted = journalDeleted.lines;
      result.journalEntriesDeleted = journalDeleted.entries;
    }

    result.transactionIdsDeleted = await pmRepo.deleteTransactionsByIds(client, transactionIds);
    result.pmCycleAllocationsDeleted = await pmRepo.deleteAllAllocations(client);

    if (result.pmBillIds.length > 0) {
      result.billsDeleted = await pmRepo.deletePmBills(client, result.pmBillIds);
    }
  });

  result.durationMs = Date.now() - started;
  return result;
}

export async function verifyPmCycleClean(tenantId: string, pool?: Pool): Promise<{
  pm_cycle_allocations: number;
  pm_bills_pm_alloc_pattern: number;
  /** Transactions that still look like PM Fee Ledger rows (description contains [PM-ALLOC-) */
  transactions_with_pm_alloc_marker: number;
}> {
  assertTenantId(tenantId);
  const p = pool ?? getPool();
  const c = await p.connect();
  try {
    const pmRepo = new PmCycleMaintenanceRepository(tenantId);
    return {
      pm_cycle_allocations: await pmRepo.countRemainingAllocations(c),
      pm_bills_pm_alloc_pattern: await pmRepo.countRemainingPmBills(c),
      transactions_with_pm_alloc_marker: await pmRepo.countTransactionsWithPmMarker(c),
    };
  } finally {
    c.release();
  }
}

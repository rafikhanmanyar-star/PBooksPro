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
    // --- Resolve PM bill IDs ---
    const billsR = await client.query<{ id: string }>(
      `
      SELECT DISTINCT x.id FROM (
        SELECT p.bill_id AS id
        FROM pm_cycle_allocations p
        WHERE p.tenant_id = $1 AND p.bill_id IS NOT NULL
        UNION
        SELECT b.id
        FROM bills b
        WHERE b.tenant_id = $1
          AND b.bill_number LIKE 'PM-ALLOC-%'
      ) AS x
      WHERE x.id IS NOT NULL
      `,
      [tenantId]
    );
    result.pmBillIds = billsR.rows.map((r) => r.id);

    // --- Transactions to remove (bill-linked + batch + Fee Ledger orphan PM rows) ---
    const txIdsR = await client.query<{ id: string }>(
      `
      SELECT DISTINCT t.id
      FROM transactions t
      WHERE t.tenant_id = $1
        AND (
          (
            t.bill_id = ANY($2::text[])
            OR (
              t.batch_id IS NOT NULL
              AND t.batch_id IN (
                SELECT DISTINCT t2.batch_id
                FROM transactions t2
                WHERE t2.tenant_id = $1
                  AND t2.bill_id = ANY($2::text[])
                  AND t2.batch_id IS NOT NULL
              )
            )
          )
          OR (t.description IS NOT NULL AND t.description ~ '\\[PM-ALLOC-')
          OR (t.batch_id IS NOT NULL AND t.batch_id LIKE 'pm-eq-payout-%')
          OR t.id LIKE 'pm-pay-%'
          OR t.id LIKE 'pm-exp-%'
          OR t.id LIKE 'pm-inv-%'
        )
      `,
      [tenantId, result.pmBillIds]
    );
    const transactionIds = txIdsR.rows.map((r) => r.id);

    if (dryRun) {
      result.transactionIdsDeleted = transactionIds.length;
      const a = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM pm_cycle_allocations WHERE tenant_id = $1`,
        [tenantId]
      );
      result.pmCycleAllocationsDeleted = Number(a.rows[0]?.n ?? 0);
      const b = await client.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM bills WHERE tenant_id = $1 AND id = ANY($2::text[])`,
        [tenantId, result.pmBillIds]
      );
      result.billsDeleted = Number(b.rows[0]?.n ?? 0);
      result.durationMs = Date.now() - started;
      return;
    }

    if (!backupSuffix) throw new Error('backupSuffix required when not dry run');

    // --- Backups (full row copies = audit trail) ---
    const b1 = backupTableName('backup_pm_cycle_allocations', backupSuffix);
    const b2 = backupTableName('backup_bills_pm_cycle', backupSuffix);
    const b3 = backupTableName('backup_transactions_pm_cycle', backupSuffix);

    await client.query(
      `CREATE TABLE ${b1} AS SELECT * FROM pm_cycle_allocations WHERE tenant_id = $1`,
      [tenantId]
    );
    await client.query(
      `CREATE TABLE ${b2} AS SELECT * FROM bills WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, result.pmBillIds]
    );
    await client.query(
      `CREATE TABLE ${b3} AS SELECT * FROM transactions WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, transactionIds]
    );

    const hasJournal = await tableExists(client, 'journal_entries');
    if (hasJournal && transactionIds.length > 0) {
      const jeR = await client.query<{ id: string }>(
        `SELECT id FROM journal_entries
         WHERE tenant_id = $1 AND source_module = 'transaction' AND source_id = ANY($2::text[])`,
        [tenantId, transactionIds]
      );
      const journalEntryIds = jeR.rows.map((r) => r.id);
      if (journalEntryIds.length > 0) {
        const revDel = await client.query(
          `DELETE FROM journal_reversals
           WHERE tenant_id = $1
             AND (original_journal_entry_id = ANY($2::text[]) OR reversal_journal_entry_id = ANY($2::text[]))`,
          [tenantId, journalEntryIds]
        );
        result.journalReversalsDeleted = revDel.rowCount ?? 0;

        const jlDel = await client.query(
          `DELETE FROM journal_lines
           WHERE journal_entry_id = ANY($1::text[])`,
          [journalEntryIds]
        );
        result.journalLinesDeleted = jlDel.rowCount ?? 0;

        const jeDel = await client.query(
          `DELETE FROM journal_entries WHERE tenant_id = $1 AND id = ANY($2::text[])`,
          [tenantId, journalEntryIds]
        );
        result.journalEntriesDeleted = jeDel.rowCount ?? 0;
      }
    }

    const txDel = await client.query(
      `DELETE FROM transactions
       WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, transactionIds]
    );
    result.transactionIdsDeleted = txDel.rowCount ?? 0;

    const allocDel = await client.query(
      `DELETE FROM pm_cycle_allocations WHERE tenant_id = $1`,
      [tenantId]
    );
    result.pmCycleAllocationsDeleted = allocDel.rowCount ?? 0;

    if (result.pmBillIds.length > 0) {
      const billDel = await client.query(
        `DELETE FROM bills WHERE tenant_id = $1 AND id = ANY($2::text[])`,
        [tenantId, result.pmBillIds]
      );
      result.billsDeleted = billDel.rowCount ?? 0;
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
    const a = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pm_cycle_allocations WHERE tenant_id = $1`,
      [tenantId]
    );
    const b = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM bills WHERE tenant_id = $1 AND bill_number LIKE 'PM-ALLOC-%'`,
      [tenantId]
    );
    const t = await c.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM transactions
       WHERE tenant_id = $1
         AND description IS NOT NULL
         AND description ~ '\\[PM-ALLOC-'`,
      [tenantId]
    );
    return {
      pm_cycle_allocations: Number(a.rows[0]?.n ?? 0),
      pm_bills_pm_alloc_pattern: Number(b.rows[0]?.n ?? 0),
      transactions_with_pm_alloc_marker: Number(t.rows[0]?.n ?? 0),
    };
  } finally {
    c.release();
  }
}

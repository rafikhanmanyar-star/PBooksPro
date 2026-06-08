import type pg from 'pg';
import { bootstrapTenantChart } from './tenantBootstrap.js';
import type { TransactionRow } from './transactionsService.js';
import {
  ensureTransactionJournalMirror,
  buildJournalLinesFromTransaction,
  shouldSkipTransactionJournalMirror,
  syncTransactionJournalMirror,
  TRANSACTION_JOURNAL_SOURCE_MODULE,
} from './transactionJournalPostingService.js';

const TX_SELECT = `SELECT t.id, t.tenant_id, t.user_id, t.type, t.subtype, t.amount, t.date, t.description, t.reference,
    t.account_id, t.from_account_id, t.to_account_id, t.category_id, t.contact_id, t.vendor_id, t.project_id,
    t.building_id, t.property_id, t.unit_id, t.invoice_id, t.bill_id, t.payslip_id, t.contract_id, t.agreement_id,
    t.batch_id, t.project_asset_id, t.owner_id, t.is_system, t.version, t.deleted_at, t.created_at, t.updated_at`;

export type TransactionJournalBackfillOptions = {
  fromDate?: string | null;
  toDate?: string | null;
  batchSize?: number;
  dryRun?: boolean;
  /** Reverse and repost mirrors for all active transactions (updates posting rules). */
  replaceExisting?: boolean;
  onProgress?: (msg: string) => void;
};

export type TransactionJournalBackfillStats = {
  tenantId: string;
  candidates: number;
  posted: number;
  skippedAlreadyPosted: number;
  skippedMirrorRule: number;
  skippedNoLines: number;
  failed: number;
  errors: { transactionId: string; message: string }[];
};

function logProgress(options: TransactionJournalBackfillOptions, msg: string): void {
  options.onProgress?.(msg);
}

/** Active transactions with no non-reversed journal mirror (source_module = transaction). */
export async function listTransactionsNeedingJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  options?: Pick<TransactionJournalBackfillOptions, 'fromDate' | 'toDate'>
): Promise<TransactionRow[]> {
  const params: unknown[] = [tenantId, TRANSACTION_JOURNAL_SOURCE_MODULE];
  let dateCond = '';
  if (options?.fromDate) {
    params.push(options.fromDate);
    dateCond += ` AND t.date >= $${params.length}::date`;
  }
  if (options?.toDate) {
    params.push(options.toDate);
    dateCond += ` AND t.date <= $${params.length}::date`;
  }

  const q = `${TX_SELECT}
    FROM transactions t
    WHERE t.tenant_id = $1
      AND t.deleted_at IS NULL
      ${dateCond}
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.tenant_id = t.tenant_id
          AND je.source_module = $2
          AND je.source_id = t.id
          AND NOT EXISTS (
            SELECT 1 FROM journal_reversals jr
            WHERE jr.tenant_id = t.tenant_id
              AND jr.original_journal_entry_id = je.id
          )
      )
    ORDER BY t.date ASC, t.id ASC`;

  const r = await client.query<TransactionRow>(q, params);
  return r.rows;
}

export async function countTransactionsNeedingJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  options?: Pick<TransactionJournalBackfillOptions, 'fromDate' | 'toDate'>
): Promise<number> {
  const rows = await listTransactionsNeedingJournalMirror(client, tenantId, options);
  return rows.length;
}

/**
 * Post missing journal mirrors for operational transactions (idempotent).
 * Ensures system chart accounts exist before posting.
 */
export async function backfillTransactionJournalMirrorsForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options: TransactionJournalBackfillOptions = {}
): Promise<TransactionJournalBackfillStats> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 500, 1), 5000);
  const stats: TransactionJournalBackfillStats = {
    tenantId,
    candidates: 0,
    posted: 0,
    skippedAlreadyPosted: 0,
    skippedMirrorRule: 0,
    skippedNoLines: 0,
    failed: 0,
    errors: [],
  };

  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  const rows = await listTransactionsNeedingJournalMirror(client, tenantId, options);
  const eligible = rows.filter(
    (r) => !shouldSkipTransactionJournalMirror(r) && buildJournalLinesFromTransaction(r) != null
  );
  stats.candidates = eligible.length;

  if (options.dryRun) {
    logProgress(
      options,
      `tenant=${tenantId} would_post=${eligible.length} (${rows.length - eligible.length} skipped by mirror rules / line mapping)`
    );
    return stats;
  }

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    await client.query('BEGIN');
    try {
      for (const row of batch) {
        await client.query('SAVEPOINT tx_journal_backfill');
        try {
          const result = await ensureTransactionJournalMirror(client, tenantId, row, row.user_id);
          if (result.skipped === 'already_posted') stats.skippedAlreadyPosted += 1;
          else if (result.skipped === 'mirror_rule') stats.skippedMirrorRule += 1;
          else if (result.skipped === 'no_lines') stats.skippedNoLines += 1;
          else if (result.journalEntryId) stats.posted += 1;
          await client.query('RELEASE SAVEPOINT tx_journal_backfill');
        } catch (e) {
          await client.query('ROLLBACK TO SAVEPOINT tx_journal_backfill');
          stats.failed += 1;
          const message = e instanceof Error ? e.message : String(e);
          stats.errors.push({ transactionId: row.id, message });
          if (stats.errors.length <= 20) {
            logProgress(options, `ERROR tx=${row.id}: ${message}`);
          }
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
    logProgress(
      options,
      `tenant=${tenantId} progress=${Math.min(i + batch.length, eligible.length)}/${eligible.length} posted=${stats.posted}`
    );
  }

  return stats;
}

/** Re-post journal mirrors for all active transactions (e.g. after changing clearing → summary rules). */
export async function replaceAllTransactionJournalMirrorsForTenant(
  client: pg.PoolClient,
  tenantId: string,
  options: Pick<TransactionJournalBackfillOptions, 'fromDate' | 'toDate' | 'dryRun' | 'onProgress'> = {}
): Promise<TransactionJournalBackfillStats> {
  const params: unknown[] = [tenantId];
  let dateCond = '';
  if (options.fromDate) {
    params.push(options.fromDate);
    dateCond += ` AND t.date >= $${params.length}::date`;
  }
  if (options.toDate) {
    params.push(options.toDate);
    dateCond += ` AND t.date <= $${params.length}::date`;
  }

  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  const r = await client.query<TransactionRow>(
    `${TX_SELECT}
     FROM transactions t
     WHERE t.tenant_id = $1 AND t.deleted_at IS NULL ${dateCond}
     ORDER BY t.date ASC, t.id ASC`,
    params
  );

  const stats: TransactionJournalBackfillStats = {
    tenantId,
    candidates: r.rows.length,
    posted: 0,
    skippedAlreadyPosted: 0,
    skippedMirrorRule: 0,
    skippedNoLines: 0,
    failed: 0,
    errors: [],
  };

  if (options.dryRun) {
    logProgress(options, `tenant=${tenantId} would_replace=${r.rows.length} transaction mirrors`);
    return stats;
  }

  for (const row of r.rows) {
    try {
      if (shouldSkipTransactionJournalMirror(row)) {
        stats.skippedMirrorRule += 1;
        continue;
      }
      if (!buildJournalLinesFromTransaction(row)) {
        stats.skippedNoLines += 1;
        continue;
      }
      await syncTransactionJournalMirror(client, tenantId, row, row.user_id, { replaceExisting: true });
      stats.posted += 1;
    } catch (e) {
      stats.failed += 1;
      stats.errors.push({
        transactionId: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  logProgress(options, `tenant=${tenantId} replaced=${stats.posted} failed=${stats.failed}`);
  return stats;
}

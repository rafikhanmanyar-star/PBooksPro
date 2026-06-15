import type pg from 'pg';
import { bootstrapTenantChart } from '../../organization/services/tenantBootstrap.js';
import type { TransactionRow } from './transactionsService.js';
import {
  ensureTransactionJournalMirror,
  buildJournalLinesFromTransaction,
  shouldSkipTransactionJournalMirror,
  syncTransactionJournalMirror,
} from './transactionJournalPostingService.js';
import { withSavepoint } from '../../../db/pool.js';
import { TransactionJournalBackfillRepository } from '../repositories/TransactionJournalBackfillRepository.js';

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

const backfillRepo = new TransactionJournalBackfillRepository();

function logProgress(options: TransactionJournalBackfillOptions, msg: string): void {
  options.onProgress?.(msg);
}

/** Active transactions with no non-reversed journal mirror (source_module = transaction). */
export async function listTransactionsNeedingJournalMirror(
  client: pg.PoolClient,
  tenantId: string,
  options?: Pick<TransactionJournalBackfillOptions, 'fromDate' | 'toDate'>
): Promise<TransactionRow[]> {
  return backfillRepo.listNeedingJournalMirror(client, tenantId, options);
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
    for (const row of batch) {
      try {
        await withSavepoint(client, `tx_journal_backfill_${row.id}`, async (spClient) => {
          const result = await ensureTransactionJournalMirror(spClient, tenantId, row, row.user_id);
          if (result.skipped === 'already_posted') stats.skippedAlreadyPosted += 1;
          else if (result.skipped === 'mirror_rule') stats.skippedMirrorRule += 1;
          else if (result.skipped === 'no_lines') stats.skippedNoLines += 1;
          else if (result.journalEntryId) stats.posted += 1;
        });
      } catch (e) {
        stats.failed += 1;
        const message = e instanceof Error ? e.message : String(e);
        stats.errors.push({ transactionId: row.id, message });
        if (stats.errors.length <= 20) {
          logProgress(options, `ERROR tx=${row.id}: ${message}`);
        }
      }
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
  await bootstrapTenantChart(client, tenantId, { legacyIds: false });

  const r = await backfillRepo.listActiveForReplace(client, tenantId, options);

  const stats: TransactionJournalBackfillStats = {
    tenantId,
    candidates: r.length,
    posted: 0,
    skippedAlreadyPosted: 0,
    skippedMirrorRule: 0,
    skippedNoLines: 0,
    failed: 0,
    errors: [],
  };

  if (options.dryRun) {
    logProgress(options, `tenant=${tenantId} would_replace=${r.length} transaction mirrors`);
    return stats;
  }

  for (const row of r) {
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

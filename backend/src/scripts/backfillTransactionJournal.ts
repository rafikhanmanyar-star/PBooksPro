#!/usr/bin/env npx tsx
/**
 * Backfill journal_entries / journal_lines for existing operational transactions.
 * Idempotent: skips rows that already have a non-reversed mirror (source_module = transaction).
 *
 * From repo root (loads root `.env` via backend loadEnv):
 *   npm run db:backfill-transaction-journal -- --tenant default
 *   npm run db:backfill-transaction-journal -- --all
 *   npm run db:backfill-transaction-journal -- --all --dry-run
 *   npm run db:backfill-transaction-journal -- --tenant default --from 2024-01-01 --to 2026-12-31
 *   npm run db:backfill-transaction-journal -- --all --batch-size 200
 */

import '../loadEnv.js';
import { getPool } from '../db/pool.js';
import {
  backfillTransactionJournalMirrorsForTenant,
  replaceAllTransactionJournalMirrorsForTenant,
} from '../services/transactionJournalBackfillService.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const tenant = arg('--tenant');
  const all = process.argv.includes('--all');
  const dryRun = process.argv.includes('--dry-run');
  const replaceAll = process.argv.includes('--replace-all');
  const fromDate = arg('--from') ?? null;
  const toDate = arg('--to') ?? null;
  const batchSizeRaw = arg('--batch-size');
  const batchSize = batchSizeRaw ? parseInt(batchSizeRaw, 10) : undefined;

  if ((!tenant && !all) || (tenant && all)) {
    console.error(
      'Usage: --tenant <tenantId> | --all  [--dry-run] [--replace-all] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--batch-size N]'
    );
    process.exit(1);
  }

  if (batchSizeRaw && (!Number.isFinite(batchSize) || (batchSize ?? 0) < 1)) {
    console.error('--batch-size must be a positive integer');
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

  let grandPosted = 0;
  let grandFailed = 0;

  for (const tid of tenantIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stats = replaceAll
        ? await replaceAllTransactionJournalMirrorsForTenant(client, tid, {
            dryRun,
            fromDate,
            toDate,
            onProgress: (msg) => console.log(msg),
          })
        : await backfillTransactionJournalMirrorsForTenant(client, tid, {
            dryRun,
            fromDate,
            toDate,
            batchSize,
            onProgress: (msg) => console.log(msg),
          });

      if (dryRun) await client.query('ROLLBACK');
      else await client.query('COMMIT');

      if (dryRun) {
        console.log(
          `[dry-run] tenant=${tid} candidates=${stats.candidates} (no journals written)`
        );
      } else {
        console.log(
          `tenant=${tid} candidates=${stats.candidates} posted=${stats.posted} ` +
            `skipped_already=${stats.skippedAlreadyPosted} skipped_mirror_rule=${stats.skippedMirrorRule} ` +
            `skipped_no_lines=${stats.skippedNoLines} failed=${stats.failed}`
        );
        if (stats.errors.length > 0) {
          console.log(`  first_errors:`);
          for (const err of stats.errors.slice(0, 10)) {
            console.log(`    ${err.transactionId}: ${err.message}`);
          }
        }
        grandPosted += stats.posted;
        grandFailed += stats.failed;
      }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`Failed tenant=${tid}:`, e instanceof Error ? e.message : e);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  if (!dryRun && tenantIds.length > 1) {
    console.log(`Done. total_posted=${grandPosted} total_failed=${grandFailed}`);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

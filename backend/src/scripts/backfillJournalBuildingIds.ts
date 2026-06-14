#!/usr/bin/env npx tsx
/**
 * Backfill journal_entries.building_id and journal_lines dimensions from source documents.
 *
 * From repo root:
 *   npm run db:backfill-journal-dimensions:staging -- --tenant default
 *   npm run db:backfill-journal-dimensions:staging -- --all
 *   npm run db:backfill-journal-dimensions:staging -- --all --dry-run
 */

import '../loadEnv.js';
import { getPool } from '../db/pool.js';
import {
  backfillJournalDimensionsForTenant,
  printJournalDimensionsBackfillSummary,
} from '../services/journalDimensionsBackfillService.js';

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

  for (const tenantId of tenantIds) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const summary = await backfillJournalDimensionsForTenant(client, tenantId, { dryRun });
      if (dryRun) {
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
      }
      printJournalDimensionsBackfillSummary(summary);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

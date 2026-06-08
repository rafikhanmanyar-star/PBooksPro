#!/usr/bin/env npx tsx
/**
 * Backfill journal mirrors for issued invoices (Dr AR / Cr revenue or security liability).
 *
 *   npm run backfill-invoice-journal -- --tenant test-company
 *   npm run backfill-invoice-journal -- --tenant test-company --replace
 */

import '../loadEnv.js';
import { getPool } from '../db/pool.js';
import { backfillInvoiceJournalMirrorsForTenant } from '../services/invoiceJournalBackfillService.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const tenant = arg('--tenant');
  if (!tenant) {
    console.error('Usage: --tenant <tenantId> [--replace] [--dry-run]');
    process.exit(1);
  }
  const replaceExisting = process.argv.includes('--replace');
  const dryRun = process.argv.includes('--dry-run');

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stats = await backfillInvoiceJournalMirrorsForTenant(client, tenant, {
      dryRun,
      replaceExisting,
      onProgress: (m) => console.log(m),
    });
    if (dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
    console.log(JSON.stringify(stats, null, 2));
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

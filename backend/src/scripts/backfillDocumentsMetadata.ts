#!/usr/bin/env npx tsx
/**
 * Phase 2 — migrate legacy documents.file_data → document_metadata (+ R2 or inline_data).
 *
 *   npm run backfill-documents-metadata -- --tenant <tenantId>
 *   npm run backfill-documents-metadata -- --all
 *   npm run backfill-documents-metadata -- --tenant <tenantId> --dry-run --limit 10
 */

import '../loadEnv.js';
import { getPool } from '../db/pool.js';
import {
  backfillLegacyDocumentsAllTenants,
  backfillLegacyDocumentsForTenant,
} from '../modules/documents/services/documentBackfillService.js';
import { isR2Configured } from '../modules/documents/services/DocumentStorageService.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const tenant = arg('--tenant');
  const all = process.argv.includes('--all');
  const dryRun = process.argv.includes('--dry-run');
  const limitRaw = arg('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;

  if (!tenant && !all) {
    console.error('Usage: --tenant <tenantId> | --all [--dry-run] [--limit N]');
    process.exit(1);
  }

  console.log(`R2 configured: ${isR2Configured() ? 'yes' : 'no (using inline_data fallback)'}`);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const opts = {
      dryRun,
      limit: Number.isFinite(limit) && limit! > 0 ? limit : undefined,
      onProgress: (m: string) => console.log(m),
    };

    if (all) {
      const results = await backfillLegacyDocumentsAllTenants(client, opts);
      if (dryRun) await client.query('ROLLBACK');
      else await client.query('COMMIT');
      console.log(JSON.stringify(results, null, 2));
      const totals = results.reduce(
        (acc, r) => ({
          scanned: acc.scanned + r.scanned,
          migrated: acc.migrated + r.migrated,
          skipped: acc.skipped + r.skipped,
          failed: acc.failed + r.failed,
          bytesMoved: acc.bytesMoved + r.bytesMoved,
        }),
        { scanned: 0, migrated: 0, skipped: 0, failed: 0, bytesMoved: 0 }
      );
      console.log('Totals:', totals);
      if (totals.failed > 0) process.exit(1);
      return;
    }

    const stats = await backfillLegacyDocumentsForTenant(client, tenant!, opts);
    if (dryRun) await client.query('ROLLBACK');
    else await client.query('COMMIT');
    console.log(JSON.stringify(stats, null, 2));
    if (stats.failed > 0) process.exit(1);
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

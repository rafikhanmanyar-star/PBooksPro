#!/usr/bin/env npx tsx
/**
 * CLI: reset PM Cycle data for one tenant (PostgreSQL).
 *
 * Usage (from repo root with DATABASE_URL in .env):
 *   dotenv -e .env -- npm run reset-pm-cycle --prefix backend -- --tenant rk-builders-284d6d --dry-run
 *   dotenv -e .env -- npm run reset-pm-cycle --prefix backend -- --tenant rk-builders-284d6d --force
 *
 * Options:
 *   --tenant <id>   Required.
 *   --dry-run       Count rows only; no backup or deletes.
 *   --force         Required with DATABASE writes (omit --dry-run).
 *   --verify-only   Print verifyPmCycleClean counts and exit.
 */

import '../loadEnv.js';
import { resetPmCycleData, verifyPmCycleClean } from '../services/pmCycleResetService.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main(): Promise<void> {
  const tenant = arg('--tenant');
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  const verifyOnly = process.argv.includes('--verify-only');

  if (!tenant) {
    console.error('Usage: --tenant <tenantId> [--dry-run | --force] [--verify-only]');
    process.exit(1);
  }

  if (verifyOnly) {
    const v = await verifyPmCycleClean(tenant);
    console.log(JSON.stringify(v, null, 2));
    return;
  }

  if (!dryRun && !force) {
    console.error('Refusing to run: use --dry-run to preview counts, or --force to perform backup + delete.');
    process.exit(1);
  }

  const result = await resetPmCycleData({
    tenantId: tenant,
    forceDelete: true,
    dryRun,
  });

  console.log(
    JSON.stringify(
      {
        tenantId: result.tenantId,
        dryRun: result.dryRun,
        backupSuffix: result.backupSuffix,
        durationMs: result.durationMs,
        pmBillIdsFound: result.pmBillIds.length,
        deleted: {
          transactions: result.transactionIdsDeleted,
          pm_cycle_allocations: result.pmCycleAllocationsDeleted,
          bills: result.billsDeleted,
          journal_lines: result.journalLinesDeleted,
          journal_entries: result.journalEntriesDeleted,
          journal_reversals: result.journalReversalsDeleted,
        },
      },
      null,
      2
    )
  );

  if (!dryRun) {
    const v = await verifyPmCycleClean(tenant);
    console.log('\nPost-run verification:', JSON.stringify(v, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

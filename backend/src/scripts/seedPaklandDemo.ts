#!/usr/bin/env npx tsx
/**
 * Seed Pakland presentation org (pakland-001) on staging or cloud production.
 *
 *   npm run seed:pakland --prefix backend
 *   npm run seed:pakland --prefix backend -- --production
 *   npm run seed:pakland --prefix backend -- --production --tenant pakland-001
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const useProduction = process.argv.includes('--production');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (useProduction) {
  const productionEnv = path.join(root, '.env.production.render');
  const fallbackEnv = path.join(root, '.env.production');
  if (fs.existsSync(productionEnv)) {
    dotenv.config({ path: productionEnv, override: true });
  } else if (fs.existsSync(fallbackEnv)) {
    dotenv.config({ path: fallbackEnv, override: true });
  } else {
    console.error('Missing .env.production.render or .env.production for --production');
    process.exit(1);
  }
} else {
  for (const envFile of ['.env.staging', '.env']) {
    const p = path.join(root, envFile);
    if (fs.existsSync(p)) dotenv.config({ path: p });
  }
}

import { getPool, withTransaction } from '../db/pool.js';
import {
  PAKLAND_TENANT_ID,
  seedPaklandBusinessData,
  finalizePaklandSeed,
} from '../modules/demo/repositories/PaklandSeedRepository.js';
import { logger } from '../utils/logger.js';

async function resolveTenantId(pool: ReturnType<typeof getPool>): Promise<string> {
  const fromArg = flag('--tenant');
  if (fromArg) return fromArg;

  const r = await pool.query<{ id: string }>(
    `SELECT id FROM tenants
     WHERE id = $1 OR company_name ILIKE '%pakland%' OR name ILIKE '%pakland%'
     ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [PAKLAND_TENANT_ID]
  );
  if (!r.rows[0]) throw new Error('Pakland tenant not found — pass --tenant <id>');
  return r.rows[0].id;
}

async function main(): Promise<void> {
  const pool = getPool();
  const tenantId = await resolveTenantId(pool);
  const started = Date.now();
  const finalizeOnly = process.argv.includes('--finalize-only');

  if (finalizeOnly) {
    console.log(`Finalizing GL mirrors for ${tenantId}…`);
    await withTransaction(async (client) => {
      await finalizePaklandSeed(client, tenantId, { skipPayrollLedger: true });
    });
  } else {
    console.log(`Seeding tenant ${tenantId}…`);
    console.log('Phase 1/2: business data');
    await withTransaction(async (client) => {
      await seedPaklandBusinessData(client, tenantId);
    });

    console.log('Phase 2/2: payroll ledger + GL mirrors');
    await withTransaction(async (client) => {
      await finalizePaklandSeed(client, tenantId);
    });
  }

  const counts = await pool.query<{
    projects: number;
    units: number;
    agreements: number;
    buildings: number;
    properties: number;
    rental_agreements: number;
    vendors: number;
    purchase_orders: number;
    goods_receipts: number;
    transactions: number;
    journal_entries: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM projects WHERE tenant_id = $1 AND deleted_at IS NULL) AS projects,
       (SELECT COUNT(*)::int FROM units WHERE tenant_id = $1 AND deleted_at IS NULL) AS units,
       (SELECT COUNT(*)::int FROM project_agreements WHERE tenant_id = $1 AND deleted_at IS NULL) AS agreements,
       (SELECT COUNT(*)::int FROM buildings WHERE tenant_id = $1 AND deleted_at IS NULL) AS buildings,
       (SELECT COUNT(*)::int FROM properties WHERE tenant_id = $1 AND deleted_at IS NULL) AS properties,
       (SELECT COUNT(*)::int FROM rental_agreements WHERE tenant_id = $1 AND deleted_at IS NULL) AS rental_agreements,
       (SELECT COUNT(*)::int FROM vendors WHERE tenant_id = $1 AND deleted_at IS NULL) AS vendors,
       (SELECT COUNT(*)::int FROM purchase_orders WHERE tenant_id = $1 AND deleted_at IS NULL) AS purchase_orders,
       (SELECT COUNT(*)::int FROM goods_receipts WHERE tenant_id = $1 AND deleted_at IS NULL) AS goods_receipts,
       (SELECT COUNT(*)::int FROM transactions WHERE tenant_id = $1 AND deleted_at IS NULL) AS transactions,
       (SELECT COUNT(*)::int FROM journal_entries WHERE tenant_id = $1) AS journal_entries`,
    [tenantId]
  );

  const summary = counts.rows[0];
  logger.info('Pakland seed complete', { tenantId, durationMs: Date.now() - started, summary });
  console.log('\nPakland presentation seed complete:');
  console.log(`  Tenant: ${tenantId}`);
  console.log(`  Projects: ${summary.projects} | Units: ${summary.units} | Selling agreements: ${summary.agreements}`);
  console.log(`  Buildings: ${summary.buildings} | Properties: ${summary.properties} | Rental agreements: ${summary.rental_agreements}`);
  console.log(`  Vendors: ${summary.vendors} | POs: ${summary.purchase_orders} | GRNs: ${summary.goods_receipts}`);
  console.log(`  Transactions: ${summary.transactions} | Journal entries: ${summary.journal_entries}`);
  console.log('\nLog in again to refresh dashboards and reports.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

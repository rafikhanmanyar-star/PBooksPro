#!/usr/bin/env npx tsx
/**
 * Ensure shared system chart of accounts + categories exist (__system__ tenant).
 * Idempotent — safe to run after migrations or new org creation.
 *
 * Uses `.env.production` when DATABASE_URL is not already set (desktop production DB).
 *
 *   npm run chart:ensure --prefix backend
 *   npm run chart:ensure --prefix backend -- --tenant taj-builders
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

if (!process.env.DATABASE_URL) {
  const productionEnv = path.join(root, '.env.production');
  if (fs.existsSync(productionEnv)) {
    dotenv.config({ path: productionEnv });
  }
}

await import('../loadEnv.js');

import { getPool } from '../db/pool.js';
import { bootstrapTenantChart } from '../modules/organization/services/tenantBootstrap.js';
import {
  SYSTEM_ACCOUNT_DEFS,
  SYSTEM_CATEGORY_DEFS,
} from '../constants/systemChartDefs.js';
import { GLOBAL_SYSTEM_TENANT_ID } from '../constants/globalSystemChart.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1]?.trim();
}

async function listMissing(
  client: Awaited<ReturnType<ReturnType<typeof getPool>['connect']>>,
  table: 'accounts' | 'categories',
  ids: string[]
): Promise<string[]> {
  const missing: string[] = [];
  for (const id of ids) {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, GLOBAL_SYSTEM_TENANT_ID]
    );
    if (r.rows.length === 0) missing.push(id);
  }
  return missing;
}

async function main(): Promise<void> {
  const tenantId = arg('tenant') ?? 'taj-builders';
  const pool = getPool();
  const client = await pool.connect();

  try {
    const tenantCheck = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM tenants WHERE id = $1`,
      [tenantId]
    );
    if (tenantCheck.rows.length === 0) {
      console.warn(`Tenant "${tenantId}" not found — still ensuring global system chart.`);
    } else {
      console.log(`Tenant: ${tenantCheck.rows[0].name} (${tenantId})`);
    }

    const accountIds = SYSTEM_ACCOUNT_DEFS.map((a) => a.logicalId);
    const categoryIds = SYSTEM_CATEGORY_DEFS.map((c) => c.logicalId);

    const missingAccountsBefore = await listMissing(client, 'accounts', accountIds);
    const missingCategoriesBefore = await listMissing(client, 'categories', categoryIds);

    console.log('Before ensure:');
    console.log(`  system accounts: ${accountIds.length - missingAccountsBefore.length}/${accountIds.length}`);
    console.log(`  system categories: ${categoryIds.length - missingCategoriesBefore.length}/${categoryIds.length}`);
    if (missingAccountsBefore.length) {
      console.log('  missing accounts:', missingAccountsBefore.join(', '));
    }
    if (missingCategoriesBefore.length) {
      console.log('  missing categories:', missingCategoriesBefore.join(', '));
    }

    await bootstrapTenantChart(client, tenantId, { legacyIds: false });

    const missingAccountsAfter = await listMissing(client, 'accounts', accountIds);
    const missingCategoriesAfter = await listMissing(client, 'categories', categoryIds);

    const visibleAccounts = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM accounts
       WHERE deleted_at IS NULL AND (tenant_id = $1 OR tenant_id = $2)`,
      [tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );
    const visibleCategories = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM categories
       WHERE deleted_at IS NULL AND (tenant_id = $1 OR tenant_id = $2)`,
      [tenantId, GLOBAL_SYSTEM_TENANT_ID]
    );

    console.log('After ensure:');
    console.log(`  system accounts: ${accountIds.length - missingAccountsAfter.length}/${accountIds.length}`);
    console.log(`  system categories: ${categoryIds.length - missingCategoriesAfter.length}/${categoryIds.length}`);
    console.log(`  visible to tenant "${tenantId}": ${visibleAccounts.rows[0]?.count} accounts, ${visibleCategories.rows[0]?.count} categories`);

    if (missingAccountsAfter.length || missingCategoriesAfter.length) {
      console.error('Still missing after bootstrap:', {
        accounts: missingAccountsAfter,
        categories: missingCategoriesAfter,
      });
      process.exit(1);
    }

    console.log(JSON.stringify({ ok: true, tenantId, systemAccounts: accountIds.length, systemCategories: categoryIds.length }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * CLI wrapper for factoryResetTenant — used by scripts/reset-tenant-data.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const tenantId = flag('--tenant-id');
const envFile = flag('--env-file') || '.env.staging';
const envPath = path.join(root, envFile);

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config({ path: path.join(root, '.env') });
}

if (!tenantId) {
  console.error('Usage: tsx resetTenantDataCli.ts --tenant-id <id> [--env-file .env.production.render]');
  process.exit(1);
}

import { withTransaction } from '../db/pool.js';
import { factoryResetTenant } from '../modules/organization/services/tenantDataManagementService.js';

async function main(): Promise<void> {
  const result = await withTransaction(async (client) => factoryResetTenant(client, tenantId!));
  console.log('Factory reset complete:', result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

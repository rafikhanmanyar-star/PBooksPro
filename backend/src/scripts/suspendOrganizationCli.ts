/**
 * Suspend an organization (ops CLI).
 * Uses `.env.production.render` when present.
 *
 *   npm run org:suspend --prefix backend -- --tenant-id whitehouse
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const productionEnv = path.join(root, '.env.production.render');
if (fs.existsSync(productionEnv)) {
  dotenv.config({ path: productionEnv });
}
await import('../loadEnv.js');

import { withTransaction } from '../db/pool.js';
import { suspendOrganization } from '../services/organization/organizationApprovalService.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1]?.trim();
}

async function main() {
  const tenantId = arg('tenant-id');
  if (!tenantId) {
    console.error('Usage: npm run org:suspend --prefix backend -- --tenant-id ID');
    process.exit(1);
  }

  await withTransaction(async (client) => {
    const detail = await suspendOrganization(client, tenantId, 'platform:admin-cli', 'admin-cli@pbookspro.com');
    console.log(JSON.stringify({ ok: true, tenantId, status: detail.status, email: detail.email }, null, 2));
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

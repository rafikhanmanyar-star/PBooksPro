/**
 * Approve a pending organization (ops CLI).
 * Uses `.env.production.render` when present.
 *
 *   npm run org:approve --prefix backend -- --tenant-id tajbuilders
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
import { approveOrganization } from '../services/organization/organizationApprovalService.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1]?.trim();
}

async function main() {
  const tenantId = arg('tenant-id');
  if (!tenantId) {
    console.error('Usage: npm run org:approve --prefix backend -- --tenant-id ID');
    process.exit(1);
  }

  await withTransaction(async (client) => {
    const owner = await client.query(
      `SELECT id, email FROM users WHERE tenant_id = $1 AND role = 'Admin' ORDER BY created_at ASC NULLS LAST LIMIT 1`,
      [tenantId]
    );
    if (owner.rows.length === 0) {
      throw new Error(`No admin user found for tenant "${tenantId}".`);
    }
    const row = owner.rows[0] as { id: string; email: string | null };
    const detail = await approveOrganization(client, tenantId, row.id, row.email);
    console.log(JSON.stringify({ ok: true, tenantId, status: detail.status, email: detail.email }, null, 2));
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

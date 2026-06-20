#!/usr/bin/env node
/**
 * Grant vendor-controlled break-glass capability to a user (platform table — not tenant RBAC).
 *
 * Usage:
 *   node scripts/grant-break-glass-capability.mjs --tenant pakland --user admin@example.com
 *   node scripts/grant-break-glass-capability.mjs --tenant pakland --user-id <uuid> --env staging
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const envName = arg('env') ?? 'staging';
const envFile =
  envName === 'production'
    ? existsSync('.env.production')
      ? '.env.production'
      : '.env.production.example'
    : existsSync('.env.staging')
      ? '.env.staging'
      : '.env.staging.example';
loadEnv({ path: resolve(process.cwd(), envFile) });

const tenantKey = arg('tenant');
const userEmail = arg('user');
const userIdArg = arg('user-id');
const reason = arg('reason') ?? 'Vendor bootstrap capability';

if (!tenantKey || (!userEmail && !userIdArg)) {
  console.error('Usage: --tenant <id|name> (--user <email> | --user-id <uuid>) [--env staging|production]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const tenantRes = await pool.query(
    `SELECT id, name FROM tenants WHERE id = $1 OR LOWER(name) LIKE LOWER($2) LIMIT 1`,
    [tenantKey, `%${tenantKey}%`]
  );
  const tenant = tenantRes.rows[0];
  if (!tenant) throw new Error(`Tenant not found: ${tenantKey}`);

  let userId = userIdArg;
  if (!userId) {
    const userRes = await pool.query(
      `SELECT u.id FROM users u
       INNER JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = $1
       WHERE LOWER(u.username) = LOWER($2) OR LOWER(u.email) = LOWER($2)
       LIMIT 1`,
      [tenant.id, userEmail]
    );
    userId = userRes.rows[0]?.id;
  }
  if (!userId) throw new Error(`User not found in tenant: ${userEmail ?? userIdArg}`);

  const activeCount = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM platform_break_glass_capabilities
     WHERE tenant_id = $1 AND revoked_at IS NULL`,
    [tenant.id]
  );
  if (activeCount.rows[0].cnt >= 2) {
    throw new Error('Maximum 2 break-glass capabilities per tenant (revoke one first)');
  }

  const id = `pbgc_${randomUUID().replace(/-/g, '')}`;
  await pool.query(
    `INSERT INTO platform_break_glass_capabilities (id, tenant_id, user_id, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET revoked_at = NULL, reason = EXCLUDED.reason, granted_at = NOW()`,
    [id, tenant.id, userId, reason]
  );
  console.log(`Granted break-glass capability: tenant=${tenant.id} user=${userId}`);
} finally {
  await pool.end();
}

/**
 * Ops CLI: create (and optionally approve) an organization in PostgreSQL.
 * Bypasses HTTP registration CAPTCHA — for platform owner use only.
 *
 * Uses `.env.production.render` at repo root when present (Render production DATABASE_URL).
 *
 *   npm run org:create --prefix backend -- \
 *     --company "Acme Corp" \
 *     --email "admin@acme.com" \
 *     --admin-name "Jane Admin" \
 *     --admin-user "jane" \
 *     --password "Secret123" \
 *     --tenant-id acme-corp \
 *     --approve
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const productionEnv = path.join(root, '.env.production.render');
if (fs.existsSync(productionEnv)) {
  dotenv.config({ path: productionEnv });
}
await import('../loadEnv.js');

import { withTransaction } from '../db/pool.js';
import { ensureUserTenantMembership } from '../services/auth/userTenantService.js';
import { requireLegalAcceptances } from '../services/legal/legalAcceptanceService.js';
import { validatePassword } from '../utils/passwordPolicy.js';
import {
  approveOrganization,
  bootstrapNewOrganizationData,
  registerPendingOrganization,
} from '../services/organization/organizationApprovalService.js';
import { isOrganizationApprovalEnabled } from '../constants/organizationStatus.js';
import { logger } from '../utils/logger.js';

const RESERVED_TENANT_IDS = new Set(['default', 'admin', 'api', 'system', 'www', 'mail', 'ftp']);

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1 || idx === process.argv.length - 1) return undefined;
  return process.argv[idx + 1]?.trim();
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function generateTenantId(companyName: string): string {
  const base = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return base || `org-${randomUUID().slice(0, 8)}`;
}

async function main() {
  const companyName = arg('company');
  const email = arg('email');
  const adminName = arg('admin-name');
  const adminUsername = arg('admin-user');
  const adminPassword = arg('password');
  const requestedTenantId = arg('tenant-id');
  const autoApprove = hasFlag('approve');

  if (!companyName || !email || !adminName || !adminUsername || !adminPassword) {
    console.error(
      'Usage: npm run org:create --prefix backend -- --company NAME --email EMAIL --admin-name NAME --admin-user USER --password PASS [--tenant-id ID] [--approve]'
    );
    process.exit(1);
  }

  const passwordError = validatePassword(adminPassword);
  if (passwordError) {
    console.error(passwordError);
    process.exit(1);
  }

  let tenantId = requestedTenantId?.toLowerCase() ?? generateTenantId(companyName);
  if (RESERVED_TENANT_IDS.has(tenantId)) {
    console.error(`Tenant id "${tenantId}" is reserved.`);
    process.exit(1);
  }

  const userId = `user_${randomUUID().replace(/-/g, '')}`;
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const emailVal = email.trim().toLowerCase();
  const legalAcceptances = [
    { documentType: 'terms_of_service', documentVersion: '2026-06-07' },
    { documentType: 'privacy_policy', documentVersion: '2026-06-07' },
  ];

  let registrationReference = '';

  await withTransaction(async (client) => {
    const exists = await client.query('SELECT id, status FROM tenants WHERE id = $1', [tenantId]);
    if (exists.rows.length > 0) {
      const row = exists.rows[0] as { id: string; status: string };
      throw new Error(`Organization id "${row.id}" already exists (status: ${row.status}).`);
    }

    const userExists = await client.query(
      `SELECT 1 FROM users WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)`,
      [tenantId, adminUsername.trim()]
    );
    if (userExists.rows.length > 0) {
      throw new Error(`Username "${adminUsername}" already exists for this tenant.`);
    }

    const reg = await registerPendingOrganization(client, {
      tenantId,
      companyName: companyName.trim(),
      email: emailVal,
    });
    registrationReference = reg.registrationReference;

    await client.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active, last_tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $2)`,
      [userId, tenantId, adminUsername.trim(), adminName.trim(), 'Admin', passwordHash, emailVal]
    );

    await ensureUserTenantMembership(client, userId, tenantId, 'Admin');

    await bootstrapNewOrganizationData(client, tenantId, {
      skipTrial: isOrganizationApprovalEnabled(),
    });

    await requireLegalAcceptances(client, {
      acceptances: legalAcceptances,
      context: 'registration',
      tenantId,
      userId,
    });

    if (autoApprove && isOrganizationApprovalEnabled()) {
      await approveOrganization(client, tenantId, userId, emailVal);
    }
  });

  const status =
    autoApprove && isOrganizationApprovalEnabled()
      ? 'ACTIVE'
      : isOrganizationApprovalEnabled()
        ? 'PENDING'
        : 'ACTIVE';

  logger.info('Organization created via CLI', {
    tenantId,
    registrationReference,
    status,
    email: emailVal,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId,
        registrationReference,
        status,
        email: emailVal,
        adminUsername: adminUsername.trim(),
        message:
          status === 'PENDING'
            ? 'Organization created as PENDING — approve in Admin Portal before sign-in.'
            : 'Organization is ACTIVE — user can sign in with email and password.',
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

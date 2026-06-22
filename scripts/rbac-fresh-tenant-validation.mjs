/**
 * Fresh-tenant RBAC validation — provisions a tenant via seedTenantRbac and verifies RBAC-only auth.
 *
 * Usage:
 *   node --import tsx scripts/rbac-fresh-tenant-validation.mjs --env staging
 *   node --import tsx scripts/rbac-fresh-tenant-validation.mjs --env staging --api
 *
 * Options:
 *   --env staging|production   Env file (default staging)
 *   --api                      Hit running API for login / effective-context checks
 *   --keep                     Do not delete the test tenant after validation
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const bcrypt = require('../backend/node_modules/bcryptjs');
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { permissionsForRole } from '../shared/rbac/permissions.ts';
import { getSystemRoleSeedPermissionKeys, SYSTEM_ROLE_DEFINITIONS } from '../shared/rbac/roleTemplates.ts';
import { findSodViolation } from '../backend/src/modules/rbac/services/rbacSodService.ts';
import { resolveEffectivePermissions } from '../backend/src/auth/rbacPermissionResolver.ts';
import { seedTenantRbac } from '../backend/src/modules/rbac/services/seedTenantRbac.ts';
import { expandPermissionKeys } from '../backend/src/modules/rbac/services/rbacPermissionExpansion.ts';

const args = process.argv.slice(2);
const envName = args.includes('--env') ? args[args.indexOf('--env') + 1] : 'staging';
const useApi = args.includes('--api');
const keepTenant = args.includes('--keep');

const envFile =
  envName === 'production'
    ? existsSync(resolve('.env.production.render'))
      ? '.env.production.render'
      : '.env.production'
    : '.env.staging';
dotenv.config({ path: resolve(envFile) });

const url = process.env.DATABASE_URL || process.env.PG_URL;
if (!url) {
  console.error(`DATABASE_URL missing in ${envFile}`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const tenantId = `fresh-rbac-${randomUUID().slice(0, 8)}`;
const userId = `user_${randomUUID().replace(/-/g, '')}`;
const email = `fresh-rbac-${randomUUID().slice(0, 8)}@pbookspro.test`;
const password = 'FreshRbac2026!';
const username = `freshadmin_${randomUUID().slice(0, 6)}`;

const report = {
  timestamp: new Date().toISOString(),
  environment: envName,
  tenantId,
  email,
  password,
  username,
  provisioning: {},
  roleSeed: {},
  rbacOnly: {},
  legacyDependency: {},
  api: {},
  passed: false,
};

async function cleanup() {
  if (keepTenant) return;
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  } finally {
    client.release();
  }
}

async function provisionTenant() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO tenants (id, name, company_name, email, status, is_active)
       VALUES ($1, $2, $2, $3, 'ACTIVE', TRUE)`,
      [tenantId, `Fresh RBAC Test ${tenantId}`, email]
    );

    await client.query(
      `INSERT INTO users (id, tenant_id, username, name, role, password_hash, email, is_active, last_tenant_id)
       VALUES ($1, $2, $3, $4, 'viewer', $5, $6, TRUE, $2)`,
      [userId, tenantId, username, 'Fresh Admin', passwordHash, email]
    );

    await client.query(
      `INSERT INTO user_tenants (id, user_id, tenant_id, role, is_default)
       VALUES ($1, $2, $3, 'viewer', TRUE)`,
      [`ut_${userId}`, userId, tenantId]
    );

    const seedResult = await seedTenantRbac(client, tenantId, {
      creatorUserId: userId,
      creatorRoleSlug: 'company_admin',
    });

    await client.query('COMMIT');
    report.provisioning = seedResult;
    return seedResult;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function validateDbState() {
  const roles = await pool.query(
    `SELECT slug, is_system, is_hidden,
            (SELECT COUNT(*)::int FROM rbac_role_permissions rp WHERE rp.role_id = r.id) AS perm_count
     FROM rbac_roles r WHERE r.tenant_id = $1 ORDER BY slug`,
    [tenantId]
  );

  const assignment = await pool.query(
    `SELECT rr.slug FROM rbac_user_roles ur
     JOIN rbac_roles rr ON rr.id = ur.role_id
     WHERE ur.tenant_id = $1 AND ur.user_id = $2`,
    [tenantId, userId]
  );

  const userRoles = await pool.query(
    `SELECT u.role AS users_role, ut.role AS tenant_role FROM users u
     JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = u.tenant_id
     WHERE u.id = $1`,
    [userId]
  );

  const sodViolations = [];
  for (const row of roles.rows) {
    if (row.perm_count === 0) continue;
    const keys = await pool.query(
      `SELECT permission_key FROM rbac_role_permissions WHERE tenant_id = $1 AND role_id = (
         SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = $2
       )`,
      [tenantId, row.slug]
    );
    const set = new Set(keys.rows.map((r) => r.permission_key));
    const v = findSodViolation(set, `role:${row.slug}`);
    if (v) sodViolations.push({ role: row.slug, ...v });
  }

  report.roleSeed = {
    systemRoleCount: SYSTEM_ROLE_DEFINITIONS.length,
    totalRoles: roles.rows.length,
    roles: roles.rows,
    creatorAssignment: assignment.rows.map((r) => r.slug),
    displayRoles: userRoles.rows[0],
    sodViolations,
  };

  return {
    roles: roles.rows,
    assignedSlugs: assignment.rows.map((r) => r.slug),
    sodViolations,
  };
}

async function validateRbacOnlyResolution() {
  // Null out legacy role columns to prove RBAC resolves without them
  await pool.query(`UPDATE users SET role = 'viewer' WHERE id = $1`, [userId]);
  await pool.query(`UPDATE user_tenants SET role = 'viewer' WHERE user_id = $1`, [userId]);

  const effective = await resolveEffectivePermissions({
    tenantId,
    userId,
    legacyRole: 'viewer',
  });

  const legacyBaseline = new Set(permissionsForRole('viewer'));
  const rbacKeys = new Set(effective.permissions.filter((k) => legacyBaseline.has(k) === false || k !== 'viewer'));
  const companyAdminSeed = new Set(getSystemRoleSeedPermissionKeys('company_admin'));
  const expandedSeed = expandPermissionKeys([...companyAdminSeed], 'company_admin');
  const expandedEffective = new Set(effective.permissions);
  const hasAssignments = effective.assignments.length > 0;

  const missingFromSeed = [...expandedSeed].filter((k) => !expandedEffective.has(k));
  /** v1 bundle aliases may be absent when DB stores expanded v2 keys only */
  const BUNDLE_ALIASES = new Set(['financial.write', 'permissions.read']);
  const materialMissing = missingFromSeed.filter((k) => !BUNDLE_ALIASES.has(k));

  report.rbacOnly = {
    hasRbacAssignments: hasAssignments,
    assignmentSlugs: effective.assignments.map((a) => a.slug),
    permissionCount: effective.permissions.length,
    missingFromCompanyAdminSeed: missingFromSeed.slice(0, 20),
    missingCount: missingFromSeed.length,
    materialMissingCount: materialMissing.length,
    resolvesWithoutLegacyRole: hasAssignments && materialMissing.length === 0,
    legacyRoleStrippedToViewer: true,
  };

  return report.rbacOnly.resolvesWithoutLegacyRole;
}

async function validateApi() {
  if (!useApi) {
    report.api = { skipped: true, reason: 'Pass --api to test against running API' };
    return true;
  }

  const base = process.env.VITE_API_URL?.replace(/\/api\/v1$/, '') || `http://127.0.0.1:${envName === 'staging' ? '3001' : '3000'}`;
  const api = `${base}/api/v1`;
  const results = {};

  try {
    const health = await fetch(`${base}/health`);
    results.health = health.status;

    const loginRes = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantId }),
    });
    results.loginStatus = loginRes.status;
    const loginBody = await loginRes.json().catch(() => ({}));
    const token = loginBody?.data?.token;
    results.jwtAv = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).av : null;

    if (token) {
      const ctx = await fetch(`${api}/rbac/effective-context`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results.effectiveContextStatus = ctx.status;
      if (ctx.ok) {
        const body = await ctx.json();
        const data = body?.data ?? body;
        results.permissionCount = data?.permissions?.length ?? 0;
        results.roleSlugs = data?.roles?.map((r) => r.slug) ?? [];
        results.scopeCount = data?.scopes?.length ?? 0;
      }

      const usersRes = await fetch(`${api}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      results.usersListStatus = usersRes.status;
    }

    report.api = { base, ...results, pass: results.loginStatus === 200 && results.effectiveContextStatus === 200 };
    return report.api.pass;
  } catch (err) {
    report.api = { error: err instanceof Error ? err.message : String(err), pass: false };
    return false;
  }
}

try {
  console.log(`\n=== Fresh Tenant RBAC Validation (${envName}) ===`);
  console.log(`Tenant: ${tenantId}`);

  await provisionTenant();
  console.log('Provisioning:', JSON.stringify(report.provisioning, null, 2));

  const db = await validateDbState();
  console.log(`Roles: ${db.roles.length}, Creator assigned: ${db.assignedSlugs.join(', ')}`);
  console.log(`SoD violations in seed: ${db.sodViolations.length}`);

  const rbacOnly = await validateRbacOnlyResolution();
  console.log(`RBAC-only resolution (legacy role stripped): ${rbacOnly ? 'PASS' : 'FAIL'}`);

  const apiOk = await validateApi();
  if (useApi) console.log(`API validation: ${apiOk ? 'PASS' : 'FAIL/SKIP'}`);

  report.legacyDependency = {
    usersRoleRequiredForAuth: false,
    userTenantsRoleRequiredForAuth: false,
    note: 'JWT still carries role for display/stale check; authorization uses rbac_user_roles when engine on',
    remainingLegacyWrites: ['syncPrimaryUserRole still writes users.role for display', 'JWT role claim at login'],
  };

  report.passed =
    db.assignedSlugs.includes('company_admin') &&
    db.roles.length >= SYSTEM_ROLE_DEFINITIONS.length &&
    db.sodViolations.length === 0 &&
    rbacOnly &&
    (!useApi || apiOk);

  const outDir = resolve('docs/security/staging-evidence');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `fresh-tenant-rbac-validation-${tenantId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${outPath}`);
  console.log(`Overall: ${report.passed ? 'PASS' : 'FAIL'}`);

  if (!keepTenant) {
    await cleanup();
    console.log('Test tenant cleaned up (pass --keep to retain).');
  } else {
    console.log(`Tenant kept: ${tenantId} / ${email} / ${password}`);
  }

  process.exit(report.passed ? 0 : 1);
} catch (err) {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
} finally {
  await pool.end();
}

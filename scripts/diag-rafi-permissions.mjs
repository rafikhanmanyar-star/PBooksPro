/**
 * Diagnose effective permission resolution for a user (staging/local).
 * Usage: node --import tsx scripts/diag-rafi-permissions.mjs --tenant test-company --username Rafi --env staging
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const envName = flag('--env') || 'staging';
const envFile = envName === 'production' ? '.env.production' : '.env.staging';
const envPath = resolve(process.cwd(), envFile);
if (existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

const tenantQuery = flag('--tenant') || 'test-company';
const username = flag('--username') || 'Rafi';

const { resolveEffectivePermissions } = await import('../backend/src/auth/rbacPermissionResolver.js');
const { buildEffectiveAccessContext } = await import('../backend/src/auth/effectiveAccessContext.js');
const { hasPermission } = await import('../backend/src/auth/permissionEvaluator.js');
const { ALL_PERMISSIONS } = await import('../backend/src/auth/permissions.js');
const { FINANCIAL_WRITE_BUNDLE } = await import('../backend/src/auth/permissionBundles.js');
const { resolveEnterpriseRole } = await import('../backend/src/auth/permissions.js');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const tenants = await pool.query(
  `SELECT id, name FROM tenants WHERE id ILIKE $1 OR name ILIKE $1 LIMIT 1`,
  [`%${tenantQuery}%`]
);
const tenantId = tenants.rows[0]?.id;
if (!tenantId) {
  console.error('Tenant not found');
  process.exit(1);
}

const users = await pool.query(
  `SELECT id, username, name, email, role FROM users WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)`,
  [tenantId, username]
);
const user = users.rows[0];
if (!user) {
  console.error('User not found');
  process.exit(1);
}

const assignments = await pool.query(
  `SELECT ur.user_id, ur.role_id, r.slug, r.name AS role_name, r.is_system
   FROM rbac_user_roles ur
   INNER JOIN rbac_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
   WHERE ur.tenant_id = $1 AND ur.user_id = $2 AND COALESCE(ur.is_active, TRUE) = TRUE`,
  [tenantId, user.id]
);

const rolePerms = await pool.query(
  `SELECT r.slug, rp.permission_key
   FROM rbac_user_roles ur
   INNER JOIN rbac_roles r ON r.id = ur.role_id
   LEFT JOIN rbac_role_permissions rp ON rp.role_id = r.id AND rp.tenant_id = ur.tenant_id
   WHERE ur.tenant_id = $1 AND ur.user_id = $2`,
  [tenantId, user.id]
);

const { permissions, assignments: activeAssignments } = await resolveEffectivePermissions({
  tenantId,
  userId: user.id,
  legacyRole: user.role,
});

const enterprise = resolveEnterpriseRole(user.role);
const ctx = buildEffectiveAccessContext({
  userId: user.id,
  tenantId,
  permissions,
  assignments: activeAssignments,
  accessVersion: 1,
  roleVersionHash: 'diag',
});

const missingBundle = FINANCIAL_WRITE_BUNDLE.filter((k) => !permissions.includes(k));

console.log(JSON.stringify({
  tenantId,
  user: { id: user.id, username: user.username, email: user.email, usersRole: user.role, enterpriseRole: enterprise },
  rbacUserRoles: assignments.rows,
  rbacRolePermissionsSample: rolePerms.rows.filter((r) => r.permission_key).slice(0, 10),
  rbacRolePermissionRowCount: rolePerms.rows.filter((r) => r.permission_key).length,
  resolvedPermissionCount: permissions.length,
  hasFinancialWriteInResolved: permissions.includes('financial.write'),
  hasUsersManageInResolved: permissions.includes('users.manage'),
  hasPermissionFinancialWrite: hasPermission(ctx, 'financial.write', enterprise),
  hasPermissionUsersManage: hasPermission(ctx, 'users.manage', enterprise),
  missingFinancialWriteBundleKeys: missingBundle.length,
  missingBundleSample: missingBundle.slice(0, 8),
  allPermissionsCount: ALL_PERMISSIONS.length,
  uiShowsFinancialWrite: ALL_PERMISSIONS.includes('financial.write'),
}, null, 2));

await pool.end();

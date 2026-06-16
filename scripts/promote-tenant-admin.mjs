/**
 * Promote a tenant admin to Super Admin (RBAC) on staging or production PostgreSQL.
 *
 * Usage:
 *   node scripts/promote-tenant-admin.mjs --tenant pakland
 *   node scripts/promote-tenant-admin.mjs --tenant pakland --email admin@pakland.com
 *   node scripts/promote-tenant-admin.mjs --tenant pakland --fix-sales-roles
 *   node scripts/promote-tenant-admin.mjs --tenant pakland --env production
 *
 * Loads .env.staging by default, or .env.production when --env production.
 * Requires DATABASE_URL in the chosen env file (cloud: use your hosted Postgres URL).
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
const hasFlag = (name) => args.includes(name);

const envName = flag('--env') || 'staging';
const envFile = envName === 'production' ? '.env.production' : '.env.staging';
const envPath = resolve(process.cwd(), envFile);
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const tenantQuery = flag('--tenant');
const userEmail = flag('--email');
const userUsername = flag('--username');
const fixSalesRoles = hasFlag('--fix-sales-roles');

if (!tenantQuery) {
  console.error('Usage: node scripts/promote-tenant-admin.mjs --tenant <name-or-id> [--email user@co.com] [--env production] [--fix-sales-roles]');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`DATABASE_URL missing — set ${envFile} or export DATABASE_URL`);
  process.exit(1);
}

/** Sales User permissions required for marketing plans (projects, units, contacts). */
const SALES_USER_PERMISSION_KEYS = [
  'project_selling.read',
  'project_selling.catalog.write',
  'project_selling.marketing_plans.write',
  'project_selling.agreements.write',
  'project_selling.invoices.write',
  'project_selling.payments.receive',
];

const pool = new pg.Pool({ connectionString: url });

try {
  const tenants = await pool.query(
    `SELECT id, COALESCE(NULLIF(TRIM(company_name), ''), name) AS display_name, name, company_name, email
     FROM tenants
     WHERE id ILIKE $1
        OR name ILIKE $1
        OR company_name ILIKE $1
     ORDER BY LOWER(COALESCE(NULLIF(TRIM(company_name), ''), name))`,
    [`%${tenantQuery}%`]
  );

  if (tenants.rows.length === 0) {
    console.error(`No tenant matching "${tenantQuery}"`);
    process.exit(1);
  }
  if (tenants.rows.length > 1) {
    console.log('Multiple tenants matched — pick one with --tenant <exact-id>:');
    for (const t of tenants.rows) {
      console.log(`  ${t.id}  ${t.display_name}  (${t.email || 'no company email'})`);
    }
    process.exit(1);
  }

  const tenant = tenants.rows[0];
  const tenantId = tenant.id;
  console.log(`Tenant: ${tenant.display_name} (${tenantId})`);

  let userRow;
  if (userEmail) {
    const r = await pool.query(
      `SELECT id, username, name, email, role FROM users
       WHERE tenant_id = $1 AND LOWER(email) = LOWER($2) AND COALESCE(is_active, TRUE) = TRUE
       LIMIT 1`,
      [tenantId, userEmail]
    );
    userRow = r.rows[0];
  } else if (userUsername) {
    const r = await pool.query(
      `SELECT id, username, name, email, role FROM users
       WHERE tenant_id = $1 AND LOWER(username) = LOWER($2) AND COALESCE(is_active, TRUE) = TRUE
       LIMIT 1`,
      [tenantId, userUsername]
    );
    userRow = r.rows[0];
  } else {
    const r = await pool.query(
      `SELECT id, username, name, email, role FROM users
       WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
         AND (
           role IN ('Admin', 'SUPER_ADMIN', 'Super Admin', 'company_admin', 'super_admin')
           OR LOWER(role) IN ('admin', 'manager')
         )
       ORDER BY CASE WHEN role IN ('SUPER_ADMIN', 'super_admin') THEN 0 WHEN role = 'Admin' THEN 1 ELSE 2 END,
                LOWER(username)
       LIMIT 1`,
      [tenantId]
    );
    userRow = r.rows[0];
  }

  if (!userRow) {
    console.error('Admin user not found. Use --email or --username.');
    const all = await pool.query(
      `SELECT username, email, role FROM users WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE ORDER BY username`,
      [tenantId]
    );
    console.log('Active users:', all.rows);
    process.exit(1);
  }

  console.log(`Promoting: ${userRow.name} <${userRow.email || userRow.username}> (was role: ${userRow.role})`);

  const superRole = await pool.query(
    `SELECT id, slug FROM rbac_roles WHERE tenant_id = $1 AND slug = 'super_admin' LIMIT 1`,
    [tenantId]
  );
  if (superRole.rows.length === 0) {
    console.error('RBAC migration 131 may not be applied — no super_admin role for this tenant.');
    process.exit(1);
  }
  const superRoleId = superRole.rows[0].id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE users SET role = 'SUPER_ADMIN', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [userRow.id, tenantId]
    );
    await client.query(
      `UPDATE user_tenants SET role = 'SUPER_ADMIN' WHERE user_id = $1 AND tenant_id = $2`,
      [userRow.id, tenantId]
    );

    await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2`, [
      tenantId,
      userRow.id,
    ]);
    await client.query(
      `INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [tenantId, userRow.id, superRoleId]
    );

    if (fixSalesRoles) {
      const salesRoles = await client.query(
        `SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = 'sales_user'`,
        [tenantId]
      );
      for (const row of salesRoles.rows) {
        await client.query(`DELETE FROM rbac_role_permissions WHERE tenant_id = $1 AND role_id = $2`, [
          tenantId,
          row.id,
        ]);
        for (const key of SALES_USER_PERMISSION_KEYS) {
          await client.query(
            `INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [tenantId, row.id, key]
          );
        }
      }
      const salesUsers = await client.query(
        `SELECT id, username, email, role FROM users
         WHERE tenant_id = $1 AND COALESCE(is_active, TRUE) = TRUE
           AND (
             role ILIKE '%sales%'
             OR id IN (
               SELECT ur.user_id FROM rbac_user_roles ur
               INNER JOIN rbac_roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
               WHERE ur.tenant_id = $1 AND r.slug = 'sales_user'
             )
           )`,
        [tenantId]
      );
      for (const su of salesUsers.rows) {
        await client.query(
          `UPDATE users SET role = 'Sales User', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [su.id, tenantId]
        );
        await client.query(
          `UPDATE user_tenants SET role = 'Sales User' WHERE user_id = $1 AND tenant_id = $2`,
          [su.id, tenantId]
        );
        const salesRoleId = salesRoles.rows[0]?.id;
        if (salesRoleId) {
          await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2`, [
            tenantId,
            su.id,
          ]);
          await client.query(
            `INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
             VALUES ($1, $2, $3, NULL) ON CONFLICT DO NOTHING`,
            [tenantId, su.id, salesRoleId]
          );
        }
      }
      console.log(`Fixed ${salesUsers.rows.length} sales user(s) and sales_user role permissions.`);
    }

    await client.query('COMMIT');
    console.log('Done. User is now Super Admin (all permissions + Role Management).');
    console.log('They must log out and log back in for permissions to refresh.');
    if (!fixSalesRoles) {
      console.log('Tip: re-run with --fix-sales-roles to restore marketing-plan access for Sales Users.');
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

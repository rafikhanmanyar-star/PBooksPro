/**
 * Stage 6 SoD remediation for staging tenants.
 * Seeds explicit rbac_role_permissions on preparer roles (SoD-safe) and finance_approver split.
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { resolve } from 'node:path';
import { permissionsForRole } from '../shared/rbac/permissions.ts';
import { ALL_SOD_PAIRS } from '../shared/rbac/sodPairs.ts';
import { seedTenantApprovalMatrix } from '../backend/src/modules/rbac/services/approvalMatrixSeed.ts';

dotenv.config({ path: resolve('.env.staging') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

const PREPARER_SLUGS = ['company_admin', 'accountant'];

function approveKeysToStrip(preparerKeys) {
  const set = new Set(preparerKeys);
  const strip = new Set();
  for (const pair of ALL_SOD_PAIRS) {
    if (set.has(pair.permissionA) && set.has(pair.permissionB)) strip.add(pair.permissionB);
  }
  return strip;
}

async function seedPreparerRoles(tenantId) {
  for (const slug of PREPARER_SLUGS) {
    const role = await client.query(
      `SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = $2`,
      [tenantId, slug]
    );
    if (!role.rows[0]) continue;
    const roleId = role.rows[0].id;
    const base = permissionsForRole(slug);
    const strip = approveKeysToStrip(base);
    const keys = base.filter((k) => !strip.has(k));
    await client.query(`DELETE FROM rbac_role_permissions WHERE tenant_id = $1 AND role_id = $2`, [
      tenantId,
      roleId,
    ]);
    for (const key of keys) {
      await client.query(
        `INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [tenantId, roleId, key]
      );
    }
    console.log(`[${tenantId}] ${slug}: ${keys.length} keys (stripped ${[...strip].join(', ')})`);
  }
}

async function ensureFinanceApprover(tenantId) {
  const slug = 'finance_approver';
  const id = `rbac_${tenantId}_${slug}`;
  await client.query(
    `INSERT INTO rbac_roles (id, tenant_id, slug, name, description, status, is_system, is_protected, role_type)
     VALUES ($1,$2,$3,'Finance Approver','SoD approver','active',FALSE,FALSE,'custom')
     ON CONFLICT (tenant_id, slug) DO NOTHING`,
    [id, tenantId, slug]
  );
  const role = await client.query(`SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = $2`, [tenantId, slug]);
  const keys = [
    'procurement.quotations.approve',
    'procurement.bills.approve',
    'procurement.purchase_orders.approve',
    'workflow.approve',
    'accounting.journals.approve',
  ];
  await client.query(`DELETE FROM rbac_role_permissions WHERE tenant_id = $1 AND role_id = $2`, [
    tenantId,
    role.rows[0].id,
  ]);
  for (const k of keys) {
    await client.query(
      `INSERT INTO rbac_role_permissions (tenant_id, role_id, permission_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [tenantId, role.rows[0].id, k]
    );
  }
  return role.rows[0].id;
}

try {
  await client.query('BEGIN');
  const tenants = ['test-company', 'test2'];

  for (const tenantId of tenants) {
    console.log(`\n=== ${tenantId} ===`);
    await seedPreparerRoles(tenantId);
    await seedTenantApprovalMatrix(client, tenantId);
    const approverRoleId = await ensureFinanceApprover(tenantId);

    if (tenantId === 'test-company') {
      const rafi = await client.query(`SELECT id FROM users WHERE id = 'user_rafi_test_company'`);
      if (rafi.rows[0]) {
        await client.query(
          `DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2
           AND role_id IN (SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = 'company_admin')`,
          [tenantId, rafi.rows[0].id]
        );
      }
      const sales1 = await client.query(
        `SELECT id FROM users WHERE tenant_id = $1 AND username = 'Sales1'`,
        [tenantId]
      );
      const iht = await client.query(`SELECT id FROM users WHERE tenant_id = $1 AND username = 'Iht'`, [tenantId]);
      if (iht.rows[0]) {
        await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2 AND role_id = $3`, [
          tenantId,
          iht.rows[0].id,
          approverRoleId,
        ]);
      }
      if (sales1.rows[0]) {
        await client.query(
          `INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
           VALUES ($1,$2,$3,'staging-sod-remediation') ON CONFLICT DO NOTHING`,
          [tenantId, sales1.rows[0].id, approverRoleId]
        );
        const rule = await client.query(
          `SELECT id FROM rbac_approval_rules WHERE tenant_id = $1 AND entity_type = 'manual_journal' LIMIT 1`,
          [tenantId]
        );
        if (rule.rows[0]) {
          await client.query(
            `INSERT INTO rbac_approval_assignments (id, tenant_id, rule_id, assignee_type, assignee_id, is_active)
             SELECT $1,$2,$3,'user',$4,TRUE WHERE NOT EXISTS (
               SELECT 1 FROM rbac_approval_assignments WHERE tenant_id = $2 AND rule_id = $3 AND assignee_id = $4)`,
            [`assign_${tenantId}_mj`, tenantId, rule.rows[0].id, sales1.rows[0].id]
          );
        }
      }
      const sec = await client.query(
        `SELECT id FROM users WHERE tenant_id = $1 AND LOWER(username) = 'security'`,
        [tenantId]
      );
      const secRole = await client.query(
        `SELECT id FROM rbac_roles WHERE tenant_id = $1 AND slug = 'security_administrator'`,
        [tenantId]
      );
      if (sec.rows[0] && secRole.rows[0]) {
        await client.query(`DELETE FROM rbac_user_roles WHERE tenant_id = $1 AND user_id = $2`, [
          tenantId,
          sec.rows[0].id,
        ]);
        await client.query(
          `INSERT INTO rbac_user_roles (tenant_id, user_id, role_id, assigned_by)
           VALUES ($1,$2,$3,'staging-sod-remediation') ON CONFLICT DO NOTHING`,
          [tenantId, sec.rows[0].id, secRole.rows[0].id]
        );
      }
    }
  }
  await client.query('COMMIT');
  console.log('\nRemediation committed.');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}

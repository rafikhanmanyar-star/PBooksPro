/**
 * Default approval matrix seeds per tenant (Architecture §6.2, §6.4).
 */
import { randomUUID } from 'crypto';
import type pg from 'pg';

const DEFAULT_CAPABILITIES = [
  { key: 'approve.journals', entity: 'manual_journal', perm: 'accounting.journals.approve', max: 2 },
  { key: 'approve.journals.reversal', entity: 'journal_reversal', perm: 'accounting.journals.approve', max: 1 },
  { key: 'approve.bills', entity: 'bill', perm: 'procurement.bills.approve', max: 2 },
  { key: 'approve.payments', entity: 'payment', perm: 'approve.payments', max: 2 },
  { key: 'approve.procurement', entity: 'purchase_order', perm: 'procurement.purchase_orders.approve', max: 2 },
  { key: 'approve.payroll', entity: 'payroll_run', perm: 'payroll.runs.approve', max: 2 },
  { key: 'approve.agreements', entity: 'rental_agreement', perm: 'rental.agreements.approve', max: 2 },
] as const;

const DEFAULT_RULES = [
  {
    entity: 'manual_journal',
    priority: 100,
    level: 1,
    min: 1,
    self: false,
    perm: 'accounting.journals.approve',
    mandatory: true,
  },
  {
    entity: 'journal_reversal',
    priority: 100,
    level: 1,
    min: 1,
    self: false,
    perm: 'accounting.journals.approve',
    mandatory: true,
  },
  { entity: 'bill', priority: 100, level: 1, min: 1, self: false, perm: 'procurement.bills.approve', mandatory: false },
  { entity: 'payment', priority: 100, level: 1, min: 1, self: false, perm: 'approve.payments', mandatory: false },
  {
    entity: 'purchase_order',
    priority: 100,
    level: 1,
    min: 1,
    self: false,
    perm: 'procurement.purchase_orders.approve',
    mandatory: false,
  },
  { entity: 'payroll_run', priority: 100, level: 1, min: 1, self: false, perm: 'payroll.runs.approve', mandatory: false },
  {
    entity: 'rental_agreement',
    priority: 100,
    level: 1,
    min: 1,
    self: false,
    perm: 'rental.agreements.approve',
    mandatory: false,
  },
] as const;

export async function seedTenantApprovalMatrix(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(
    `INSERT INTO rbac_approval_matrix (tenant_id, version, is_active)
     VALUES ($1, 1, TRUE) ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );

  for (const cap of DEFAULT_CAPABILITIES) {
    const existing = await client.query(
      `SELECT id FROM rbac_approval_capabilities
       WHERE tenant_id = $1 AND capability_key = $2`,
      [tenantId, cap.key]
    );
    if (existing.rows.length > 0) continue;
    await client.query(
      `INSERT INTO rbac_approval_capabilities (
         id, tenant_id, capability_key, entity_type, required_permission, max_level, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
      [randomUUID(), tenantId, cap.key, cap.entity, cap.perm, cap.max]
    );
  }

  for (const rule of DEFAULT_RULES) {
    const existing = await client.query(
      `SELECT id FROM rbac_approval_rules
       WHERE tenant_id = $1 AND entity_type = $2 AND approval_level = $3 AND is_mandatory = $4`,
      [tenantId, rule.entity, rule.level, rule.mandatory]
    );
    if (existing.rows.length > 0) continue;
    await client.query(
      `INSERT INTO rbac_approval_rules (
         id, tenant_id, entity_type, priority, approval_level, min_approvers,
         allow_self_approval, required_permission, conditions, is_mandatory, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'{}'::jsonb,$9,TRUE)`,
      [
        randomUUID(),
        tenantId,
        rule.entity,
        rule.priority,
        rule.level,
        rule.min,
        rule.self,
        rule.perm,
        rule.mandatory,
      ]
    );
  }
}

/** Migration helper — seed all existing tenants. */
export async function seedAllTenantsApprovalMatrix(client: pg.PoolClient): Promise<void> {
  const tenants = await client.query<{ id: string }>(`SELECT id FROM tenants`);
  for (const row of tenants.rows) {
    await seedTenantApprovalMatrix(client, row.id);
  }
}

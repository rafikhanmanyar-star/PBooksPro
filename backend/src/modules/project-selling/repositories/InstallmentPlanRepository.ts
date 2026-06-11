import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { InstallmentPlanRow } from '../../../services/installmentPlansService.js';

const SELECT_IP = `SELECT id, tenant_id, project_id, lead_id, unit_id, net_value::text, status, duration_years,
  down_payment_percentage::text, frequency, list_price::text, customer_discount::text, floor_discount::text,
  lump_sum_discount::text, misc_discount::text, down_payment_amount::text, installment_amount::text, total_installments,
  description, user_id, intro_text, root_id, approval_requested_by, approval_requested_to, approval_requested_at,
  approval_reviewed_by, approval_reviewed_at, discounts, customer_discount_category_id, floor_discount_category_id,
  lump_sum_discount_category_id, misc_discount_category_id, selected_amenities, amenities_total::text,
  created_at, updated_at, version, deleted_at
  FROM installment_plans`;

export type InstallmentPlanListFilters = {
  projectId?: string;
};

export class InstallmentPlanRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<InstallmentPlanRow | null> {
    const r = await client.query<InstallmentPlanRow>(
      `${SELECT_IP} WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<InstallmentPlanRow | null> {
    const r = await client.query<InstallmentPlanRow>(
      `${SELECT_IP} WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, filters?: InstallmentPlanListFilters): Promise<InstallmentPlanRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `${SELECT_IP} WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.projectId) {
      params.push(filters.projectId);
      q += ` AND project_id = $${params.length}`;
    }
    q += ` ORDER BY updated_at DESC`;
    const r = await client.query<InstallmentPlanRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<InstallmentPlanRow[]> {
    const r = await client.query<InstallmentPlanRow>(
      `${SELECT_IP} WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}

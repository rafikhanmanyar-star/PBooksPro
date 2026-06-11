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

  /** Field values from project_id through amenities_total (32 params). */
  async insertPlan(client: pg.PoolClient, id: string, fieldValues: unknown[]): Promise<InstallmentPlanRow> {
    const r = await client.query<InstallmentPlanRow>(
      `INSERT INTO installment_plans (
        id, tenant_id, project_id, lead_id, unit_id, net_value, status, duration_years, down_payment_percentage,
        frequency, list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount,
        down_payment_amount, installment_amount, total_installments, description, user_id, intro_text, root_id,
        approval_requested_by, approval_requested_to, approval_requested_at, approval_reviewed_by, approval_reviewed_at,
        discounts, customer_discount_category_id, floor_discount_category_id, lump_sum_discount_category_id,
        misc_discount_category_id, selected_amenities, amenities_total, version, deleted_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25::timestamptz, $26, $27::timestamptz, $28::jsonb, $29, $30, $31, $32, $33::jsonb, $34,
        1, NULL, NOW(), NOW()
      )
      RETURNING *`,
      [id, this.tenantId, ...fieldValues]
    );
    return r.rows[0]!;
  }

  async updatePlan(
    client: pg.PoolClient,
    id: string,
    fieldValues: unknown[],
    options?: { activeOnly?: boolean }
  ): Promise<InstallmentPlanRow | null> {
    const activeOnly = options?.activeOnly === true;
    const r = await client.query<InstallmentPlanRow>(
      `UPDATE installment_plans SET
        project_id = $3, lead_id = $4, unit_id = $5, net_value = $6, status = $7, duration_years = $8,
        down_payment_percentage = $9, frequency = $10, list_price = $11, customer_discount = $12, floor_discount = $13,
        lump_sum_discount = $14, misc_discount = $15, down_payment_amount = $16, installment_amount = $17,
        total_installments = $18, description = $19, user_id = COALESCE($20, user_id), intro_text = $21, root_id = $22,
        approval_requested_by = $23, approval_requested_to = $24, approval_requested_at = $25::timestamptz,
        approval_reviewed_by = $26, approval_reviewed_at = $27::timestamptz,
        discounts = $28::jsonb, customer_discount_category_id = $29, floor_discount_category_id = $30,
        lump_sum_discount_category_id = $31, misc_discount_category_id = $32, selected_amenities = $33::jsonb,
        amenities_total = $34, deleted_at = NULL, version = version + 1, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2${activeOnly ? ' AND deleted_at IS NULL' : ''}
        RETURNING *`,
      [id, this.tenantId, ...fieldValues]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE installment_plans SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}

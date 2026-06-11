import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ProjectAgreementRow } from '../../../services/projectAgreementsService.js';

export type ProjectAgreementWriteFields = {
  agreement_number: string;
  client_id: string;
  project_id: string;
  unit_ids_json: string;
  list_price: number;
  customer_discount: number;
  floor_discount: number;
  lump_sum_discount: number;
  misc_discount: number;
  selling_price: number;
  rebate_amount: number | null;
  rebate_broker_id: string | null;
  issue_date: string;
  description: string | null;
  status: string;
  cancellation_details: string | null;
  installment_plan: string | null;
  list_price_category_id: string | null;
  customer_discount_category_id: string | null;
  floor_discount_category_id: string | null;
  lump_sum_discount_category_id: string | null;
  misc_discount_category_id: string | null;
  selling_price_category_id: string | null;
  rebate_category_id: string | null;
  user_id: string | null;
};

function projectAgreementFieldParams(fields: ProjectAgreementWriteFields): unknown[] {
  return [
    fields.agreement_number,
    fields.client_id,
    fields.project_id,
    fields.unit_ids_json,
    fields.list_price,
    fields.customer_discount,
    fields.floor_discount,
    fields.lump_sum_discount,
    fields.misc_discount,
    fields.selling_price,
    fields.rebate_amount,
    fields.rebate_broker_id,
    fields.issue_date,
    fields.description,
    fields.status,
    fields.cancellation_details,
    fields.installment_plan,
    fields.list_price_category_id,
    fields.customer_discount_category_id,
    fields.floor_discount_category_id,
    fields.lump_sum_discount_category_id,
    fields.misc_discount_category_id,
    fields.selling_price_category_id,
    fields.rebate_category_id,
    fields.user_id,
  ];
}

const PROJECT_AGREEMENT_COLUMNS = `id, tenant_id, agreement_number, client_id, project_id, unit_ids,
  list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
  rebate_amount, rebate_broker_id, issue_date, description, status,
  cancellation_details, installment_plan,
  list_price_category_id, customer_discount_category_id, floor_discount_category_id,
  lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
  user_id, version, deleted_at, created_at, updated_at`;

export type ProjectAgreementListFilters = {
  status?: string;
  projectId?: string;
  clientId?: string;
};

export class ProjectAgreementRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ProjectAgreementRow | null> {
    const r = await client.query<ProjectAgreementRow>(
      `SELECT ${PROJECT_AGREEMENT_COLUMNS}
       FROM project_agreements WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: ProjectAgreementListFilters): Promise<ProjectAgreementRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${PROJECT_AGREEMENT_COLUMNS}
             FROM project_agreements WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.status) {
      params.push(filters.status);
      q += ` AND status = $${params.length}`;
    }
    if (filters?.projectId) {
      params.push(filters.projectId);
      q += ` AND project_id = $${params.length}`;
    }
    if (filters?.clientId) {
      params.push(filters.clientId);
      q += ` AND client_id = $${params.length}`;
    }
    q += ' ORDER BY issue_date DESC NULLS LAST, agreement_number ASC';
    const r = await client.query<ProjectAgreementRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ProjectAgreementRow[]> {
    const r = await client.query<ProjectAgreementRow>(
      `SELECT ${PROJECT_AGREEMENT_COLUMNS}
       FROM project_agreements WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertAgreement(
    client: pg.PoolClient,
    id: string,
    fields: ProjectAgreementWriteFields
  ): Promise<ProjectAgreementRow> {
    const r = await client.query<ProjectAgreementRow>(
      `INSERT INTO project_agreements (
         id, tenant_id, agreement_number, client_id, project_id, unit_ids,
         list_price, customer_discount, floor_discount, lump_sum_discount, misc_discount, selling_price,
         rebate_amount, rebate_broker_id, issue_date, description, status,
         cancellation_details, installment_plan,
         list_price_category_id, customer_discount_category_id, floor_discount_category_id,
         lump_sum_discount_category_id, misc_discount_category_id, selling_price_category_id, rebate_category_id,
         user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15::date, $16, $17,
         $18::jsonb, $19::jsonb,
         $20, $21, $22, $23, $24, $25, $26,
         $27, 1, NULL, NOW(), NOW()
       )
       RETURNING ${PROJECT_AGREEMENT_COLUMNS}`,
      [id, this.tenantId, ...projectAgreementFieldParams(fields)]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: ProjectAgreementWriteFields
  ): Promise<ProjectAgreementRow | null> {
    const r = await client.query<ProjectAgreementRow>(
      `UPDATE project_agreements SET
         agreement_number = $3, client_id = $4, project_id = $5, unit_ids = $6,
         list_price = $7, customer_discount = $8, floor_discount = $9, lump_sum_discount = $10, misc_discount = $11,
         selling_price = $12, rebate_amount = $13, rebate_broker_id = $14, issue_date = $15::date, description = $16,
         status = $17, cancellation_details = $18::jsonb, installment_plan = $19::jsonb,
         list_price_category_id = $20, customer_discount_category_id = $21, floor_discount_category_id = $22,
         lump_sum_discount_category_id = $23, misc_discount_category_id = $24, selling_price_category_id = $25, rebate_category_id = $26,
         user_id = $27, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PROJECT_AGREEMENT_COLUMNS}`,
      [id, this.tenantId, ...projectAgreementFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async deleteAgreementUnits(client: pg.PoolClient, agreementId: string): Promise<void> {
    await client.query(`DELETE FROM project_agreement_units WHERE agreement_id = $1`, [agreementId]);
  }

  async insertAgreementUnit(client: pg.PoolClient, agreementId: string, unitId: string): Promise<void> {
    await client.query(
      `INSERT INTO project_agreement_units (agreement_id, unit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [agreementId, unitId]
    );
  }

  async replaceAgreementUnits(client: pg.PoolClient, agreementId: string, unitIds: string[]): Promise<void> {
    await this.deleteAgreementUnits(client, agreementId);
    for (const uid of unitIds) {
      if (!uid || !String(uid).trim()) continue;
      await this.insertAgreementUnit(client, agreementId, String(uid).trim());
    }
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<ProjectAgreementRow | null> {
    const r = await client.query<ProjectAgreementRow>(
      `UPDATE project_agreements SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${PROJECT_AGREEMENT_COLUMNS}`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }
}

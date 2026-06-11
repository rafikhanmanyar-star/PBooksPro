import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ProjectAgreementRow } from '../../../services/projectAgreementsService.js';

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
}

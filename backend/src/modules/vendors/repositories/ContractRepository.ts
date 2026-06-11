import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ContractRow } from '../../../services/contractsService.js';

const CONTRACT_COLUMNS = `id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
  start_date, end_date, status, category_ids, expense_category_items,
  terms_and_conditions, payment_terms, description, document_path, document_id,
  user_id, version, deleted_at, created_at, updated_at`;

export type ContractListFilters = {
  status?: string;
  projectId?: string;
  vendorId?: string;
};

export class ContractRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<ContractRow | null> {
    const r = await client.query<ContractRow>(
      `SELECT ${CONTRACT_COLUMNS}
       FROM contracts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<ContractRow | null> {
    const r = await client.query<ContractRow>(
      `SELECT ${CONTRACT_COLUMNS}
       FROM contracts WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, filters?: ContractListFilters): Promise<ContractRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${CONTRACT_COLUMNS}
             FROM contracts WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.status) {
      params.push(filters.status);
      q += ` AND status = $${params.length}`;
    }
    if (filters?.projectId) {
      params.push(filters.projectId);
      q += ` AND project_id = $${params.length}`;
    }
    if (filters?.vendorId) {
      params.push(filters.vendorId);
      q += ` AND vendor_id = $${params.length}`;
    }
    q += ' ORDER BY start_date DESC NULLS LAST, contract_number ASC';
    const r = await client.query<ContractRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<ContractRow[]> {
    const r = await client.query<ContractRow>(
      `SELECT ${CONTRACT_COLUMNS}
       FROM contracts WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}

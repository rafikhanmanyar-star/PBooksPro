import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { ContractRow } from '../../../services/contractsService.js';

const CONTRACT_COLUMNS = `id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
  start_date, end_date, status, category_ids, expense_category_items,
  terms_and_conditions, payment_terms, description, document_path, document_id,
  user_id, version, deleted_at, created_at, updated_at`;

export type ContractWriteFields = {
  contract_number: string;
  name: string;
  project_id: string;
  vendor_id: string;
  total_amount: number;
  area: number | null;
  rate: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  category_ids: string;
  expense_category_items: string | null;
  terms_and_conditions: string | null;
  payment_terms: string | null;
  description: string | null;
  document_path: string | null;
  document_id: string | null;
};

function contractFieldParams(fields: ContractWriteFields): unknown[] {
  return [
    fields.contract_number,
    fields.name,
    fields.project_id,
    fields.vendor_id,
    fields.total_amount,
    fields.area,
    fields.rate,
    fields.start_date,
    fields.end_date,
    fields.status,
    fields.category_ids,
    fields.expense_category_items,
    fields.terms_and_conditions,
    fields.payment_terms,
    fields.description,
    fields.document_path,
    fields.document_id,
  ];
}

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

  async insertContract(
    client: pg.PoolClient,
    id: string,
    fields: ContractWriteFields,
    userId: string | null
  ): Promise<ContractRow> {
    const r = await client.query<ContractRow>(
      `INSERT INTO contracts (
         id, tenant_id, contract_number, name, project_id, vendor_id, total_amount, area, rate,
         start_date, end_date, status, category_ids, expense_category_items,
         terms_and_conditions, payment_terms, description, document_path, document_id,
         user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, $11::date, $12, $13, $14, $15, $16, $17, $18, $19,
         $20, 1, NULL, NOW(), NOW()
       )
       RETURNING ${CONTRACT_COLUMNS}`,
      [id, this.tenantId, ...contractFieldParams(fields), userId]
    );
    return r.rows[0]!;
  }

  async updateUpsert(client: pg.PoolClient, id: string, fields: ContractWriteFields): Promise<ContractRow | null> {
    const r = await client.query<ContractRow>(
      `UPDATE contracts SET
         contract_number = $3, name = $4, project_id = $5, vendor_id = $6,
         total_amount = $7, area = $8, rate = $9,
         start_date = $10::date, end_date = $11::date, status = $12,
         category_ids = $13, expense_category_items = $14,
         terms_and_conditions = $15, payment_terms = $16, description = $17,
         document_path = $18, document_id = $19,
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${CONTRACT_COLUMNS}`,
      [id, this.tenantId, ...contractFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE contracts SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}

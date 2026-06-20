import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { RentalAgreementRow } from '../services/rentalAgreementsService.js';
import type { DataScopeEnforcementContext } from '../../../auth/tenantRepositoryScope.js';
import {
  appendScopeFragment,
  applyOwnerScope,
  applyPropertyScope,
  rowMatchesScope,
} from '../../../auth/tenantRepositoryScope.js';

const RENTAL_AGREEMENT_COLUMNS = `id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent,
  rent_due_date, status, description, security_deposit, broker_id, broker_fee, owner_id, previous_agreement_id,
  version, deleted_at, created_at, updated_at`;

export type RentalAgreementWriteFields = {
  agreement_number: string;
  contact_id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  rent_due_date: number;
  status: string;
  description: string | null;
  security_deposit: number | null;
  broker_id: string | null;
  broker_fee: number | null;
  owner_id: string | null;
  previous_agreement_id: string | null;
};

function rentalFieldParams(fields: RentalAgreementWriteFields): unknown[] {
  return [
    fields.agreement_number,
    fields.contact_id,
    fields.property_id,
    fields.start_date,
    fields.end_date,
    fields.monthly_rent,
    fields.rent_due_date,
    fields.status,
    fields.description,
    fields.security_deposit,
    fields.broker_id,
    fields.broker_fee,
    fields.owner_id,
    fields.previous_agreement_id,
  ];
}

export type RentalAgreementListFilters = {
  status?: string;
  propertyId?: string;
};

export class RentalAgreementRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(
    client: pg.PoolClient,
    id: string,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<RentalAgreementRow | null> {
    const r = await client.query<RentalAgreementRow>(
      `SELECT ${RENTAL_AGREEMENT_COLUMNS}
       FROM rental_agreements WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    const row = r.rows[0] ?? null;
    if (!row || !scopeCtx?.enabled) return row;
    if (!rowMatchesScope(scopeCtx, 'property', row.property_id)) return null;
    if (!rowMatchesScope(scopeCtx, 'owner', row.owner_id)) return null;
    return row;
  }

  async getOwnerIdById(client: pg.PoolClient, id: string): Promise<string | null> {
    const r = await client.query<{ owner_id: string | null }>(
      `SELECT owner_id FROM rental_agreements WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0]?.owner_id ?? null;
  }

  async list(
    client: pg.PoolClient,
    filters?: RentalAgreementListFilters,
    scopeCtx?: DataScopeEnforcementContext
  ): Promise<RentalAgreementRow[]> {
    const params: unknown[] = [this.tenantId];
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters?.propertyId) {
      params.push(filters.propertyId);
      conditions.push(`property_id = $${params.length}`);
    }
    appendScopeFragment(
      conditions,
      params,
      applyPropertyScope(scopeCtx ?? { enabled: false, scopes: [] }, 'property_id', params.length + 1)
    );
    appendScopeFragment(
      conditions,
      params,
      applyOwnerScope(scopeCtx ?? { enabled: false, scopes: [] }, 'owner_id', params.length + 1)
    );
    const q = `SELECT ${RENTAL_AGREEMENT_COLUMNS}
             FROM rental_agreements WHERE ${conditions.join(' AND ')} ORDER BY start_date DESC, agreement_number ASC`;
    const r = await client.query<RentalAgreementRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<RentalAgreementRow[]> {
    const r = await client.query<RentalAgreementRow>(
      `SELECT ${RENTAL_AGREEMENT_COLUMNS}
       FROM rental_agreements WHERE tenant_id = $1 AND updated_at > $2 ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async hasActiveForProperty(client: pg.PoolClient, propertyId: string): Promise<boolean> {
    const r = await client.query<{ c: string }>(
      `SELECT 1 as c FROM rental_agreements
       WHERE tenant_id = $1 AND property_id = $2 AND LOWER(TRIM(status)) = 'active' AND deleted_at IS NULL
       LIMIT 1`,
      [this.tenantId, propertyId]
    );
    return r.rows.length > 0;
  }

  async repairMissingContactIdsFromPrevious(
    client: pg.PoolClient
  ): Promise<{ updated: number; ids: string[] }> {
    const r = await client.query<{ id: string }>(
      `UPDATE rental_agreements AS r
         SET contact_id = p.contact_id,
             version = r.version + 1,
             updated_at = NOW()
       FROM rental_agreements AS p
       WHERE r.tenant_id = $1
         AND p.tenant_id = $1
         AND r.deleted_at IS NULL
         AND p.deleted_at IS NULL
         AND r.previous_agreement_id IS NOT NULL
         AND r.previous_agreement_id = p.id
         AND TRIM(COALESCE(r.contact_id, '')) = ''
         AND TRIM(COALESCE(p.contact_id, '')) <> ''
       RETURNING r.id`,
      [this.tenantId]
    );
    return { updated: r.rowCount ?? 0, ids: r.rows.map((x) => x.id) };
  }

  async insertAgreement(
    client: pg.PoolClient,
    id: string,
    fields: RentalAgreementWriteFields
  ): Promise<RentalAgreementRow> {
    const r = await client.query<RentalAgreementRow>(
      `INSERT INTO rental_agreements (
         id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent, rent_due_date,
         status, description, security_deposit, broker_id, broker_fee, owner_id, previous_agreement_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, 1, NULL, NOW(), NOW()
       )
       RETURNING ${RENTAL_AGREEMENT_COLUMNS}`,
      [id, this.tenantId, ...rentalFieldParams(fields)]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: RentalAgreementWriteFields
  ): Promise<RentalAgreementRow | null> {
    const r = await client.query<RentalAgreementRow>(
      `UPDATE rental_agreements SET
         agreement_number = $3, contact_id = $4, property_id = $5, start_date = $6::date, end_date = $7::date,
         monthly_rent = $8, rent_due_date = $9, status = $10, description = $11,
         security_deposit = $12, broker_id = $13, broker_fee = $14, owner_id = $15, previous_agreement_id = $16,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${RENTAL_AGREEMENT_COLUMNS}`,
      [id, this.tenantId, ...rentalFieldParams(fields)]
    );
    return r.rows[0] ?? null;
  }

  async updateReconcile(
    client: pg.PoolClient,
    id: string,
    status: string,
    previousAgreementId: string | null,
    brokerFee: number | null
  ): Promise<void> {
    await client.query(
      `UPDATE rental_agreements SET
         status = $1, previous_agreement_id = $2, broker_fee = $3, version = version + 1, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5 AND deleted_at IS NULL`,
      [status, previousAgreementId, brokerFee, id, this.tenantId]
    );
  }

  async markRenewed(
    client: pg.PoolClient,
    id: string,
    expectedVersion: number
  ): Promise<RentalAgreementRow | null> {
    const r = await client.query<RentalAgreementRow>(
      `UPDATE rental_agreements SET status = 'Renewed', version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
         AND LOWER(TRIM(status)) = 'active' AND version = $3
       RETURNING ${RENTAL_AGREEMENT_COLUMNS}`,
      [id, this.tenantId, expectedVersion]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<RentalAgreementRow | null> {
    const r = await client.query<RentalAgreementRow>(
      `UPDATE rental_agreements SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${RENTAL_AGREEMENT_COLUMNS}`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }
}

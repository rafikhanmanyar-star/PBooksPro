import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { RentalAgreementRow } from '../../../services/rentalAgreementsService.js';

const RENTAL_AGREEMENT_COLUMNS = `id, tenant_id, agreement_number, contact_id, property_id, start_date, end_date, monthly_rent,
  rent_due_date, status, description, security_deposit, broker_id, broker_fee, owner_id, previous_agreement_id,
  version, deleted_at, created_at, updated_at`;

export type RentalAgreementListFilters = {
  status?: string;
  propertyId?: string;
};

export class RentalAgreementRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<RentalAgreementRow | null> {
    const r = await client.query<RentalAgreementRow>(
      `SELECT ${RENTAL_AGREEMENT_COLUMNS}
       FROM rental_agreements WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async list(client: pg.PoolClient, filters?: RentalAgreementListFilters): Promise<RentalAgreementRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${RENTAL_AGREEMENT_COLUMNS}
             FROM rental_agreements WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.status) {
      params.push(filters.status);
      q += ` AND status = $${params.length}`;
    }
    if (filters?.propertyId) {
      params.push(filters.propertyId);
      q += ` AND property_id = $${params.length}`;
    }
    q += ' ORDER BY start_date DESC, agreement_number ASC';
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
}

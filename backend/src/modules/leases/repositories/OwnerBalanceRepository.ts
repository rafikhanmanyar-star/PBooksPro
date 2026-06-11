import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type OwnerBalanceRow = {
  owner_id: string;
  property_id: string;
  balance: string;
  last_updated: Date;
};

export class OwnerBalanceRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async applyDelta(
    client: pg.PoolClient,
    ownerId: string,
    propertyId: string,
    balanceDelta: number
  ): Promise<void> {
    await client.query(
      `INSERT INTO owner_balances (tenant_id, owner_id, property_id, balance, last_updated)
       VALUES ($1, $2, $3, $4::numeric, NOW())
       ON CONFLICT (tenant_id, owner_id, property_id)
       DO UPDATE SET
         balance = owner_balances.balance + $4::numeric,
         last_updated = NOW()`,
      [this.tenantId, ownerId, propertyId, balanceDelta]
    );
  }

  async listForOwner(
    client: pg.PoolClient,
    ownerId: string,
    propertyId?: string | null
  ): Promise<OwnerBalanceRow[]> {
    const params: unknown[] = [this.tenantId, ownerId];
    let where = `WHERE tenant_id = $1 AND owner_id = $2`;
    if (propertyId && String(propertyId).trim() !== '') {
      params.push(propertyId);
      where += ` AND property_id = $${params.length}`;
    }
    const r = await client.query<OwnerBalanceRow>(
      `SELECT owner_id, property_id, balance::text AS balance, last_updated
       FROM owner_balances
       ${where}
       ORDER BY owner_id ASC, property_id ASC`,
      params
    );
    return r.rows;
  }

  async listForTenant(
    client: pg.PoolClient,
    options?: { propertyId?: string | null; limit?: number }
  ): Promise<OwnerBalanceRow[]> {
    const lim = Math.min(Math.max(options?.limit ?? 8000, 1), 20_000);
    const params: unknown[] = [this.tenantId];
    let where = 'WHERE tenant_id = $1';
    if (options?.propertyId && String(options.propertyId).trim() !== '') {
      params.push(options.propertyId);
      where += ` AND property_id = $${params.length}`;
    }
    params.push(lim);
    const limIdx = params.length;
    const r = await client.query<OwnerBalanceRow>(
      `SELECT owner_id, property_id, balance::text AS balance, last_updated
       FROM owner_balances
       ${where}
       ORDER BY owner_id ASC, property_id ASC
       LIMIT $${limIdx}`,
      params
    );
    return r.rows;
  }
}

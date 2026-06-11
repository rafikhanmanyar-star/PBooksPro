import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export class MonthlyOwnerSummaryRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async applyDelta(
    client: pg.PoolClient,
    ownerId: string,
    propertyId: string,
    monthStart: string,
    rentDelta: number,
    expenseDelta: number
  ): Promise<void> {
    await client.query(
      `INSERT INTO monthly_owner_summary (
         tenant_id, owner_id, property_id, month, total_rent, total_expense, net_amount
       ) VALUES ($1, $2, $3, $4::date, $5::numeric, $6::numeric, ($5::numeric - $6::numeric))
       ON CONFLICT (tenant_id, owner_id, property_id, month)
       DO UPDATE SET
         total_rent = monthly_owner_summary.total_rent + $5::numeric,
         total_expense = monthly_owner_summary.total_expense + $6::numeric,
         net_amount =
           (monthly_owner_summary.total_rent + $5::numeric) - (monthly_owner_summary.total_expense + $6::numeric)`,
      [this.tenantId, ownerId, propertyId, monthStart, rentDelta, expenseDelta]
    );
  }
}

import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export class PmCycleMaintenanceRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async resolvePmBillIds(client: pg.PoolClient): Promise<string[]> {
    const r = await client.query<{ id: string }>(
      `
      SELECT DISTINCT x.id FROM (
        SELECT p.bill_id AS id
        FROM pm_cycle_allocations p
        WHERE p.tenant_id = $1 AND p.bill_id IS NOT NULL
        UNION
        SELECT b.id
        FROM bills b
        WHERE b.tenant_id = $1
          AND b.bill_number LIKE 'PM-ALLOC-%'
      ) AS x
      WHERE x.id IS NOT NULL
      `,
      [this.tenantId]
    );
    return r.rows.map((row) => row.id);
  }

  async resolvePmTransactionIds(client: pg.PoolClient, pmBillIds: string[]): Promise<string[]> {
    const r = await client.query<{ id: string }>(
      `
      SELECT DISTINCT t.id
      FROM transactions t
      WHERE t.tenant_id = $1
        AND (
          (
            t.bill_id = ANY($2::text[])
            OR (
              t.batch_id IS NOT NULL
              AND t.batch_id IN (
                SELECT DISTINCT t2.batch_id
                FROM transactions t2
                WHERE t2.tenant_id = $1
                  AND t2.bill_id = ANY($2::text[])
                  AND t2.batch_id IS NOT NULL
              )
            )
          )
          OR (t.description IS NOT NULL AND t.description ~ '\\[PM-ALLOC-')
          OR (t.batch_id IS NOT NULL AND t.batch_id LIKE 'pm-eq-payout-%')
          OR t.id LIKE 'pm-pay-%'
          OR t.id LIKE 'pm-exp-%'
          OR t.id LIKE 'pm-inv-%'
        )
      `,
      [this.tenantId, pmBillIds]
    );
    return r.rows.map((row) => row.id);
  }

  async countAllocations(client: pg.PoolClient): Promise<number> {
    const r = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pm_cycle_allocations WHERE tenant_id = $1`,
      [this.tenantId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async countPmBills(client: pg.PoolClient, pmBillIds: string[]): Promise<number> {
    const r = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM bills WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [this.tenantId, pmBillIds]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async backupAllocations(client: pg.PoolClient, tableName: string): Promise<void> {
    await client.query(`CREATE TABLE ${tableName} AS SELECT * FROM pm_cycle_allocations WHERE tenant_id = $1`, [
      this.tenantId,
    ]);
  }

  async backupPmBills(client: pg.PoolClient, tableName: string, pmBillIds: string[]): Promise<void> {
    await client.query(
      `CREATE TABLE ${tableName} AS SELECT * FROM bills WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [this.tenantId, pmBillIds]
    );
  }

  async backupTransactions(client: pg.PoolClient, tableName: string, transactionIds: string[]): Promise<void> {
    await client.query(
      `CREATE TABLE ${tableName} AS SELECT * FROM transactions WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [this.tenantId, transactionIds]
    );
  }

  async deleteTransactionsByIds(client: pg.PoolClient, transactionIds: string[]): Promise<number> {
    const r = await client.query(
      `DELETE FROM transactions WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [this.tenantId, transactionIds]
    );
    return r.rowCount ?? 0;
  }

  async deleteAllAllocations(client: pg.PoolClient): Promise<number> {
    const r = await client.query(`DELETE FROM pm_cycle_allocations WHERE tenant_id = $1`, [this.tenantId]);
    return r.rowCount ?? 0;
  }

  async deletePmBills(client: pg.PoolClient, pmBillIds: string[]): Promise<number> {
    const r = await client.query(
      `DELETE FROM bills WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [this.tenantId, pmBillIds]
    );
    return r.rowCount ?? 0;
  }

  async countRemainingAllocations(client: pg.PoolClient): Promise<number> {
    const r = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pm_cycle_allocations WHERE tenant_id = $1`,
      [this.tenantId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async countRemainingPmBills(client: pg.PoolClient): Promise<number> {
    const r = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM bills WHERE tenant_id = $1 AND bill_number LIKE 'PM-ALLOC-%'`,
      [this.tenantId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  async countTransactionsWithPmMarker(client: pg.PoolClient): Promise<number> {
    const r = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM transactions
       WHERE tenant_id = $1 AND description IS NOT NULL AND description ~ '\\[PM-ALLOC-'`,
      [this.tenantId]
    );
    return Number(r.rows[0]?.n ?? 0);
  }
}

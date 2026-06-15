import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PmCycleAllocationRow } from '../services/pmCycleAllocationsService.js';

const ALLOCATION_COLUMNS = `id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
  amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
  user_id, version, deleted_at, created_at, updated_at`;

export type PmCycleAllocationListFilters = {
  projectId?: string;
  cycleId?: string;
  status?: string;
};

export class PmCycleAllocationRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PmCycleAllocationRow | null> {
    const r = await client.query<PmCycleAllocationRow>(
      `SELECT ${ALLOCATION_COLUMNS}
       FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PmCycleAllocationRow | null> {
    const r = await client.query<PmCycleAllocationRow>(
      `SELECT ${ALLOCATION_COLUMNS}
       FROM pm_cycle_allocations WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByProjectAndCycle(
    client: pg.PoolClient,
    projectId: string,
    cycleId: string
  ): Promise<PmCycleAllocationRow | null> {
    const r = await client.query<PmCycleAllocationRow>(
      `SELECT ${ALLOCATION_COLUMNS}
       FROM pm_cycle_allocations
       WHERE tenant_id = $1 AND project_id = $2 AND cycle_id = $3 AND deleted_at IS NULL`,
      [this.tenantId, projectId, cycleId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient, filters?: PmCycleAllocationListFilters): Promise<PmCycleAllocationRow[]> {
    const params: unknown[] = [this.tenantId];
    let q = `SELECT ${ALLOCATION_COLUMNS}
             FROM pm_cycle_allocations WHERE tenant_id = $1 AND deleted_at IS NULL`;
    if (filters?.projectId) {
      params.push(filters.projectId);
      q += ` AND project_id = $${params.length}`;
    }
    if (filters?.cycleId) {
      params.push(filters.cycleId);
      q += ` AND cycle_id = $${params.length}`;
    }
    if (filters?.status) {
      params.push(filters.status);
      q += ` AND status = $${params.length}`;
    }
    q += ' ORDER BY allocation_date DESC, cycle_id ASC';
    const r = await client.query<PmCycleAllocationRow>(q, params);
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PmCycleAllocationRow[]> {
    const r = await client.query<PmCycleAllocationRow>(
      `SELECT ${ALLOCATION_COLUMNS}
       FROM pm_cycle_allocations WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  /** Values from project_id through user_id (16 params). */
  async insertAllocation(
    client: pg.PoolClient,
    id: string,
    fieldValues: unknown[]
  ): Promise<PmCycleAllocationRow> {
    const r = await client.query<PmCycleAllocationRow>(
      `INSERT INTO pm_cycle_allocations (
         id, tenant_id, project_id, cycle_id, cycle_label, frequency, start_date, end_date, allocation_date,
         amount, paid_amount, status, bill_id, description, expense_total, fee_rate, excluded_category_ids,
         user_id, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::date, $8::date, $9::date, $10, $11, $12, $13, $14, $15, $16, $17, $18,
         1, NULL, NOW(), NOW()
       )
       RETURNING ${ALLOCATION_COLUMNS}`,
      [id, this.tenantId, ...fieldValues]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fieldValues: unknown[],
    expectedVersion?: number
  ): Promise<{ row: PmCycleAllocationRow | null; conflict: boolean }> {
    if (expectedVersion !== undefined) {
      const r = await client.query<PmCycleAllocationRow>(
        `UPDATE pm_cycle_allocations SET
           project_id = $3, cycle_id = $4, cycle_label = $5, frequency = $6,
           start_date = $7::date, end_date = $8::date, allocation_date = $9::date,
           amount = $10, paid_amount = $11, status = $12, bill_id = $13, description = $14,
           expense_total = $15, fee_rate = $16, excluded_category_ids = $17, user_id = $18,
           version = version + 1, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND version = $19
         RETURNING ${ALLOCATION_COLUMNS}`,
        [id, this.tenantId, ...fieldValues, expectedVersion]
      );
      if (r.rows[0]) return { row: r.rows[0], conflict: false };
      return { row: null, conflict: true };
    }
    const r = await client.query<PmCycleAllocationRow>(
      `UPDATE pm_cycle_allocations SET
         project_id = $3, cycle_id = $4, cycle_label = $5, frequency = $6,
         start_date = $7::date, end_date = $8::date, allocation_date = $9::date,
         amount = $10, paid_amount = $11, status = $12, bill_id = $13, description = $14,
         expense_total = $15, fee_rate = $16, excluded_category_ids = $17, user_id = $18,
         version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${ALLOCATION_COLUMNS}`,
      [id, this.tenantId, ...fieldValues]
    );
    return { row: r.rows[0] ?? null, conflict: false };
  }

  async updateRestore(
    client: pg.PoolClient,
    id: string,
    fieldValues: unknown[]
  ): Promise<PmCycleAllocationRow | null> {
    const r = await client.query<PmCycleAllocationRow>(
      `UPDATE pm_cycle_allocations SET
         project_id = $3, cycle_id = $4, cycle_label = $5, frequency = $6,
         start_date = $7::date, end_date = $8::date, allocation_date = $9::date,
         amount = $10, paid_amount = $11, status = $12, bill_id = $13, description = $14,
         expense_total = $15, fee_rate = $16, excluded_category_ids = $17, user_id = $18,
         deleted_at = NULL, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2
       RETURNING ${ALLOCATION_COLUMNS}`,
      [id, this.tenantId, ...fieldValues]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string, expectedVersion?: number): Promise<boolean> {
    const versionClause = expectedVersion !== undefined ? ' AND version = $3' : '';
    const params =
      expectedVersion !== undefined ? [id, this.tenantId, expectedVersion] : [id, this.tenantId];
    const r = await client.query(
      `UPDATE pm_cycle_allocations SET deleted_at = NOW(), updated_at = NOW(), version = version + 1
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL${versionClause}`,
      params
    );
    return (r.rowCount ?? 0) > 0;
  }
}

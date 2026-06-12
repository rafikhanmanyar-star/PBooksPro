import { randomUUID } from 'crypto';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type {
  CreateUnpostedTransactionInput,
  UnpostedTransactionRow,
  UnpostedTransactionStatus,
} from '../types/index.js';

export class UnpostedTransactionRepository extends TenantRepository {
  async list(options: {
    status?: UnpostedTransactionStatus | UnpostedTransactionStatus[];
    createdBy?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<UnpostedTransactionRow[]> {
    const clauses = [this.activeOnly()];
    const params: unknown[] = [this.tenantId];
    let idx = 1;

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      idx += 1;
      clauses.push(`status = ANY($${idx}::text[])`);
      params.push(statuses);
    }
    if (options.createdBy) {
      idx += 1;
      clauses.push(`created_by = $${idx}`);
      params.push(options.createdBy);
    }

    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;
    idx += 1;
    const limitParam = idx;
    idx += 1;
    const offsetParam = idx;
    params.push(limit, offset);

    const r = await this.query<UnpostedTransactionRow>(
      `SELECT * FROM unposted_transactions
       WHERE ${this.tenantWhere('', clauses.join(' AND '))}
       ORDER BY created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    return r.rows;
  }

  async getById(id: string): Promise<UnpostedTransactionRow | null> {
    return this.queryOne<UnpostedTransactionRow>(
      `SELECT * FROM unposted_transactions
       WHERE ${this.tenantWhere('', this.activeOnly())} AND id = $2`,
      [this.tenantId, id]
    );
  }

  async create(
    input: CreateUnpostedTransactionInput,
    createdBy: string
  ): Promise<UnpostedTransactionRow> {
    const id = `upt_${randomUUID().replace(/-/g, '')}`;
    const status = input.status ?? 'submitted';
    const r = await this.query<UnpostedTransactionRow>(
      `INSERT INTO unposted_transactions (
         id, tenant_id, transaction_date, amount, currency, transaction_type,
         description, party_name, supplier_id, employee_id, customer_id,
         project_id, property_id, created_by, status
       ) VALUES (
         $2, $1, COALESCE($3::date, CURRENT_DATE), $4, COALESCE($5, 'PKR'), $6,
         $7, $8, $9, $10, $11, $12, $13, $14, $15
       ) RETURNING *`,
      [
        this.tenantId,
        id,
        input.transactionDate ?? null,
        input.amount,
        input.currency ?? 'PKR',
        input.transactionType,
        input.description ?? null,
        input.partyName ?? null,
        input.supplierId ?? null,
        input.employeeId ?? null,
        input.customerId ?? null,
        input.projectId ?? null,
        input.propertyId ?? null,
        createdBy,
        status,
      ]
    );
    return r.rows[0]!;
  }

  async updateStatus(
    id: string,
    status: UnpostedTransactionStatus,
    actorId: string,
    rejectionReason?: string
  ): Promise<UnpostedTransactionRow | null> {
    const reviewedAt = ['under_review', 'processed', 'rejected'].includes(status)
      ? new Date()
      : null;
    const processedAt = status === 'processed' ? new Date() : null;
    const r = await this.query<UnpostedTransactionRow>(
      `UPDATE unposted_transactions SET
         status = $3,
         reviewed_by = CASE WHEN $3 IN ('under_review', 'processed', 'rejected') THEN $4 ELSE reviewed_by END,
         reviewed_at = COALESCE($5, reviewed_at),
         processed_at = COALESCE($6, processed_at),
         rejection_reason = $7,
         updated_at = NOW()
       WHERE ${this.tenantWhere('', this.activeOnly())} AND id = $2
       RETURNING *`,
      [this.tenantId, id, status, actorId, reviewedAt, processedAt, rejectionReason ?? null]
    );
    return r.rows[0] ?? null;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const r = await this.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count
       FROM unposted_transactions
       WHERE ${this.tenantWhere('', this.activeOnly())}
       GROUP BY status`,
      [this.tenantId]
    );
    const out: Record<string, number> = {};
    for (const row of r.rows) {
      out[row.status] = Number(row.count);
    }
    return out;
  }
}

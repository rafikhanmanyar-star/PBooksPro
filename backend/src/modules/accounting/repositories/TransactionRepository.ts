import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type {
  ListTransactionFilters,
  TransactionRow,
} from '../../../services/transactionsService.js';

const SELECT_ROW = `SELECT t.id, t.tenant_id, t.user_id, t.type, t.subtype, t.amount, t.date, t.description, t.reference,
  t.account_id, t.from_account_id, t.to_account_id, t.category_id, t.contact_id, t.vendor_id, t.project_id,
  t.building_id, t.property_id, t.unit_id, t.invoice_id, t.bill_id, t.payslip_id, t.contract_id, t.agreement_id,
  t.batch_id, t.project_asset_id, t.owner_id, t.is_system, t.version, t.deleted_at, t.created_at, t.updated_at`;

export class TransactionRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async list(client: pg.PoolClient, filters: ListTransactionFilters = {}): Promise<TransactionRow[]> {
    const params: unknown[] = [this.tenantId];
    const rentalOnly = filters.rentalInvoiceOnly === true;
    let fromClause = 'FROM transactions t';
    if (rentalOnly) {
      fromClause += ` INNER JOIN invoices i ON i.id = t.invoice_id AND i.tenant_id = t.tenant_id`;
    }
    let where = ' WHERE t.tenant_id = $1 AND t.deleted_at IS NULL';
    if (rentalOnly) {
      where += ` AND i.deleted_at IS NULL AND i.invoice_type IN ('Rental', 'Security Deposit', 'Service Charge')`;
    }

    if (filters.projectId) {
      params.push(filters.projectId);
      where += ` AND t.project_id = $${params.length}`;
    }
    if (filters.startDate) {
      params.push(filters.startDate);
      where += ` AND t.date >= $${params.length}::date`;
    }
    if (filters.endDate) {
      params.push(filters.endDate);
      where += ` AND t.date <= $${params.length}::date`;
    }
    if (filters.type) {
      params.push(filters.type);
      where += ` AND t.type = $${params.length}`;
    }
    if (filters.invoiceId) {
      params.push(filters.invoiceId);
      where += ` AND t.invoice_id = $${params.length}`;
    }
    if (filters.ownerId) {
      params.push(filters.ownerId);
      where += ` AND t.owner_id = $${params.length}`;
    }
    if (filters.propertyId) {
      params.push(filters.propertyId);
      where += ` AND t.property_id = $${params.length}`;
    }

    const useKeyset =
      typeof filters.cursorDate === 'string' &&
      filters.cursorDate.trim() !== '' &&
      typeof filters.cursorId === 'string' &&
      filters.cursorId.trim() !== '';

    if (useKeyset) {
      params.push(filters.cursorDate!.trim(), filters.cursorId!.trim());
      const dIdx = params.length - 1;
      const idIdx = params.length;
      where += ` AND (t.date < $${dIdx}::date OR (t.date = $${dIdx}::date AND t.id < $${idIdx}))`;
    }

    const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500_000);
    const offset = useKeyset ? 0 : Math.max(filters.offset ?? 0, 0);
    params.push(limit);
    let q: string;
    if (useKeyset) {
      const limitIdx = params.length;
      q = `${SELECT_ROW} ${fromClause} ${where} ORDER BY t.date DESC, t.id DESC LIMIT $${limitIdx}`;
    } else {
      params.push(offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;
      q = `${SELECT_ROW} ${fromClause} ${where} ORDER BY t.date DESC, t.id DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    }

    const r = await client.query<TransactionRow>(q, params);
    return r.rows;
  }

  async getById(client: pg.PoolClient, id: string): Promise<TransactionRow | null> {
    const r = await client.query<TransactionRow>(
      `${SELECT_ROW} FROM transactions t WHERE t.id = $1 AND t.tenant_id = $2 AND t.deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<TransactionRow | null> {
    const r = await client.query<TransactionRow>(
      `${SELECT_ROW} FROM transactions t WHERE t.id = $1 AND t.tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdForUpdate(client: pg.PoolClient, id: string): Promise<TransactionRow | null> {
    const r = await client.query<TransactionRow>(
      `${SELECT_ROW} FROM transactions t
       WHERE t.id = $1 AND t.tenant_id = $2 AND t.deleted_at IS NULL
       FOR UPDATE`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async lockByIdIncludingDeletedForUpdate(client: pg.PoolClient, id: string): Promise<TransactionRow | null> {
    const r = await client.query<TransactionRow>(
      `${SELECT_ROW} FROM transactions t
       WHERE t.id = $1 AND t.tenant_id = $2
       FOR UPDATE`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<TransactionRow[]> {
    const r = await client.query<TransactionRow>(
      `${SELECT_ROW} FROM transactions t
       WHERE t.tenant_id = $1 AND t.updated_at > $2
       ORDER BY t.updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }
}

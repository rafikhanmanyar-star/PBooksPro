import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type {
  ListTransactionFilters,
  TransactionRow,
} from '../services/transactionsService.js';

const SELECT_ROW = `SELECT t.id, t.tenant_id, t.user_id, t.type, t.subtype, t.amount, t.date, t.description, t.reference,
  t.account_id, t.from_account_id, t.to_account_id, t.category_id, t.contact_id, t.vendor_id, t.project_id,
  t.building_id, t.property_id, t.unit_id, t.invoice_id, t.bill_id, t.payslip_id, t.contract_id, t.agreement_id,
  t.batch_id, t.project_asset_id, t.owner_id, t.is_system, t.version, t.deleted_at, t.created_at, t.updated_at`;

const TX_RETURNING = `id, tenant_id, user_id, type, subtype, amount, date, description, reference, account_id, from_account_id, to_account_id,
  category_id, contact_id, vendor_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
  contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system, version, deleted_at, created_at, updated_at`;

export type TransactionWriteFields = {
  type: string;
  subtype: string | null;
  amount: number;
  date: string;
  description: string | null;
  reference: string | null;
  account_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  contact_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  building_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  invoice_id: string | null;
  bill_id: string | null;
  payslip_id: string | null;
  contract_id: string | null;
  agreement_id: string | null;
  batch_id: string | null;
  project_asset_id: string | null;
  owner_id: string | null;
  is_system: boolean;
};

function transactionFieldParams(fields: TransactionWriteFields): unknown[] {
  return [
    fields.type,
    fields.subtype,
    fields.amount,
    fields.date,
    fields.description,
    fields.reference,
    fields.account_id,
    fields.from_account_id,
    fields.to_account_id,
    fields.category_id,
    fields.contact_id,
    fields.vendor_id,
    fields.project_id,
    fields.building_id,
    fields.property_id,
    fields.unit_id,
    fields.invoice_id,
    fields.bill_id,
    fields.payslip_id,
    fields.contract_id,
    fields.agreement_id,
    fields.batch_id,
    fields.project_asset_id,
    fields.owner_id,
    fields.is_system,
  ];
}

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

  async insertTransaction(
    client: pg.PoolClient,
    id: string,
    fields: TransactionWriteFields,
    userId: string | null
  ): Promise<TransactionRow> {
    const r = await client.query<TransactionRow>(
      `INSERT INTO transactions (
         id, tenant_id, user_id, type, subtype, amount, date, description, reference, account_id, from_account_id, to_account_id,
         category_id, contact_id, vendor_id, project_id, building_id, property_id, unit_id, invoice_id, bill_id, payslip_id,
         contract_id, agreement_id, batch_id, project_asset_id, owner_id, is_system, version, deleted_at, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, 1, NULL, NOW(), NOW()
       )
       RETURNING ${TX_RETURNING}`,
      [id, this.tenantId, userId, ...transactionFieldParams(fields)]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    fields: TransactionWriteFields,
    options?: { userId?: string | null; restoreDeleted?: boolean }
  ): Promise<TransactionRow | null> {
    const restore = options?.restoreDeleted === true;
    const userClause = restore ? ', user_id = COALESCE($28, user_id)' : '';
    const deletedClause = restore ? ', deleted_at = NULL' : '';
    const whereDeleted = restore ? '' : ' AND deleted_at IS NULL';
    const params: unknown[] = [id, this.tenantId, ...transactionFieldParams(fields)];
    if (restore) params.push(options?.userId ?? null);

    const r = await client.query<TransactionRow>(
      `UPDATE transactions SET
         type = $3, subtype = $4, amount = $5, date = $6::date, description = $7, reference = $8,
         account_id = $9, from_account_id = $10, to_account_id = $11, category_id = $12, contact_id = $13, vendor_id = $14,
         project_id = $15, building_id = $16, property_id = $17, unit_id = $18, invoice_id = $19, bill_id = $20, payslip_id = $21,
         contract_id = $22, agreement_id = $23, batch_id = $24, project_asset_id = $25, owner_id = $26, is_system = $27,
         version = version + 1, updated_at = NOW()${userClause}${deletedClause}
       WHERE id = $1 AND tenant_id = $2${whereDeleted}
       RETURNING ${TX_RETURNING}`,
      params
    );
    return r.rows[0] ?? null;
  }

  async aggregatePaymentsForPayslip(
    client: pg.PoolClient,
    payslipId: string
  ): Promise<{ sum: number; lastDate: Date | null; cnt: number }> {
    const r = await client.query<{ sum: string | null; last_date: Date | null; cnt: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS sum, MAX(date) AS last_date, COUNT(*)::text AS cnt
       FROM transactions
       WHERE tenant_id = $1 AND payslip_id = $2 AND deleted_at IS NULL`,
      [this.tenantId, payslipId]
    );
    return {
      sum: Number(r.rows[0]?.sum ?? 0),
      lastDate: r.rows[0]?.last_date ?? null,
      cnt: Number(r.rows[0]?.cnt ?? 0),
    };
  }

  async getSingleActiveIdForPayslip(client: pg.PoolClient, payslipId: string): Promise<string | null> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM transactions WHERE tenant_id = $1 AND payslip_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [this.tenantId, payslipId]
    );
    return r.rows[0]?.id ?? null;
  }

  async listActiveIdsByReferenceForUpdate(client: pg.PoolClient, reference: string): Promise<string[]> {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM transactions WHERE tenant_id = $1 AND reference = $2 AND deleted_at IS NULL FOR UPDATE`,
      [this.tenantId, reference]
    );
    return r.rows.map((row) => row.id);
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<boolean> {
    const r = await client.query(
      `UPDATE transactions SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async listPayrollExpenseForEmployee(
    client: pg.PoolClient,
    employeeId: string
  ): Promise<
    Array<{
      id: string;
      payslip_id: string | null;
      amount: string;
      date: Date;
      description: string | null;
      created_at: Date;
      type: string;
    }>
  > {
    const r = await client.query<{
      id: string;
      payslip_id: string | null;
      amount: string;
      date: Date;
      description: string | null;
      created_at: Date;
      type: string;
    }>(
      `SELECT t.id, t.payslip_id, t.amount::text, t.date, t.description, t.created_at, t.type
       FROM transactions t
       INNER JOIN payslips p ON p.id = t.payslip_id AND p.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1 AND p.employee_id = $2 AND t.deleted_at IS NULL`,
      [this.tenantId, employeeId]
    );
    return r.rows;
  }
}

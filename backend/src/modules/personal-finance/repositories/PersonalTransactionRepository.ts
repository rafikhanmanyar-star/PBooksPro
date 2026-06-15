import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PersonalTransactionRow } from '../services/personalTransactionsService.js';

const TRANSACTION_COLUMNS = `id, tenant_id, account_id, personal_category_id, type, amount, transaction_date,
  description, version, deleted_at, created_at, updated_at`;

export class PersonalTransactionRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async getById(client: pg.PoolClient, id: string): Promise<PersonalTransactionRow | null> {
    const r = await client.query<PersonalTransactionRow>(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM personal_transactions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async getByIdIncludingDeleted(client: pg.PoolClient, id: string): Promise<PersonalTransactionRow | null> {
    const r = await client.query<PersonalTransactionRow>(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM personal_transactions WHERE id = $1 AND tenant_id = $2`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async listActive(client: pg.PoolClient): Promise<PersonalTransactionRow[]> {
    const r = await client.query<PersonalTransactionRow>(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM personal_transactions WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY transaction_date DESC, created_at DESC`,
      [this.tenantId]
    );
    return r.rows;
  }

  async listChangedSince(client: pg.PoolClient, since: Date): Promise<PersonalTransactionRow[]> {
    const r = await client.query<PersonalTransactionRow>(
      `SELECT ${TRANSACTION_COLUMNS}
       FROM personal_transactions WHERE tenant_id = $1 AND updated_at > $2
       ORDER BY updated_at ASC`,
      [this.tenantId, since]
    );
    return r.rows;
  }

  async insertTransaction(
    client: pg.PoolClient,
    id: string,
    accountId: string,
    personalCategoryId: string,
    type: string,
    amount: number,
    transactionDate: string,
    description: string | null
  ): Promise<PersonalTransactionRow> {
    const r = await client.query<PersonalTransactionRow>(
      `INSERT INTO personal_transactions (
         id, tenant_id, account_id, personal_category_id, type, amount, transaction_date,
         description, version, deleted_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, 1, NULL, NOW(), NOW())
       RETURNING ${TRANSACTION_COLUMNS}`,
      [id, this.tenantId, accountId, personalCategoryId, type, amount, transactionDate, description]
    );
    return r.rows[0]!;
  }

  async updateActive(
    client: pg.PoolClient,
    id: string,
    accountId: string,
    personalCategoryId: string,
    type: string,
    amount: number,
    transactionDate: string,
    description: string | null
  ): Promise<PersonalTransactionRow | null> {
    const r = await client.query<PersonalTransactionRow>(
      `UPDATE personal_transactions SET
         account_id = $2, personal_category_id = $3, type = $4, amount = $5,
         transaction_date = $6::date, description = $7, version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $8 AND deleted_at IS NULL
       RETURNING ${TRANSACTION_COLUMNS}`,
      [id, accountId, personalCategoryId, type, amount, transactionDate, description, this.tenantId]
    );
    return r.rows[0] ?? null;
  }

  async markDeleted(client: pg.PoolClient, id: string): Promise<PersonalTransactionRow | null> {
    const r = await client.query<PersonalTransactionRow>(
      `UPDATE personal_transactions SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING ${TRANSACTION_COLUMNS}`,
      [id, this.tenantId]
    );
    return r.rows[0] ?? null;
  }
}

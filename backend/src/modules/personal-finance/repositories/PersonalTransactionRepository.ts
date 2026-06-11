import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';
import type { PersonalTransactionRow } from '../../../services/personalTransactionsService.js';

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
}

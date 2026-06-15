import type pg from 'pg';
import type { TransactionRow } from '../services/transactionsService.js';
import { TRANSACTION_JOURNAL_SOURCE_MODULE } from '../../../services/transactionJournalPostingService.js';

const TX_SELECT = `SELECT t.id, t.tenant_id, t.user_id, t.type, t.subtype, t.amount, t.date, t.description, t.reference,
    t.account_id, t.from_account_id, t.to_account_id, t.category_id, t.contact_id, t.vendor_id, t.project_id,
    t.building_id, t.property_id, t.unit_id, t.invoice_id, t.bill_id, t.payslip_id, t.contract_id, t.agreement_id,
    t.batch_id, t.project_asset_id, t.owner_id, t.is_system, t.version, t.deleted_at, t.created_at, t.updated_at`;

export class TransactionJournalBackfillRepository {
  async listNeedingJournalMirror(
    client: pg.PoolClient,
    tenantId: string,
    options?: { fromDate?: string | null; toDate?: string | null }
  ): Promise<TransactionRow[]> {
    const params: unknown[] = [tenantId, TRANSACTION_JOURNAL_SOURCE_MODULE];
    let dateCond = '';
    if (options?.fromDate) {
      params.push(options.fromDate);
      dateCond += ` AND t.date >= $${params.length}::date`;
    }
    if (options?.toDate) {
      params.push(options.toDate);
      dateCond += ` AND t.date <= $${params.length}::date`;
    }

    const q = `${TX_SELECT}
      FROM transactions t
      WHERE t.tenant_id = $1
        AND t.deleted_at IS NULL
        ${dateCond}
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.tenant_id = t.tenant_id
            AND je.source_module = $2
            AND je.source_id = t.id
            AND NOT EXISTS (
              SELECT 1 FROM journal_reversals jr
              WHERE jr.tenant_id = t.tenant_id
                AND jr.original_journal_entry_id = je.id
            )
        )
      ORDER BY t.date ASC, t.id ASC`;

    const r = await client.query<TransactionRow>(q, params);
    return r.rows;
  }

  async listActiveForReplace(
    client: pg.PoolClient,
    tenantId: string,
    options?: { fromDate?: string | null; toDate?: string | null }
  ): Promise<TransactionRow[]> {
    const params: unknown[] = [tenantId];
    let dateCond = '';
    if (options?.fromDate) {
      params.push(options.fromDate);
      dateCond += ` AND t.date >= $${params.length}::date`;
    }
    if (options?.toDate) {
      params.push(options.toDate);
      dateCond += ` AND t.date <= $${params.length}::date`;
    }

    const r = await client.query<TransactionRow>(
      `${TX_SELECT}
       FROM transactions t
       WHERE t.tenant_id = $1 AND t.deleted_at IS NULL ${dateCond}
       ORDER BY t.date ASC, t.id ASC`,
      params
    );
    return r.rows;
  }
}

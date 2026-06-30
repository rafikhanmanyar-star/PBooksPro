import type pg from 'pg';
import { GLOBAL_SYSTEM_TENANT_ID } from '../../constants/globalSystemChart.js';
import {
  SYSTEM_ACCOUNT_DEFS,
  SYSTEM_CATEGORY_DEFS,
} from '../../constants/systemChartDefs.js';

type Queryable = { query: (text: string, params?: unknown[]) => Promise<unknown> };

export class TenantChartRepository {
  async ensureGlobalTenant(client: Queryable): Promise<void> {
    await client.query(
      `INSERT INTO tenants (id, name) VALUES ($1, 'Shared system chart')
       ON CONFLICT (id) DO NOTHING`,
      [GLOBAL_SYSTEM_TENANT_ID]
    );
  }

  async insertSystemAccounts(client: Queryable): Promise<void> {
    for (const a of SYSTEM_ACCOUNT_DEFS) {
      await client.query(
        `INSERT INTO accounts (id, tenant_id, name, type, balance, is_permanent, version)
         VALUES ($1, $2, $3, $4, 0, TRUE, 1)
         ON CONFLICT (id) DO NOTHING`,
        [a.logicalId, GLOBAL_SYSTEM_TENANT_ID, a.name, a.type]
      );
    }
  }

  async insertSystemCategories(client: Queryable): Promise<void> {
    for (const c of SYSTEM_CATEGORY_DEFS) {
      await client.query(
        `INSERT INTO categories (id, tenant_id, name, type, is_permanent, is_rental, is_hidden, version)
         VALUES ($1, $2, $3, $4, TRUE, $5, FALSE, 1)
         ON CONFLICT (id) DO NOTHING`,
        [c.logicalId, GLOBAL_SYSTEM_TENANT_ID, c.name, c.type, c.is_rental]
      );
    }
  }
}

const JOURNAL_IMMUTABILITY_TRIGGERS = [
  'journal_lines_immutable_del',
  'journal_lines_immutable_upd',
  'journal_entries_immutable_del',
  'journal_entries_immutable_upd',
] as const;

export class TenantJournalMaintenanceRepository {
  async setJournalImmutabilityTriggers(client: pg.PoolClient, enabled: boolean): Promise<void> {
    const verb = enabled ? 'ENABLE' : 'DISABLE';
    for (const trigger of JOURNAL_IMMUTABILITY_TRIGGERS) {
      const table = trigger.startsWith('journal_lines') ? 'journal_lines' : 'journal_entries';
      await client.query(`ALTER TABLE ${table} ${verb} TRIGGER ${trigger}`);
    }
  }

  async clearJournalForeignKeyReferences(client: pg.PoolClient, tenantId: string): Promise<void> {
    await client.query(
      `UPDATE accounting_periods
       SET closing_journal_entry_id = NULL,
           year_end_transfer_journal_entry_id = NULL
       WHERE tenant_id = $1`,
      [tenantId]
    );
  }

  async deleteTenantJournalRows(client: pg.PoolClient, tenantId: string): Promise<void> {
    await client.query(`DELETE FROM journal_reversals WHERE tenant_id = $1`, [tenantId]);
    await client.query(
      `DELETE FROM journal_lines
       WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE tenant_id = $1)`,
      [tenantId]
    );
    await client.query(`DELETE FROM journal_entries WHERE tenant_id = $1`, [tenantId]);
  }
}

export class TenantWipeRepository {
  async deleteFromTenantTable(client: pg.PoolClient, tenantId: string, table: string): Promise<number> {
    const r = await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    return r.rowCount ?? 0;
  }

  async deleteTenantAccounts(client: pg.PoolClient, tenantId: string): Promise<number> {
    const r = await client.query(`DELETE FROM accounts WHERE tenant_id = $1`, [tenantId]);
    return r.rowCount ?? 0;
  }

  /** Zero stored balance and opening_balance for all tenant accounts (preserves chart rows). */
  async resetTenantAccountBalances(client: pg.PoolClient, tenantId: string): Promise<number> {
    const r = await client.query(
      `UPDATE accounts
       SET balance = 0, opening_balance = 0, version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );
    return r.rowCount ?? 0;
  }

  async deleteNonPermanentCategories(client: pg.PoolClient, tenantId: string): Promise<number> {
    const r = await client.query(
      `DELETE FROM categories WHERE tenant_id = $1 AND is_permanent = FALSE`,
      [tenantId]
    );
    return r.rowCount ?? 0;
  }
}

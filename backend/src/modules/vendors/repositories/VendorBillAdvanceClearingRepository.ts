import type pg from 'pg';
import { TenantRepository } from '../../../core/TenantRepository.js';

export type VendorBillClearingRow = {
  id: string;
  bill_id: string;
  journal_entry_id: string;
  contractor_advance_id: string | null;
  amount: string;
  settlement_kind: string;
  entry_date: Date;
};

export type VendorBillClearingLockRow = {
  id: string;
  bill_id: string;
  contractor_advance_id: string | null;
  amount: string;
};

export class VendorBillAdvanceClearingRepository extends TenantRepository {
  constructor(tenantId: string, client?: pg.PoolClient) {
    super(tenantId, client);
  }

  async listActiveSettlementsForBills(
    client: pg.PoolClient,
    billIds: string[]
  ): Promise<VendorBillClearingRow[]> {
    if (billIds.length === 0) return [];
    const r = await client.query<VendorBillClearingRow>(
      `SELECT
         vbc.id,
         vbc.bill_id,
         vbc.journal_entry_id,
         vbc.contractor_advance_id,
         vbc.amount::text,
         COALESCE(NULLIF(TRIM(vbc.settlement_kind), ''), 'advance') AS settlement_kind,
         je.entry_date
       FROM vendor_bill_advance_clearings vbc
       INNER JOIN journal_entries je
         ON je.id = vbc.journal_entry_id AND je.tenant_id = vbc.tenant_id
       WHERE vbc.tenant_id = $1
         AND vbc.bill_id = ANY($2::text[])
         AND TRIM(COALESCE(je.source_module, '')) = 'vendor_bill_advance_clearing'
         AND NOT EXISTS (
           SELECT 1 FROM journal_reversals jr
           WHERE jr.tenant_id = vbc.tenant_id
             AND jr.original_journal_entry_id = vbc.journal_entry_id
         )
       ORDER BY vbc.journal_entry_id, vbc.id`,
      [this.tenantId, billIds]
    );
    return r.rows;
  }

  /** Non-reversed advance-kind clearings for one advance, most recent settlement first (LIFO). */
  async listActiveSettlementsForAdvance(
    client: pg.PoolClient,
    advanceId: string
  ): Promise<Array<{ journal_entry_id: string; bill_id: string; amount: string; entry_date: Date }>> {
    const r = await client.query<{
      journal_entry_id: string;
      bill_id: string;
      amount: string;
      entry_date: Date;
    }>(
      `SELECT vbc.journal_entry_id, vbc.bill_id, vbc.amount::text, je.entry_date
       FROM vendor_bill_advance_clearings vbc
       INNER JOIN journal_entries je
         ON je.id = vbc.journal_entry_id AND je.tenant_id = vbc.tenant_id
       WHERE vbc.tenant_id = $1
         AND vbc.contractor_advance_id = $2
         AND COALESCE(NULLIF(TRIM(vbc.settlement_kind), ''), 'advance') <> 'cash'
         AND TRIM(COALESCE(je.source_module, '')) = 'vendor_bill_advance_clearing'
         AND NOT EXISTS (
           SELECT 1 FROM journal_reversals jr
           WHERE jr.tenant_id = vbc.tenant_id
             AND jr.original_journal_entry_id = vbc.journal_entry_id
         )
       ORDER BY je.entry_date DESC, vbc.journal_entry_id DESC, vbc.id DESC`,
      [this.tenantId, advanceId]
    );
    return r.rows;
  }

  /** Total non-reversed advance-kind amount currently applied from one advance against vendor bills. */
  async sumAppliedForAdvance(client: pg.PoolClient, advanceId: string): Promise<number> {
    const r = await client.query<{ sum: string | null }>(
      `SELECT COALESCE(SUM(vbc.amount), 0)::text AS sum
       FROM vendor_bill_advance_clearings vbc
       INNER JOIN journal_entries je
         ON je.id = vbc.journal_entry_id AND je.tenant_id = vbc.tenant_id
       WHERE vbc.tenant_id = $1
         AND vbc.contractor_advance_id = $2
         AND COALESCE(NULLIF(TRIM(vbc.settlement_kind), ''), 'advance') <> 'cash'
         AND TRIM(COALESCE(je.source_module, '')) = 'vendor_bill_advance_clearing'
         AND NOT EXISTS (
           SELECT 1 FROM journal_reversals jr
           WHERE jr.tenant_id = vbc.tenant_id
             AND jr.original_journal_entry_id = vbc.journal_entry_id
         )`,
      [this.tenantId, advanceId]
    );
    const n = Number(r.rows[0]?.sum ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  async listByJournalEntryIdForUpdate(
    client: pg.PoolClient,
    journalEntryId: string
  ): Promise<VendorBillClearingLockRow[]> {
    const r = await client.query<VendorBillClearingLockRow>(
      `SELECT id, bill_id, contractor_advance_id, amount::text
       FROM vendor_bill_advance_clearings
       WHERE tenant_id = $1 AND journal_entry_id = $2
       FOR UPDATE`,
      [this.tenantId, journalEntryId]
    );
    return r.rows;
  }

  async insertClearing(
    client: pg.PoolClient,
    input: {
      id: string;
      bill_id: string;
      contractor_advance_id: string | null;
      settlement_kind: 'advance' | 'cash';
      amount: number;
      journal_entry_id: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO vendor_bill_advance_clearings
       (id, tenant_id, bill_id, contractor_advance_id, settlement_kind, amount, journal_entry_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.id,
        this.tenantId,
        input.bill_id,
        input.contractor_advance_id,
        input.settlement_kind,
        input.amount,
        input.journal_entry_id,
      ]
    );
  }

  async deleteByJournalEntry(client: pg.PoolClient, journalEntryId: string): Promise<void> {
    await client.query(`DELETE FROM vendor_bill_advance_clearings WHERE tenant_id = $1 AND journal_entry_id = $2`, [
      this.tenantId,
      journalEntryId,
    ]);
  }
}

import type pg from 'pg';
import { isJournalReversed, reverseJournalEntry } from './journalService.js';
import { recalculateBillPaymentAggregates } from './billsService.js';
import { getTransactionById } from './transactionsService.js';
import { syncOwnerSummariesForTransactionChange } from './ownerRentalSummaryService.js';
import { VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX } from '../constants/vendorSettlement.js';
import { roundMoney } from '../financial/validation.js';

/** Undo one vendor bill prepaid settlement journal: restore advances, drop clearings, remove mirrored cash txn, reverse GL. */
export async function reverseVendorBillAdvanceSettlement(
  client: pg.PoolClient,
  tenantId: string,
  journalEntryId: string,
  reason: string,
  actorUserId: string | null
): Promise<{
  billIds: string[];
  touchedAdvanceIds: string[];
  deletedTransactionIds: string[];
  reversalJournalEntryId: string;
}> {
  const jeId = String(journalEntryId ?? '').trim();
  if (!jeId) throw new Error('journalEntryId is required.');
  const rreason = typeof reason === 'string' ? reason.trim() : '';
  if (!rreason) throw new Error('Reversal reason is required.');

  if (await isJournalReversed(client, jeId, tenantId)) {
    throw new Error('This journal entry has already been reversed.');
  }

  const j = await client.query(
    `SELECT id, source_module FROM journal_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [jeId, tenantId]
  );
  if (j.rows.length === 0) throw new Error('Journal entry not found.');
  const sourceModule = String((j.rows[0] as { source_module?: string }).source_module ?? '').trim();
  if (sourceModule !== 'vendor_bill_advance_clearing') {
    throw new Error('Only vendor bill advance settlement journals can be reversed with this action.');
  }

  const clearingRes = await client.query<{
    id: string;
    bill_id: string;
    contractor_advance_id: string | null;
    amount: string;
  }>(
    `SELECT id, bill_id, contractor_advance_id, amount::text
     FROM vendor_bill_advance_clearings
     WHERE tenant_id = $1 AND journal_entry_id = $2
     FOR UPDATE`,
    [tenantId, jeId]
  );

  const clearingRows = clearingRes.rows ?? [];
  if (clearingRows.length === 0) {
    throw new Error('No settlement clearings linked to this journal entry (already removed or invalid).');
  }

  const billIds = [...new Set(clearingRows.map((r) => String(r.bill_id)))];
  billIds.sort();
  for (const bid of billIds) {
    await client.query(`SELECT id FROM bills WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`, [
      tenantId,
      bid,
    ]);
  }

  const touchedAdvanceIds = [...new Set(clearingRows.map((r) => r.contractor_advance_id).filter(Boolean) as string[])];
  touchedAdvanceIds.sort((a, b) => a.localeCompare(b));

  for (const row of clearingRows) {
    const advId = row.contractor_advance_id;
    if (!advId) continue;
    const amt = roundMoney(Number(row.amount));
    if (!(amt > 0)) continue;
    await client.query(
      `UPDATE contractor_advances SET remaining_amount = remaining_amount + $1::numeric, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [amt, tenantId, advId]
    );
  }

  await client.query(`DELETE FROM vendor_bill_advance_clearings WHERE tenant_id = $1 AND journal_entry_id = $2`, [
    tenantId,
    jeId,
  ]);

  const vsetRef = `${VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX}${jeId}`;
  const txSel = await client.query<{ id: string }>(
    `SELECT id FROM transactions WHERE tenant_id = $1 AND reference = $2 AND deleted_at IS NULL FOR UPDATE`,
    [tenantId, vsetRef]
  );

  const deletedTransactionIds: string[] = [];
  for (const t of txSel.rows) {
    const row = await getTransactionById(client, tenantId, t.id);
    if (!row) continue;
    await syncOwnerSummariesForTransactionChange(client, tenantId, row, null);
    const del = await client.query(
      `UPDATE transactions SET deleted_at = NOW(), version = version + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [t.id, tenantId]
    );
    if ((del.rowCount ?? 0) > 0) deletedTransactionIds.push(t.id);
  }

  for (const bid of billIds) {
    await recalculateBillPaymentAggregates(client, tenantId, bid);
  }

  const { reversalJournalEntryId } = await reverseJournalEntry(client, tenantId, jeId, rreason, actorUserId);

  return { billIds, touchedAdvanceIds, deletedTransactionIds, reversalJournalEntryId };
}

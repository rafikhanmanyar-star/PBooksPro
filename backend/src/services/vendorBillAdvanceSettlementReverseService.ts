import type pg from 'pg';
import { recordDomainMutation } from '../core/recordDomainMutation.js';
import { isJournalReversed, reverseJournalEntry } from './journalService.js';
import { JournalRepository } from '../modules/accounting/repositories/JournalRepository.js';
import { getBillById, recalculateBillPaymentAggregates, rowToBillApi } from './billsService.js';
import { getTransactionById } from './transactionsService.js';
import { TransactionRepository } from '../modules/accounting/repositories/TransactionRepository.js';
import { syncOwnerSummariesForTransactionChange } from './ownerRentalSummaryService.js';
import { VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX } from '../constants/vendorSettlement.js';
import { roundMoney } from '../financial/validation.js';
import { BillRepository } from '../modules/vendors/repositories/BillRepository.js';
import { ContractorAdvanceRepository } from '../modules/vendors/repositories/ContractorAdvanceRepository.js';
import { VendorBillAdvanceClearingRepository } from '../modules/vendors/repositories/VendorBillAdvanceClearingRepository.js';
import { rowAdvanceToApi } from './contractorBillingService.js';

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

  const j = await new JournalRepository(tenantId).getSourceModuleForUpdate(client, jeId);
  if (!j) throw new Error('Journal entry not found.');
  const sourceModule = String(j.source_module ?? '').trim();
  if (sourceModule !== 'vendor_bill_advance_clearing') {
    throw new Error('Only vendor bill advance settlement journals can be reversed with this action.');
  }

  const clearingRows = await new VendorBillAdvanceClearingRepository(tenantId).listByJournalEntryIdForUpdate(
    client,
    jeId
  );
  if (clearingRows.length === 0) {
    throw new Error('No settlement clearings linked to this journal entry (already removed or invalid).');
  }

  const billIds = [...new Set(clearingRows.map((r) => String(r.bill_id)))];
  billIds.sort();
  const billRepo = new BillRepository(tenantId);
  for (const bid of billIds) {
    const locked = await billRepo.getByIdForUpdate(client, bid);
    if (!locked) throw new Error(`Bill not found: ${bid}`);
  }

  const touchedAdvanceIds = [...new Set(clearingRows.map((r) => r.contractor_advance_id).filter(Boolean) as string[])];
  touchedAdvanceIds.sort((a, b) => a.localeCompare(b));

  const advanceRepo = new ContractorAdvanceRepository(tenantId);
  for (const row of clearingRows) {
    const advId = row.contractor_advance_id;
    if (!advId) continue;
    const amt = roundMoney(Number(row.amount));
    if (!(amt > 0)) continue;
    await advanceRepo.adjustRemaining(client, advId, amt);
  }

  await new VendorBillAdvanceClearingRepository(tenantId).deleteByJournalEntry(client, jeId);

  const vsetRef = `${VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX}${jeId}`;
  const txRepo = new TransactionRepository(tenantId);
  const txIds = await txRepo.listActiveIdsByReferenceForUpdate(client, vsetRef);

  const deletedTransactionIds: string[] = [];
  for (const txId of txIds) {
    const row = await getTransactionById(client, tenantId, txId);
    if (!row) continue;
    await syncOwnerSummariesForTransactionChange(client, tenantId, row, null);
    if (await txRepo.markDeleted(client, txId)) deletedTransactionIds.push(txId);
  }

  for (const bid of billIds) {
    await recalculateBillPaymentAggregates(client, tenantId, bid);
  }

  const { reversalJournalEntryId } = await reverseJournalEntry(client, tenantId, jeId, rreason, actorUserId);

  for (const bid of billIds) {
    const updatedBill = await getBillById(client, tenantId, bid);
    if (!updatedBill) continue;
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'bills',
      entityType: 'bill',
      entityId: bid,
      action: 'update',
      auditAction: 'vendor_settlement_reverse',
      summary: `Bill ${updatedBill.bill_number} settlement reversed`,
      newValue: { ...rowToBillApi(updatedBill), reversedJournalEntryId: jeId, reversalJournalEntryId },
      version: updatedBill.version,
    });
  }

  for (const aid of touchedAdvanceIds) {
    const refreshedAdvance = await advanceRepo.getById(client, aid);
    if (!refreshedAdvance) continue;
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'contractors',
      entityType: 'contractor_advance',
      entityId: aid,
      action: 'update',
      auditAction: 'vendor_settlement_reverse',
      summary: `Advance ${aid} restored after settlement reversal`,
      newValue: rowAdvanceToApi(refreshedAdvance),
    });
  }

  return { billIds, touchedAdvanceIds, deletedTransactionIds, reversalJournalEntryId };
}

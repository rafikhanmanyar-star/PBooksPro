import type pg from 'pg';
import { randomUUID } from 'crypto';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { JournalRepository } from '../../accounting/repositories/JournalRepository.js';
import {
  getBillById,
  recalculateBillPaymentAggregates,
  resolveBillRowCategoryIdForExpenseMirror,
  rowToBillApi,
  type BillRow,
} from './billsService.js';
import { createTransaction, type TransactionRow } from '../../accounting/services/transactionsService.js';
import { VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX } from '../../../constants/vendorSettlement.js';
import {
  type AdjustmentInput,
  resolveContractorPartyToContactId,
  resolvePartyIdFromVendorBill,
  rowAdvanceToApi,
} from './contractorBillingService.js';
import { roundMoney, type JournalLineInput } from '../../../financial/validation.js';
import {
  entryDimensionsFrom,
  journalLineWithDimensions,
  resolveJournalDimensions,
} from '../../../financial/journalDimensions.js';
import { BillRepository } from '../repositories/BillRepository.js';
import { ContractorAdvanceRepository } from '../repositories/ContractorAdvanceRepository.js';
import { VendorBillAdvanceClearingRepository } from '../repositories/VendorBillAdvanceClearingRepository.js';

const MONEY_EPS = 0.005;

export type VendorBillAdvanceSettleLineInput = {
  billId: string;
  adjustments: AdjustmentInput[];
  cashAmount: number;
  expenseAccountId: string;
};

function parseMoney(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) throw new Error('Invalid money value.');
  return n;
}

function newId(): string {
  return randomUUID();
}

type Prepared = {
  line: VendorBillAdvanceSettleLineInput;
  bill: BillRow;
  unpaid: number;
  adjSum: number;
  cash: number;
  settleTotal: number;
  byAdvance: Map<string, number>;
};

function moneyLabel(n: number): string {
  return roundMoney(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function billLabelForNarrative(bill: BillRow): string {
  const n = bill.bill_number && String(bill.bill_number).trim();
  return n ? `Bill #${n}` : `Bill ${bill.id}`;
}

/** User-facing line stored on the bill row after settlement (ledger / drill-down). */
function buildBillPaymentRecordNote(p: Prepared): string {
  const bl = billLabelForNarrative(p.bill);
  if (p.adjSum > MONEY_EPS && p.cash > MONEY_EPS) {
    return `[Payment record] ${bl}: Paid from supplier prepaid advance (${moneyLabel(p.adjSum)}) and bank/cash (${moneyLabel(p.cash)}).`;
  }
  if (p.adjSum > MONEY_EPS) {
    return `[Payment record] ${bl}: Paid from supplier prepaid advance (${moneyLabel(p.adjSum)}).`;
  }
  return `[Payment record] ${bl}: Paid from bank/cash (${moneyLabel(p.cash)}).`;
}

function buildJournalDescriptionForBill(userNote: string | null | undefined, p: Prepared): string {
  const bl = billLabelForNarrative(p.bill);
  let auto: string;
  if (p.adjSum > MONEY_EPS && p.cash > MONEY_EPS) {
    auto = `${bl}: ${moneyLabel(p.adjSum)} cleared from supplier prepaid; ${moneyLabel(p.cash)} from bank/cash.`;
  } else if (p.adjSum > MONEY_EPS) {
    auto = `${bl}: ${moneyLabel(p.adjSum)} from supplier prepaid advance.`;
  } else {
    auto = `${bl}: Paid ${moneyLabel(p.cash)} from bank/cash.`;
  }
  const u = typeof userNote === 'string' && userNote.trim() ? userNote.trim() : '';
  return u ? `${u} — ${auto}` : auto;
}

/** User-facing line on the Expense row for the bank/cash slice (advance slice has no transaction). */
function buildVendorSettlementCashExpenseDescription(p: Prepared): string {
  const bl = billLabelForNarrative(p.bill);
  return `Cash/bank leg from prepaid settlement — ${bl} (${moneyLabel(p.cash)}).`;
}

/** Bill contact/vendor id that maps to contacts & contractor_advances rows (supports vendors.id bridge). */
export async function resolveSupplierContactForBill(
  client: pg.PoolClient,
  tenantId: string,
  bill: BillRow
): Promise<string | null> {
  return resolvePartyIdFromVendorBill(client, tenantId, {
    contact_id: bill.contact_id,
    vendor_id: bill.vendor_id,
  });
}

export async function settleVendorBillsBatchWithAdvances(
  client: pg.PoolClient,
  tenantId: string,
  actorUserId: string | null,
  input: {
    supplierContactId: string;
    paymentAccountId: string;
    entryDate: string;
    bills: VendorBillAdvanceSettleLineInput[];
    reference?: string | null;
    description?: string | null;
    batchId?: string | null;
  }
): Promise<{
  journalEntries: { billId: string; journalEntryId: string }[];
  touchedAdvanceIds: string[];
  cashExpenseTransactions: TransactionRow[];
}> {
  const supplier = String(input.supplierContactId ?? '').trim();
  if (!supplier) throw new Error('supplierContactId is required.');
  const supplierResolved = await resolveContractorPartyToContactId(client, tenantId, supplier);
  const payAcct = String(input.paymentAccountId ?? '').trim();
  if (!payAcct) throw new Error('paymentAccountId is required.');
  if (!input.bills?.length) throw new Error('At least one bill line is required.');

  const billIds = input.bills.map((b) => String(b.billId ?? '').trim());
  if (billIds.some((id) => !id)) throw new Error('Each bill requires billId.');
  if (new Set(billIds).size !== billIds.length) throw new Error('Duplicate bill in settlement batch.');

  const sortedLocks = [...new Set(billIds)].sort();
  const billRepo = new BillRepository(tenantId);
  for (const bid of sortedLocks) {
    const locked = await billRepo.getByIdForUpdate(client, bid);
    if (!locked) throw new Error(`Bill not found: ${bid}`);
  }

  const prepared: Prepared[] = [];
  const globalAdvanceUse = new Map<string, number>();

  for (const line of input.bills) {
    const bid = String(line.billId ?? '').trim();
    const bill = await getBillById(client, tenantId, bid);
    if (!bill) throw new Error(`Bill not found: ${bid}`);

    const resolved = await resolveSupplierContactForBill(client, tenantId, bill);
    if (!resolved || resolved !== supplierResolved) {
      throw new Error(
        `Bill ${bid} must be tied to supplier contact "${supplierResolved}". ` +
          'Link the bill to the same vendor/contact record used when recording advances (bill contact/vendor).'
      );
    }

    const unpaid = roundMoney(parseMoney(bill.amount) - parseMoney(bill.paid_amount));
    if (unpaid <= MONEY_EPS) throw new Error(`Bill ${bid} has no unpaid balance.`);

    const expenseAccountId = String(line.expenseAccountId ?? '').trim();
    if (!expenseAccountId) throw new Error(`Bill ${bid}: expenseAccountId is required.`);

    let adjustmentNr = 0;
    const byAdvance = new Map<string, number>();
    for (const adj of line.adjustments ?? []) {
      const a = roundMoney(adj.amount);
      if (a <= 0) throw new Error('Each adjustment amount must be positive.');
      adjustmentNr += a;
      byAdvance.set(adj.advanceId, (byAdvance.get(adj.advanceId) ?? 0) + a);
      globalAdvanceUse.set(adj.advanceId, (globalAdvanceUse.get(adj.advanceId) ?? 0) + a);
    }
    const adjSum = roundMoney(adjustmentNr);
    const cash = roundMoney(line.cashAmount);
    const settleTotal = roundMoney(adjSum + cash);
    if (settleTotal > unpaid + MONEY_EPS) {
      throw new Error(
        `Bill ${bid}: payment total (${moneyLabel(settleTotal)}) cannot exceed unpaid balance (${moneyLabel(unpaid)}).`
      );
    }
    if (settleTotal <= MONEY_EPS) {
      throw new Error(`Bill ${bid}: enter a positive amount from prepaid and/or bank/cash (partial payment is allowed).`);
    }

    prepared.push({ line, bill, unpaid, adjSum, cash, settleTotal, byAdvance });
  }

  const advanceClearedAgainstBills = new Map<string, Array<{ billNumber: string; amount: number }>>();
  for (const p of prepared) {
    const billNumber = (p.bill.bill_number && String(p.bill.bill_number).trim()) || p.bill.id;
    for (const [advanceIdAgg, amt] of p.byAdvance.entries()) {
      const list = advanceClearedAgainstBills.get(advanceIdAgg) ?? [];
      list.push({ billNumber, amount: roundMoney(amt) });
      advanceClearedAgainstBills.set(advanceIdAgg, list);
    }
  }

  let advanceGlAggregate: string | null = null;

  const touchedAdvanceIds = [...globalAdvanceUse.keys()].sort((a, b) => a.localeCompare(b));
  const advanceRepo = new ContractorAdvanceRepository(tenantId);
  if (touchedAdvanceIds.length > 0) {
    for (const aid of touchedAdvanceIds) {
      const row = await advanceRepo.getByIdForUpdate(client, aid);
      if (!row) throw new Error(`Advance not found: ${aid}`);
      if (row.contractor_contact_id !== supplierResolved) {
        throw new Error(`Advance ${aid} does not belong to this supplier contact.`);
      }
      const need = roundMoney(globalAdvanceUse.get(aid)!);
      const rem = roundMoney(parseMoney(row.remaining_amount));
      if (need > rem + MONEY_EPS) {
        throw new Error(`Advance ${aid}: requested ${need} exceeds remaining ${rem}.`);
      }
      if (advanceGlAggregate == null) advanceGlAggregate = row.advance_asset_account_id;
      else if (advanceGlAggregate !== row.advance_asset_account_id) {
        throw new Error(
          'All advances applied in one settlement must use the same advance asset GL account (advance_asset_account_id).'
        );
      }
    }
  }

  const clearingRepo = new VendorBillAdvanceClearingRepository(tenantId);
  const journalEntries: { billId: string; journalEntryId: string }[] = [];
  const cashExpenseTransactions: TransactionRow[] = [];
  const refBase =
    typeof input.reference === 'string' && input.reference.trim() ? input.reference.trim() : undefined;
  const userNoteForJournal =
    typeof input.description === 'string' && input.description.trim() ? input.description.trim() : null;

  for (const p of prepared) {
    const { bill } = p;
    const billId = bill.id;
    const dims = resolveJournalDimensions(bill);

    const linesJe: JournalLineInput[] = [
      journalLineWithDimensions(
        { accountId: p.line.expenseAccountId, debitAmount: p.settleTotal, creditAmount: 0 },
        dims
      ),
    ];
    const advGl = advanceGlAggregate;
    if (p.adjSum > MONEY_EPS) {
      if (!advGl) throw new Error(`Bill ${billId}: advance allocations require a valid advance GL account.`);
      linesJe.push(
        journalLineWithDimensions({ accountId: advGl, debitAmount: 0, creditAmount: p.adjSum }, dims)
      );
    }
    if (p.cash > MONEY_EPS) {
      linesJe.push(
        journalLineWithDimensions({ accountId: payAcct, debitAmount: 0, creditAmount: p.cash }, dims)
      );
    }

    const journalDescription =
      typeof input.description === 'string' && input.description.trim()
        ? buildJournalDescriptionForBill(userNoteForJournal, p)
        : bill.description?.trim()
          ? `${bill.description.trim()} — ${buildJournalDescriptionForBill(null, p)}`
          : buildJournalDescriptionForBill(null, p);

    const { journalEntryId } = await new JournalRepository(tenantId).insertEntry(client, {
      entryDate: input.entryDate.trim(),
      reference: refBase ?? `VB-${bill.bill_number || billId}`,
      description: journalDescription,
      sourceModule: 'vendor_bill_advance_clearing',
      sourceId: billId,
      createdBy: actorUserId,
      ...entryDimensionsFrom(dims),
      lines: linesJe,
    });
    journalEntries.push({ billId, journalEntryId });

    for (const [advanceIdAgg, amt] of p.byAdvance.entries()) {
      await clearingRepo.insertClearing(client, {
        id: newId(),
        bill_id: billId,
        contractor_advance_id: advanceIdAgg,
        settlement_kind: 'advance',
        amount: roundMoney(amt),
        journal_entry_id: journalEntryId,
      });
    }

    if (p.cash > MONEY_EPS) {
      await clearingRepo.insertClearing(client, {
        id: newId(),
        bill_id: billId,
        contractor_advance_id: null,
        settlement_kind: 'cash',
        amount: p.cash,
        journal_entry_id: journalEntryId,
      });

      const txRow = await createTransaction(
        client,
        tenantId,
        {
          type: 'Expense',
          subtype: 'vendor_settlement_cash',
          amount: p.cash,
          date: input.entryDate.trim(),
          description: buildVendorSettlementCashExpenseDescription(p),
          reference: `${VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX}${journalEntryId}`,
          accountId: payAcct,
          billId,
          contactId: bill.contact_id ?? undefined,
          vendorId: bill.vendor_id ?? undefined,
          projectId: dims.projectId ?? undefined,
          buildingId: dims.buildingId ?? undefined,
          categoryId: resolveBillRowCategoryIdForExpenseMirror(bill),
          batchId: input.batchId ?? undefined,
        },
        actorUserId,
        { skipJournalMirror: true }
      );
      cashExpenseTransactions.push(txRow);
    }

    await recalculateBillPaymentAggregates(client, tenantId, billId);

    const paymentNote = buildBillPaymentRecordNote(p);
    await billRepo.appendPaymentNote(client, billId, paymentNote);
  }

  for (const [aid, totalDec] of globalAdvanceUse.entries()) {
    await advanceRepo.adjustRemaining(client, aid, -roundMoney(totalDec));
  }

  for (const aid of touchedAdvanceIds) {
    const usages = advanceClearedAgainstBills.get(aid);
    if (!usages?.length) continue;
    const clearedLine = `Cleared against bills: ${usages.map((u) => `${u.billNumber} (${moneyLabel(u.amount)})`).join(', ')}.`;
    await advanceRepo.appendDescriptionNote(client, aid, clearedLine);
  }

  for (const aid of touchedAdvanceIds) {
    const rawRem = await advanceRepo.getRemainingAmount(client, aid);
    const rem = rawRem == null ? NaN : roundMoney(rawRem);
    if (!Number.isFinite(rem)) continue;
    if (rem > MONEY_EPS) continue;

    await advanceRepo.markFullyAppliedInDescription(client, aid);
  }

  for (const { billId, journalEntryId } of journalEntries) {
    const updatedBill = await getBillById(client, tenantId, billId);
    if (!updatedBill) continue;
    await recordDomainMutation(client, {
      tenantId,
      userId: actorUserId,
      module: 'bills',
      entityType: 'bill',
      entityId: billId,
      action: 'update',
      auditAction: 'vendor_settlement',
      summary: `Bill ${updatedBill.bill_number} settled with prepaid/cash`,
      newValue: { ...rowToBillApi(updatedBill), settlementJournalEntryId: journalEntryId },
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
      auditAction: 'vendor_settlement',
      summary: `Advance ${aid} applied to vendor bill settlement`,
      newValue: rowAdvanceToApi(refreshedAdvance),
    });
  }

  const checkedContracts = new Set<string>();
  for (const p of prepared) {
    const cid = p.bill.contract_id?.trim();
    if (!cid || checkedContracts.has(cid)) continue;
    checkedContracts.add(cid);
    const { getContractById } = await import('./contractsService.js');
    const {
      notifyRetentionThresholdIfNeeded,
      validateRetentionThresholdForContract,
    } = await import('./contractRetentionService.js');
    const contract = await getContractById(client, tenantId, cid);
    if (!contract) continue;
    const validation = await validateRetentionThresholdForContract(client, tenantId, contract);
    await notifyRetentionThresholdIfNeeded(client, tenantId, contract, validation, actorUserId);
  }

  return { journalEntries, touchedAdvanceIds, cashExpenseTransactions };
}

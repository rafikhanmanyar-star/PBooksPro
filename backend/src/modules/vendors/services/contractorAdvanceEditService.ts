import type pg from 'pg';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { JournalRepository } from '../../accounting/repositories/JournalRepository.js';
import { reverseJournalEntry } from '../../accounting/services/journalService.js';
import { roundMoney } from '../../../financial/validation.js';
import {
  entryDimensionsFrom,
  journalLineWithDimensions,
  resolveJournalDimensions,
} from '../../../financial/journalDimensions.js';
import { ContractorAdvanceRepository } from '../repositories/ContractorAdvanceRepository.js';
import { VendorBillAdvanceClearingRepository } from '../repositories/VendorBillAdvanceClearingRepository.js';
import {
  rowAdvanceToApi,
  type ContractorAdvanceRow,
} from './contractorBillingService.js';
import { reverseVendorBillAdvanceSettlement } from './vendorBillAdvanceSettlementReverseService.js';
import {
  settleVendorBillsBatchWithAdvances,
  type VendorBillAdvanceSettleLineInput,
} from './vendorBillAdvanceSettleService.js';
import type { TransactionRow } from '../../accounting/services/transactionsService.js';

const MONEY_EPS = 0.005;
const CLAWBACK_REASON = 'Advance amount reduced — settlement clawed back';

function parseMoney(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) throw new Error('Invalid money value.');
  return n;
}

function normalizeProjectId(value: string | null | undefined): string | null {
  return value != null && String(value).trim() !== '' ? String(value).trim() : null;
}

export type UpdateContractorAdvanceInput = {
  advanceDate: string;
  amount: number;
  cashAccountId: string;
  advanceAssetAccountId: string;
  projectId?: string | null;
  description?: string | null;
  reference?: string | null;
};

export type UpdateContractorAdvanceResult = {
  advance: ContractorAdvanceRow;
  touchedBillIds: string[];
  deletedTransactionIds: string[];
  createdTransactions: TransactionRow[];
  financialJournalEntryIds: string[];
};

/** Full composition of one vendor-bill settlement journal entry (one bill per JE). */
type SettlementComposition = {
  billId: string;
  expenseAccountId: string;
  /** Bank/cash account credited for the cash leg (null when no cash leg). */
  paymentAccountId: string | null;
  cashAmount: number;
  /** advanceId -> applied amount on this JE. */
  byAdvance: Map<string, number>;
};

/**
 * Read a settlement JE's composition so it can be reversed and re-settled with a reduced
 * portion for one advance. Each settlement JE settles exactly one bill (see settle service).
 */
async function readSettlementComposition(
  client: pg.PoolClient,
  tenantId: string,
  journalEntryId: string,
  advanceAssetAccountId: string
): Promise<SettlementComposition> {
  const clearingRepo = new VendorBillAdvanceClearingRepository(tenantId);
  const clearings = await clearingRepo.listByJournalEntryIdForUpdate(client, journalEntryId);
  if (clearings.length === 0) {
    throw new Error('Settlement clearings not found for journal entry.');
  }
  const billId = String(clearings[0].bill_id);
  const byAdvance = new Map<string, number>();
  let cashAmount = 0;
  for (const row of clearings) {
    const amt = roundMoney(Number(row.amount));
    if (row.contractor_advance_id) {
      byAdvance.set(row.contractor_advance_id, roundMoney((byAdvance.get(row.contractor_advance_id) ?? 0) + amt));
    } else {
      cashAmount = roundMoney(cashAmount + amt);
    }
  }

  const withLines = await new JournalRepository(tenantId).getWithLines(client, journalEntryId);
  if (!withLines) throw new Error('Settlement journal entry not found.');

  let expenseAccountId = '';
  let paymentAccountId: string | null = null;
  for (const line of withLines.lines) {
    const accountId = String(line.account_id);
    const debit = roundMoney(Number(line.debit_amount));
    const credit = roundMoney(Number(line.credit_amount));
    if (debit > MONEY_EPS) {
      expenseAccountId = accountId;
    } else if (credit > MONEY_EPS && accountId !== advanceAssetAccountId) {
      paymentAccountId = accountId;
    }
  }
  if (!expenseAccountId) throw new Error('Could not resolve expense account from settlement journal entry.');

  return { billId, expenseAccountId, paymentAccountId, cashAmount, byAdvance };
}

/** Sum advance amounts applied to construction contractor bills (cannot be auto-clawed back). */
async function sumAppliedToContractorBills(
  client: pg.PoolClient,
  tenantId: string,
  advanceId: string
): Promise<number> {
  const r = await client.query<{ sum: string | null }>(
    `SELECT COALESCE(SUM(cba.amount), 0)::text AS sum
     FROM contractor_bill_adjustments cba
     INNER JOIN contractor_bills cb ON cb.id = cba.contractor_bill_id AND cb.tenant_id = cba.tenant_id
     WHERE cba.tenant_id = $1 AND cba.contractor_advance_id = $2 AND cb.deleted_at IS NULL`,
    [tenantId, advanceId]
  );
  const n = Number(r.rows[0]?.sum ?? 0);
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

/**
 * Edit a supplier/vendor prepaid advance.
 *
 * - Always allows editing amount, date, project, reference, description.
 * - GL accounts (pay-from + prepaid asset) may only change while nothing has been applied.
 * - Reducing the amount below the amount already applied to vendor bills auto-claws back the most
 *   recently applied settlements (LIFO), reversing and re-settling each affected bill so its payment
 *   status is recomputed. Reducing below the amount applied to construction contractor bills is rejected.
 */
export async function updateContractorAdvance(
  client: pg.PoolClient,
  tenantId: string,
  advanceId: string,
  input: UpdateContractorAdvanceInput,
  actorUserId: string | null
): Promise<UpdateContractorAdvanceResult> {
  const id = String(advanceId ?? '').trim();
  if (!id) throw new Error('Advance id is required.');

  const newAmount = roundMoney(input.amount);
  if (!(newAmount > 0)) throw new Error('Advance amount must be positive.');

  const advanceRepo = new ContractorAdvanceRepository(tenantId);
  const clearingRepo = new VendorBillAdvanceClearingRepository(tenantId);

  const current = await advanceRepo.getByIdForUpdate(client, id);
  if (!current) throw new Error('Advance not found.');

  const newCashAccountId = String(input.cashAccountId ?? '').trim();
  const newAdvanceAssetAccountId = String(input.advanceAssetAccountId ?? '').trim();
  if (!newCashAccountId) throw new Error('Pay-from account is required.');
  if (!newAdvanceAssetAccountId) throw new Error('Prepaid asset account is required.');
  const newDate = String(input.advanceDate ?? '').trim();
  if (!newDate) throw new Error('Advance date is required.');
  const newProjectId = normalizeProjectId(input.projectId);
  const newDescription = input.description != null ? String(input.description) : null;

  const advanceAssetAccountId = current.advance_asset_account_id;

  const appliedViaClearings = roundMoney(await clearingRepo.sumAppliedForAdvance(client, id));
  const appliedViaContractorBills = await sumAppliedToContractorBills(client, tenantId, id);
  const totalApplied = roundMoney(appliedViaClearings + appliedViaContractorBills);

  const accountsChanged =
    newCashAccountId !== current.cash_account_id || newAdvanceAssetAccountId !== current.advance_asset_account_id;
  if (accountsChanged && totalApplied > MONEY_EPS) {
    throw new Error(
      'GL accounts cannot be changed once part of this advance has been applied to bills. Reverse the bill settlement(s) first.'
    );
  }

  const clawbackNeeded = roundMoney(Math.max(0, totalApplied - newAmount));
  if (clawbackNeeded > appliedViaClearings + MONEY_EPS) {
    const blockedByContractorBills = roundMoney(clawbackNeeded - appliedViaClearings);
    throw new Error(
      `Cannot reduce the advance below the amount already applied to construction contractor bills ` +
        `(${blockedByContractorBills.toFixed(2)}). Reverse those contractor bill adjustments first.`
    );
  }

  const touchedBillIds = new Set<string>();
  const deletedTransactionIds: string[] = [];
  const createdTransactions: TransactionRow[] = [];
  const financialJournalEntryIds: string[] = [];

  // 1. Claw back from the most recently applied settlements (LIFO).
  if (clawbackNeeded > MONEY_EPS) {
    const settlements = await clearingRepo.listActiveSettlementsForAdvance(client, id);
    let remaining = clawbackNeeded;
    for (const s of settlements) {
      if (remaining <= MONEY_EPS) break;
      const jeId = String(s.journal_entry_id);
      const thisAdvAmt = roundMoney(Number(s.amount));
      if (!(thisAdvAmt > 0)) continue;
      const reduceBy = roundMoney(Math.min(thisAdvAmt, remaining));
      const newThisAdvAmt = roundMoney(thisAdvAmt - reduceBy);

      const comp = await readSettlementComposition(client, tenantId, jeId, advanceAssetAccountId);
      const entryDate =
        s.entry_date instanceof Date ? s.entry_date.toISOString().slice(0, 10) : String(s.entry_date).slice(0, 10);

      const rev = await reverseVendorBillAdvanceSettlement(client, tenantId, jeId, CLAWBACK_REASON, actorUserId);
      touchedBillIds.add(comp.billId);
      for (const bid of rev.billIds) touchedBillIds.add(bid);
      for (const txId of rev.deletedTransactionIds) deletedTransactionIds.push(txId);
      financialJournalEntryIds.push(rev.reversalJournalEntryId);

      const adjustments: { advanceId: string; amount: number }[] = [];
      for (const [aid, amt] of comp.byAdvance.entries()) {
        const value = aid === id ? newThisAdvAmt : roundMoney(amt);
        if (value > MONEY_EPS) adjustments.push({ advanceId: aid, amount: value });
      }
      const adjSum = roundMoney(adjustments.reduce((sum, a) => sum + a.amount, 0));
      const newSettleTotal = roundMoney(adjSum + comp.cashAmount);

      if (newSettleTotal > MONEY_EPS) {
        const line: VendorBillAdvanceSettleLineInput = {
          billId: comp.billId,
          adjustments,
          cashAmount: comp.cashAmount,
          expenseAccountId: comp.expenseAccountId,
        };
        const settle = await settleVendorBillsBatchWithAdvances(client, tenantId, actorUserId, {
          supplierContactId: current.contractor_contact_id,
          // paymentAccountId is required by the settle service even when no cash leg is posted.
          paymentAccountId: comp.paymentAccountId ?? current.cash_account_id,
          entryDate,
          bills: [line],
        });
        for (const je of settle.journalEntries) financialJournalEntryIds.push(je.journalEntryId);
        for (const tx of settle.cashExpenseTransactions) createdTransactions.push(tx);
      }

      remaining = roundMoney(remaining - reduceBy);
    }
  }

  // 2. Re-post the creation journal entry if any GL-relevant field changed.
  const amountChanged = roundMoney(parseMoney(current.original_amount)) !== newAmount;
  const dateChanged = String(current.advance_date).slice(0, 10) !== newDate;
  const projectChanged = normalizeProjectId(current.project_id) !== newProjectId;
  const glChanged = amountChanged || dateChanged || projectChanged || accountsChanged;

  if (glChanged) {
    if (current.advance_journal_entry_id) {
      await reverseJournalEntry(
        client,
        tenantId,
        current.advance_journal_entry_id,
        'Advance edited — re-posting creation entry',
        actorUserId
      );
      financialJournalEntryIds.push(current.advance_journal_entry_id);
    }
    const dims = resolveJournalDimensions({ projectId: newProjectId });
    const { journalEntryId } = await new JournalRepository(tenantId).insertEntry(client, {
      entryDate: newDate,
      reference: input.reference?.trim() || `ADV:${id}`,
      description: newDescription ?? current.description ?? 'Contractor advance payment',
      sourceModule: 'contractor_advance',
      sourceId: id,
      createdBy: actorUserId,
      ...entryDimensionsFrom(dims),
      lines: [
        journalLineWithDimensions(
          { accountId: newAdvanceAssetAccountId, debitAmount: newAmount, creditAmount: 0 },
          dims
        ),
        journalLineWithDimensions(
          { accountId: newCashAccountId, debitAmount: 0, creditAmount: newAmount },
          dims
        ),
      ],
    });
    await advanceRepo.setAdvanceJournalEntryId(client, id, journalEntryId);
    financialJournalEntryIds.push(journalEntryId);
  }

  // 3. Persist new field values; remaining = new amount minus everything still applied.
  const finalAppliedViaClearings = roundMoney(await clearingRepo.sumAppliedForAdvance(client, id));
  const finalApplied = roundMoney(finalAppliedViaClearings + appliedViaContractorBills);
  const newRemaining = roundMoney(newAmount - finalApplied);
  if (newRemaining < -MONEY_EPS) {
    throw new Error('Computed remaining balance is negative after edit; aborting.');
  }

  await advanceRepo.updateEditableFields(client, id, {
    advance_date: newDate,
    original_amount: newAmount,
    remaining_amount: Math.max(0, newRemaining),
    cash_account_id: newCashAccountId,
    advance_asset_account_id: newAdvanceAssetAccountId,
    project_id: newProjectId,
    description: newDescription,
  });

  const updated = await advanceRepo.getById(client, id);
  if (!updated) throw new Error('Advance not found after edit.');

  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'contractors',
    entityType: 'contractor_advance',
    entityId: id,
    action: 'update',
    summary: `Advance ${id} edited`,
    oldValue: rowAdvanceToApi(current),
    newValue: rowAdvanceToApi(updated),
  });

  return {
    advance: updated,
    touchedBillIds: [...touchedBillIds],
    deletedTransactionIds,
    createdTransactions,
    financialJournalEntryIds,
  };
}

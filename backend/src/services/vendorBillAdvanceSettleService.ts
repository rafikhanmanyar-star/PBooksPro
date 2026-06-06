import type pg from 'pg';
import { randomUUID } from 'crypto';
import { insertJournalEntry } from './journalService.js';
import {
  getBillById,
  recalculateBillPaymentAggregates,
  resolveBillRowCategoryIdForExpenseMirror,
  type BillRow,
} from './billsService.js';
import { createTransaction, type TransactionRow } from './transactionsService.js';
import { VENDOR_SETTLEMENT_CASH_TX_REF_PREFIX } from '../constants/vendorSettlement.js';
import {
  type AdjustmentInput,
  type ContractorAdvanceRow,
  resolveContractorPartyToContactId,
  resolvePartyIdFromVendorBill,
} from './contractorBillingService.js';
import { roundMoney, type JournalLineInput } from '../financial/validation.js';

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
  for (const bid of sortedLocks) {
    await client.query(
      `SELECT id FROM bills WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [tenantId, bid]
    );
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
  if (touchedAdvanceIds.length > 0) {
    for (const aid of touchedAdvanceIds) {
      const ar = await client.query<ContractorAdvanceRow>(
        `SELECT id, tenant_id, contractor_contact_id, advance_date, original_amount::text, remaining_amount::text,
           cash_account_id, advance_asset_account_id, advance_journal_entry_id, project_id, description, created_by,
           created_at, updated_at, deleted_at
         FROM contractor_advances
         WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [tenantId, aid]
      );
      const row = ar.rows[0];
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

  const journalEntries: { billId: string; journalEntryId: string }[] = [];
  const cashExpenseTransactions: TransactionRow[] = [];
  const refBase =
    typeof input.reference === 'string' && input.reference.trim() ? input.reference.trim() : undefined;
  const userNoteForJournal =
    typeof input.description === 'string' && input.description.trim() ? input.description.trim() : null;

  for (const p of prepared) {
    const { bill } = p;
    const billId = bill.id;
    const projectId =
      bill.project_id != null && String(bill.project_id).trim() !== ''
        ? String(bill.project_id).trim()
        : null;

    const linesJe: JournalLineInput[] = [
      {
        accountId: p.line.expenseAccountId,
        debitAmount: p.settleTotal,
        creditAmount: 0,
        projectId,
      },
    ];
    const advGl = advanceGlAggregate;
    if (p.adjSum > MONEY_EPS) {
      if (!advGl) throw new Error(`Bill ${billId}: advance allocations require a valid advance GL account.`);
      linesJe.push({ accountId: advGl, debitAmount: 0, creditAmount: p.adjSum, projectId });
    }
    if (p.cash > MONEY_EPS) {
      linesJe.push({ accountId: payAcct, debitAmount: 0, creditAmount: p.cash, projectId });
    }

    const journalDescription =
      typeof input.description === 'string' && input.description.trim()
        ? buildJournalDescriptionForBill(userNoteForJournal, p)
        : bill.description?.trim()
          ? `${bill.description.trim()} — ${buildJournalDescriptionForBill(null, p)}`
          : buildJournalDescriptionForBill(null, p);

    const { journalEntryId } = await insertJournalEntry(client, tenantId, {
      entryDate: input.entryDate.trim(),
      reference: refBase ?? `VB-${bill.bill_number || billId}`,
      description: journalDescription,
      sourceModule: 'vendor_bill_advance_clearing',
      sourceId: billId,
      createdBy: actorUserId,
      projectId,
      lines: linesJe,
    });
    journalEntries.push({ billId, journalEntryId });

    for (const [advanceIdAgg, amt] of p.byAdvance.entries()) {
      const clearingId = newId();
      await client.query(
        `INSERT INTO vendor_bill_advance_clearings
         (id, tenant_id, bill_id, contractor_advance_id, settlement_kind, amount, journal_entry_id)
         VALUES ($1, $2, $3, $4, 'advance', $5, $6)`,
        [clearingId, tenantId, billId, advanceIdAgg, roundMoney(amt), journalEntryId]
      );
    }

    if (p.cash > MONEY_EPS) {
      const cashClr = newId();
      await client.query(
        `INSERT INTO vendor_bill_advance_clearings
         (id, tenant_id, bill_id, contractor_advance_id, settlement_kind, amount, journal_entry_id)
         VALUES ($1, $2, $3, NULL, 'cash', $4, $5)`,
        [cashClr, tenantId, billId, p.cash, journalEntryId]
      );

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
          projectId: projectId ?? undefined,
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
    await client.query(
      `UPDATE bills SET
         description =
           CASE
             WHEN trim(COALESCE(description, '')) = '' THEN $3::text
             ELSE trim(description) || E'\n' || $3::text
           END,
         version = version + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, billId, paymentNote]
    );
  }

  for (const [aid, totalDec] of globalAdvanceUse.entries()) {
    await client.query(
      `UPDATE contractor_advances SET remaining_amount = remaining_amount - $1::numeric, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [roundMoney(totalDec), tenantId, aid]
    );
  }

  for (const aid of touchedAdvanceIds) {
    const usages = advanceClearedAgainstBills.get(aid);
    if (!usages?.length) continue;
    const clearedLine = `Cleared against bills: ${usages.map((u) => `${u.billNumber} (${moneyLabel(u.amount)})`).join(', ')}.`;
    await client.query(
      `UPDATE contractor_advances SET
         description =
           CASE
             WHEN trim(COALESCE(description, '')) = '' THEN $3::text
             ELSE trim(description) || ' ' || $3::text
           END,
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, aid, clearedLine]
    );
  }

  for (const aid of touchedAdvanceIds) {
    const remR = await client.query<{ remaining_amount: string }>(
      `SELECT remaining_amount::text AS remaining_amount
       FROM contractor_advances WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, aid]
    );
    const rem = roundMoney(Number(remR.rows[0]?.remaining_amount ?? NaN));
    if (!Number.isFinite(rem)) continue;
    if (rem > MONEY_EPS) continue;

    await client.query(
      `UPDATE contractor_advances SET
         description =
           CASE
             WHEN trim(COALESCE(description, '')) ILIKE '%Fully applied (remaining prepaid: 0)%' THEN description
             WHEN trim(COALESCE(description, '')) = '' THEN 'Fully applied (remaining prepaid: 0).'
             ELSE trim(description) || ' Fully applied (remaining prepaid: 0).'
           END,
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [tenantId, aid]
    );
  }

  return { journalEntries, touchedAdvanceIds, cashExpenseTransactions };
}

import type pg from 'pg';
import { randomUUID } from 'crypto';
import { insertJournalEntry } from './journalService.js';
import { getBillById, recalculateBillPaymentAggregates, type BillRow } from './billsService.js';
import {
  assertContactInTenant,
  type AdjustmentInput,
  type ContractorAdvanceRow,
} from './contractorBillingService.js';
import { getContactById } from './contactsService.js';
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

/** Bill contact/vendor id that maps to contacts & contractor_advances rows. */
export async function resolveSupplierContactForBill(
  client: pg.PoolClient,
  tenantId: string,
  bill: BillRow
): Promise<string | null> {
  if (bill.contact_id) {
    const c = await getContactById(client, tenantId, bill.contact_id);
    if (c && c.deleted_at == null) return bill.contact_id;
  }
  if (bill.vendor_id) {
    const c = await getContactById(client, tenantId, bill.vendor_id);
    if (c && c.deleted_at == null) return bill.vendor_id;
  }
  return null;
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
}> {
  const supplier = String(input.supplierContactId ?? '').trim();
  if (!supplier) throw new Error('supplierContactId is required.');
  await assertContactInTenant(client, tenantId, supplier);
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

  type Prepared = {
    line: VendorBillAdvanceSettleLineInput;
    bill: BillRow;
    unpaid: number;
    adjSum: number;
    cash: number;
    settleTotal: number;
    byAdvance: Map<string, number>;
  };

  const prepared: Prepared[] = [];
  const globalAdvanceUse = new Map<string, number>();

  for (const line of input.bills) {
    const bid = String(line.billId ?? '').trim();
    const bill = await getBillById(client, tenantId, bid);
    if (!bill) throw new Error(`Bill not found: ${bid}`);

    const resolved = await resolveSupplierContactForBill(client, tenantId, bill);
    if (!resolved || resolved !== supplier) {
      throw new Error(
        `Bill ${bid} must be tied to supplier contact "${supplier}". ` +
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
    if (Math.abs(settleTotal - unpaid) > MONEY_EPS) {
      throw new Error(
        `Bill ${bid}: advance allocation (${adjSum}) + cash (${cash}) must equal unpaid balance (${unpaid}).`
      );
    }
    if (adjSum <= MONEY_EPS && cash <= MONEY_EPS) {
      throw new Error(`Bill ${bid}: allocate advances and/or cash to match the unpaid balance.`);
    }

    prepared.push({ line, bill, unpaid, adjSum, cash, settleTotal, byAdvance });
  }

  let advanceGlAggregate: string | null = null;

  const uniqAdvIds = [...globalAdvanceUse.keys()].sort((a, b) => a.localeCompare(b));
  if (uniqAdvIds.length > 0) {
    for (const aid of uniqAdvIds) {
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
      if (row.contractor_contact_id !== supplier) {
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
  const refBase =
    typeof input.reference === 'string' && input.reference.trim() ? input.reference.trim() : undefined;

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

    const { journalEntryId } = await insertJournalEntry(client, tenantId, {
      entryDate: input.entryDate.trim(),
      reference: refBase ?? `VB-${bill.bill_number || billId}`,
      description:
        (typeof input.description === 'string' && input.description.trim()
          ? input.description.trim()
          : null) ??
        bill.description ??
        `Vendor bill settled with advances — ${bill.bill_number || billId}`,
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
    }

    await recalculateBillPaymentAggregates(client, tenantId, billId);
  }

  for (const [aid, totalDec] of globalAdvanceUse.entries()) {
    await client.query(
      `UPDATE contractor_advances SET remaining_amount = remaining_amount - $1::numeric, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [roundMoney(totalDec), tenantId, aid]
    );
  }

  for (const p of prepared) {
    await recalculateBillPaymentAggregates(client, tenantId, p.bill.id);
  }

  return { journalEntries };
}

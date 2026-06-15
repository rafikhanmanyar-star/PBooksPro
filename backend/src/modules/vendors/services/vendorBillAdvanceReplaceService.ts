import type pg from 'pg';
import { recordDomainMutation } from '../../../core/recordDomainMutation.js';
import { reverseVendorBillAdvanceSettlement } from './vendorBillAdvanceSettlementReverseService.js';
import { settleVendorBillsBatchWithAdvances, type VendorBillAdvanceSettleLineInput } from './vendorBillAdvanceSettleService.js';
import { getBillById, type BillRow } from './billsService.js';
import { roundMoney } from '../../../financial/validation.js';

const REPLACE_REASON = 'User updated vendor bill settlement (replace)';

export async function replaceVendorBillAdvanceSettlement(
  client: pg.PoolClient,
  tenantId: string,
  actorUserId: string | null,
  input: {
    journalEntryId: string;
    supplierContactId: string;
    paymentAccountId: string;
    entryDate: string;
    bill: VendorBillAdvanceSettleLineInput;
    reference?: string | null;
    description?: string | null;
    batchId?: string | null;
  }
): Promise<{
  reverse: Awaited<ReturnType<typeof reverseVendorBillAdvanceSettlement>>;
  settle: Awaited<ReturnType<typeof settleVendorBillsBatchWithAdvances>>;
  bills: BillRow[];
}> {
  const jeId = String(input.journalEntryId ?? '').trim();
  if (!jeId) throw new Error('journalEntryId is required.');

  const billLine = input.bill;
  const bid = String(billLine.billId ?? '').trim();
  if (!bid) throw new Error('bill.billId is required.');

  const rev = await reverseVendorBillAdvanceSettlement(client, tenantId, jeId, REPLACE_REASON, actorUserId);

  if (!rev.billIds.includes(bid)) {
    throw new Error('Settlement does not belong to this bill.');
  }

  const b = await getBillById(client, tenantId, bid);
  if (!b) throw new Error('Bill not found');

  const unpaid = roundMoney(parseMoney(b.amount) - parseMoney(b.paid_amount));
  const settleTotal = roundMoney(
    (billLine.adjustments ?? []).reduce((s, a) => s + roundMoney(a.amount), 0) +
      roundMoney(billLine.cashAmount ?? 0)
  );
  if (settleTotal > unpaid + 0.02) {
    throw new Error(
      `Adjusted total (${settleTotal}) cannot exceed unpaid balance on the bill (${unpaid}). Refresh if amounts look wrong.`
    );
  }
  if (settleTotal <= 0.005) {
    throw new Error('Settlement total must be greater than zero.');
  }

  const settle = await settleVendorBillsBatchWithAdvances(client, tenantId, actorUserId, {
    supplierContactId: input.supplierContactId.trim(),
    paymentAccountId: input.paymentAccountId.trim(),
    entryDate: input.entryDate.trim(),
    bills: [billLine],
    reference: typeof input.reference === 'string' ? input.reference : null,
    description: typeof input.description === 'string' ? input.description : null,
    batchId: typeof input.batchId === 'string' ? input.batchId : null,
  });

  await recordDomainMutation(client, {
    tenantId,
    userId: actorUserId,
    module: 'bills',
    entityType: 'vendor_bill_settlement',
    entityId: jeId,
    action: 'update',
    auditAction: 'replace',
    summary: `Vendor bill settlement replaced for bill ${bid}`,
    newValue: {
      replacedJournalEntryId: jeId,
      newJournalEntries: settle.journalEntries,
      billId: bid,
      reversalJournalEntryId: rev.reversalJournalEntryId,
    },
  });

  const bills: BillRow[] = [];
  const br = await getBillById(client, tenantId, bid);
  if (br) bills.push(br);

  return { reverse: rev, settle, bills };
}

function parseMoney(v: string | number): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

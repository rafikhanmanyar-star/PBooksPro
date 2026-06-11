import type pg from 'pg';
import { roundMoney } from '../financial/validation.js';

const MONEY_EPS = 0.02;

export type VendorBillSettlementApiRow = {
  billId: string;
  journalEntryId: string;
  entryDate: string;
  totalAmount: number;
  cashAmount: number;
  supplierContactId: string;
  paymentAccountId: string;
  expenseAccountId: string;
  adjustments: { advanceId: string; amount: number }[];
};

type JournalLineRow = {
  account_id: string;
  debit_amount: string | null;
  credit_amount: string | null;
  line_number: number;
};

function readJournalExpenseAndPaymentAccountsFromLines(
  lines: JournalLineRow[],
  tenantId: string,
  cashAmount: number,
  advanceTotal: number,
  defaultBankAccountId: string
): { expenseAccountId: string; paymentAccountId: string } {
  const expenseLine = lines.find((l) => roundMoney(Number(l.debit_amount ?? 0)) > 0);
  if (!expenseLine) throw new Error('Could not infer expense account from settlement journal.');

  const cashRounded = roundMoney(cashAmount);
  const advanceRounded = roundMoney(advanceTotal);

  let paymentAccountId = '';
  const creditLines = lines.filter((l) => roundMoney(Number(l.credit_amount ?? 0)) > 0);

  if (cashRounded > MONEY_EPS) {
    for (const cl of creditLines) {
      const c = roundMoney(Number(cl.credit_amount ?? 0));
      if (Math.abs(c - cashRounded) <= MONEY_EPS) {
        paymentAccountId = cl.account_id;
        break;
      }
    }
    if (!paymentAccountId && creditLines.length === 2) {
      for (const cl of creditLines) {
        const c = roundMoney(Number(cl.credit_amount ?? 0));
        if (Math.abs(c - advanceRounded) > MONEY_EPS) {
          paymentAccountId = cl.account_id;
          break;
        }
      }
    }
    if (!paymentAccountId)
      throw new Error('Could not infer payment (bank/cash) account from settlement journal.');
  } else if (cashRounded <= MONEY_EPS) {
    paymentAccountId = defaultBankAccountId;
  }

  return {
    expenseAccountId: expenseLine.account_id,
    paymentAccountId,
  };
}

/** Active prepaid settlements linked to vendor bills (excludes reversed journals). */
export async function listVendorBillSettlementsForBills(
  client: pg.PoolClient,
  tenantId: string,
  billIds: string[]
): Promise<VendorBillSettlementApiRow[]> {
  if (billIds.length === 0) return [];
  const uniq = [...new Set(billIds.map((x) => String(x ?? '').trim()).filter(Boolean))];
  if (uniq.length === 0) return [];

  const clr = await client.query<{
    bill_id: string;
    journal_entry_id: string;
    contractor_advance_id: string | null;
    amount: string;
    settlement_kind: string;
    entry_date: Date;
  }>(
    `SELECT
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
    [tenantId, uniq]
  );

  type Group = {
    billId: string;
    journalEntryId: string;
    entryDate: Date;
    cashAmount: number;
    adjustments: { advanceId: string; amount: number }[];
  };
  const groups = new Map<string, Group>();

  for (const row of clr.rows) {
    const key = `${row.journal_entry_id}\0${row.bill_id}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        billId: row.bill_id,
        journalEntryId: row.journal_entry_id,
        entryDate: row.entry_date,
        cashAmount: 0,
        adjustments: [],
      };
      groups.set(key, g);
    }
    const kind = String(row.settlement_kind ?? 'advance').trim();
    const amt = roundMoney(Number(row.amount));
    if (kind === 'cash') {
      g.cashAmount = roundMoney(g.cashAmount + amt);
    } else {
      const advId = row.contractor_advance_id;
      if (!advId) continue;
      g.adjustments.push({ advanceId: advId, amount: amt });
    }
  }

  const out: VendorBillSettlementApiRow[] = [];
  const groupList = [...groups.values()];
  if (groupList.length === 0) return out;

  const settlementBillIds = [...new Set(groupList.map((g) => g.billId))];
  const journalEntryIds = [...new Set(groupList.map((g) => g.journalEntryId))];

  const [billRows, lineRows, bankRow] = await Promise.all([
    client.query<{ id: string; contact_id: string | null; vendor_id: string | null }>(
      `SELECT id, contact_id, vendor_id FROM bills
       WHERE tenant_id = $1 AND deleted_at IS NULL AND id = ANY($2::text[])`,
      [tenantId, settlementBillIds]
    ),
    client.query<JournalLineRow & { journal_entry_id: string }>(
      `SELECT journal_entry_id, account_id, debit_amount::text, credit_amount::text, line_number
       FROM journal_lines WHERE journal_entry_id = ANY($1::text[])
       ORDER BY journal_entry_id, line_number ASC`,
      [journalEntryIds]
    ),
    client.query<{ id: string }>(
      `SELECT id FROM accounts
       WHERE tenant_id = $1 AND deleted_at IS NULL AND LOWER(TRIM(type)) = 'bank'
       ORDER BY name ASC LIMIT 1`,
      [tenantId]
    ),
  ]);

  const billsById = new Map(billRows.rows.map((row) => [row.id, row]));
  const linesByJournal = new Map<string, JournalLineRow[]>();
  for (const row of lineRows.rows) {
    const list = linesByJournal.get(row.journal_entry_id) ?? [];
    list.push({
      account_id: row.account_id,
      debit_amount: row.debit_amount,
      credit_amount: row.credit_amount,
      line_number: row.line_number,
    });
    linesByJournal.set(row.journal_entry_id, list);
  }
  const defaultBankAccountId = bankRow.rows[0]?.id ?? '';

  for (const g of groupList) {
    const advanceSum = roundMoney(g.adjustments.reduce((s, a) => s + a.amount, 0));
    const totalAmount = roundMoney(advanceSum + g.cashAmount);

    const bill = billsById.get(g.billId);
    if (!bill) continue;
    const supplierContactId = ((bill.contact_id || bill.vendor_id || '') as string).trim();
    if (!supplierContactId) continue;

    const lines = linesByJournal.get(g.journalEntryId) ?? [];
    const { expenseAccountId, paymentAccountId } = readJournalExpenseAndPaymentAccountsFromLines(
      lines,
      tenantId,
      g.cashAmount,
      advanceSum,
      defaultBankAccountId
    );

    const d = g.entryDate instanceof Date ? g.entryDate : new Date(g.entryDate as unknown as string);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const entryDate = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    out.push({
      billId: g.billId,
      journalEntryId: g.journalEntryId,
      entryDate,
      totalAmount,
      cashAmount: g.cashAmount,
      supplierContactId,
      paymentAccountId,
      expenseAccountId,
      adjustments: g.adjustments.map((a) => ({
        advanceId: a.advanceId,
        amount: roundMoney(a.amount),
      })),
    });
  }

  return out;
}

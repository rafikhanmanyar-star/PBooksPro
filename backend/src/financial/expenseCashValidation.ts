/**
 * Server-side check: project-scoped bank/cash must cover new expense (matches client accountingLedgerCore rules).
 * Bill payments are excluded: the paying account may be debited below project-scoped available cash (negative balance allowed).
 */
import type pg from 'pg';

const EPS = 0.01;

type AccRow = { id: string; type: string; name: string | null };

function isBankCash(acc: AccRow | undefined, clearingId: string | undefined, bankId: string): boolean {
  if (!acc || acc.id !== bankId) return false;
  if (clearingId && acc.id === clearingId) return false;
  return acc.type === 'Bank' || acc.type === 'Cash';
}

function cashDeltaForAccount(
  tx: {
    type: string;
    subtype: string | null;
    amount: string | number;
    account_id: string;
    from_account_id: string | null;
    to_account_id: string | null;
  },
  bankAccountId: string,
  accountsById: Map<string, AccRow>,
  clearingId: string | undefined
): number {
  const amt = typeof tx.amount === 'string' ? Number(tx.amount) : tx.amount;
  const acc = (id: string | null | undefined) => (id ? accountsById.get(id) : undefined);
  const t = tx.type;
  if (t === 'Income' || t === 'Expense') {
    if (!isBankCash(acc(tx.account_id), clearingId, bankAccountId)) return 0;
    return t === 'Income' ? amt : -amt;
  }
  if (t === 'Loan') {
    if (!isBankCash(acc(tx.account_id), clearingId, bankAccountId)) return 0;
    const st = tx.subtype ?? '';
    if (st === 'Receive Loan' || st === 'Collect Loan') return amt;
    if (st === 'Give Loan' || st === 'Repay Loan') return -amt;
    return 0;
  }
  if (t === 'Transfer') {
    let d = 0;
    if (tx.from_account_id === bankAccountId && isBankCash(acc(tx.from_account_id), clearingId, bankAccountId)) {
      d -= amt;
    }
    if (tx.to_account_id === bankAccountId && isBankCash(acc(tx.to_account_id), clearingId, bankAccountId)) {
      d += amt;
    }
    return d;
  }
  return 0;
}

export async function assertExpenseProjectCashAvailable(
  client: pg.PoolClient,
  tenantId: string,
  input: {
    type: string;
    amount: number;
    date: string;
    account_id: string;
    project_id: string | null | undefined;
    bill_id?: string | null;
    exclude_transaction_id?: string | null;
  }
): Promise<void> {
  if (input.bill_id && String(input.bill_id).trim()) return;
  if (input.type !== 'Expense' || !Number.isFinite(input.amount) || input.amount <= EPS) return;

  let projectId = input.project_id && String(input.project_id).trim() ? String(input.project_id).trim() : null;
  if (!projectId && input.bill_id) {
    const br = await client.query<{ project_id: string | null }>(
      `SELECT project_id FROM bills WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [input.bill_id, tenantId]
    );
    const pid = br.rows[0]?.project_id;
    if (pid && String(pid).trim()) projectId = String(pid).trim();
  }
  if (!projectId) return;

  const accRes = await client.query<AccRow>(
    `SELECT id, type, name FROM accounts WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const accountsById = new Map(accRes.rows.map((r) => [r.id, r]));
  const bankAcc = accountsById.get(input.account_id);
  if (!bankAcc || (bankAcc.type !== 'Bank' && bankAcc.type !== 'Cash')) return;
  if (bankAcc.name === 'Internal Clearing') return;

  const clr = await client.query<{ id: string }>(
    `SELECT id FROM accounts WHERE tenant_id = $1 AND name = 'Internal Clearing' AND deleted_at IS NULL LIMIT 1`,
    [tenantId]
  );
  const clearingId = clr.rows[0]?.id;

  const txRes = await client.query<{
    id: string;
    type: string;
    subtype: string | null;
    amount: string;
    date: Date;
    account_id: string;
    from_account_id: string | null;
    to_account_id: string | null;
    project_id: string | null;
  }>(
    `SELECT id, type, subtype, amount, date, account_id, from_account_id, to_account_id, project_id
     FROM transactions
     WHERE tenant_id = $1 AND deleted_at IS NULL AND project_id = $2 AND date <= $3::date`,
    [tenantId, projectId, input.date]
  );

  let balance = 0;
  for (const row of txRes.rows) {
    if (input.exclude_transaction_id && row.id === input.exclude_transaction_id) continue;
    balance += cashDeltaForAccount(row, input.account_id, accountsById, clearingId);
  }
  balance = Math.round(balance * 100) / 100;

  if (input.amount > balance + EPS) {
    const short = input.amount - balance;
    throw new Error(
      `Insufficient cash on account for this project (available ${balance.toFixed(2)}, need ${input.amount.toFixed(2)}, shortfall ${short.toFixed(2)}). Record funding or reduce the expense.`
    );
  }
}

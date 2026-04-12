/**
 * Server-side check: project-scoped bank/cash must cover new expense (matches client accountingLedgerCore rules).
 * Bill payments are excluded: the paying account may be debited below project-scoped available cash (negative balance allowed).
 */
import type pg from 'pg';

const EPS = 0.01;

type AccRow = { id: string; type: string; name: string | null };

/** Row shape used for project cash delta (matches transactions SELECT). */
export type ProjectCashTxRow = {
  id: string;
  type: string;
  subtype: string | null;
  amount: string;
  date: Date;
  account_id: string;
  from_account_id: string | null;
  to_account_id: string | null;
  project_id: string | null;
};

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

function rowDateOnlyMs(d: Date | string): number {
  const x = d instanceof Date ? d : new Date(String(d));
  return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
}

function inputDateMs(dateStr: string): number {
  const p = String(dateStr).slice(0, 10);
  const [y, m, day] = p.split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1).getTime();
}

/**
 * Reuse account map and avoid re-querying historical transactions for the same (project, date) during a bulk payslip pay.
 * New transactions in this batch are appended in-memory so we do not re-scan the full ledger each time.
 */
export class ExpenseCashValidationBatchContext {
  private accountsById: Map<string, AccRow> | null = null;
  private clearingId: string | undefined;
  private readonly historicalByProjectDate = new Map<string, ProjectCashTxRow[]>();
  private readonly localRows: ProjectCashTxRow[] = [];

  constructor(
    private readonly client: pg.PoolClient,
    private readonly tenantId: string
  ) {}

  recordInsertedTransaction(row: ProjectCashTxRow): void {
    this.localRows.push(row);
  }

  private async ensureAccounts(): Promise<{ accountsById: Map<string, AccRow>; clearingId: string | undefined }> {
    if (this.accountsById) {
      return { accountsById: this.accountsById, clearingId: this.clearingId };
    }
    const accRes = await this.client.query<AccRow>(
      `SELECT id, type, name FROM accounts WHERE tenant_id = $1 AND deleted_at IS NULL`,
      [this.tenantId]
    );
    this.accountsById = new Map(accRes.rows.map((r) => [r.id, r]));
    const clr = await this.client.query<{ id: string }>(
      `SELECT id FROM accounts WHERE tenant_id = $1 AND name = 'Internal Clearing' AND deleted_at IS NULL LIMIT 1`,
      [this.tenantId]
    );
    this.clearingId = clr.rows[0]?.id;
    return { accountsById: this.accountsById, clearingId: this.clearingId };
  }

  private key(projectId: string, dateStr: string): string {
    return `${projectId}\0${String(dateStr).slice(0, 10)}`;
  }

  private async getHistoricalRows(projectId: string, dateStr: string): Promise<ProjectCashTxRow[]> {
    const k = this.key(projectId, dateStr);
    let rows = this.historicalByProjectDate.get(k);
    if (!rows) {
      const txRes = await this.client.query<ProjectCashTxRow>(
        `SELECT id, type, subtype, amount, date, account_id, from_account_id, to_account_id, project_id
         FROM transactions
         WHERE tenant_id = $1 AND deleted_at IS NULL AND project_id = $2 AND date <= $3::date`,
        [this.tenantId, projectId, dateStr]
      );
      rows = txRes.rows;
      this.historicalByProjectDate.set(k, rows);
    }
    return rows;
  }

  async assertExpense(input: {
    type: string;
    amount: number;
    date: string;
    account_id: string;
    project_id: string | null | undefined;
    bill_id?: string | null;
    exclude_transaction_id?: string | null;
  }): Promise<void> {
    await runExpenseProjectCashAssertion(this.client, this.tenantId, input, {
      accountsAndClearing: () => this.ensureAccounts(),
      getRows: async (projectId, dateStr) => {
        const hist = await this.getHistoricalRows(projectId, dateStr);
        const cutoff = inputDateMs(dateStr);
        const extra = this.localRows.filter((r) => {
          if (!r.project_id || String(r.project_id) !== projectId) return false;
          return rowDateOnlyMs(r.date) <= cutoff;
        });
        return [...hist, ...extra];
      },
    });
  }
}

type AssertionDeps = {
  accountsAndClearing: () => Promise<{ accountsById: Map<string, AccRow>; clearingId: string | undefined }>;
  getRows: (projectId: string, dateStr: string) => Promise<ProjectCashTxRow[]>;
};

async function runExpenseProjectCashAssertion(
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
  },
  deps: AssertionDeps
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

  const { accountsById, clearingId } = await deps.accountsAndClearing();
  const bankAcc = accountsById.get(input.account_id);
  if (!bankAcc || (bankAcc.type !== 'Bank' && bankAcc.type !== 'Cash')) return;
  if (bankAcc.name === 'Internal Clearing') return;

  const txRows = await deps.getRows(projectId, input.date);

  let balance = 0;
  for (const row of txRows) {
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
  },
  batchCtx?: ExpenseCashValidationBatchContext | null
): Promise<void> {
  if (batchCtx) {
    await batchCtx.assertExpense(input);
    return;
  }

  await runExpenseProjectCashAssertion(client, tenantId, input, {
    accountsAndClearing: async () => {
      const accRes = await client.query<AccRow>(
        `SELECT id, type, name FROM accounts WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId]
      );
      const accountsById = new Map(accRes.rows.map((r) => [r.id, r]));
      const clr = await client.query<{ id: string }>(
        `SELECT id FROM accounts WHERE tenant_id = $1 AND name = 'Internal Clearing' AND deleted_at IS NULL LIMIT 1`,
        [tenantId]
      );
      return { accountsById, clearingId: clr.rows[0]?.id };
    },
    getRows: async (projectId, dateStr) => {
      const txRes = await client.query<ProjectCashTxRow>(
        `SELECT id, type, subtype, amount, date, account_id, from_account_id, to_account_id, project_id
         FROM transactions
         WHERE tenant_id = $1 AND deleted_at IS NULL AND project_id = $2 AND date <= $3::date`,
        [tenantId, projectId, dateStr]
      );
      return txRes.rows;
    },
  });
}

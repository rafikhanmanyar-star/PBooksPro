import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertExpenseProjectCashAvailable } from './expenseCashValidation.js';

type QueryCall = { sql: string; params: unknown[] };

class FakeCashValidationClient {
  readonly calls: QueryCall[] = [];

  async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.calls.push({ sql, params });

    if (sql.includes('FROM accounts') && sql.includes('id, type, name')) {
      return {
        rows: [
          { id: 'bank-1', type: 'Bank', name: 'Main Bank' },
        ],
      };
    }

    if (sql.includes("name = 'Internal Clearing'")) {
      return { rows: [] };
    }

    if (sql.includes('FROM transactions')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  }
}

describe('assertExpenseProjectCashAvailable', () => {
  it('does not let a generic transaction skip project cash validation by sending payslip_id', async () => {
    const client = new FakeCashValidationClient();

    await assert.rejects(
      () =>
        assertExpenseProjectCashAvailable(client as never, 'tenant-1', {
          type: 'Expense',
          amount: 100,
          date: '2026-05-18',
          account_id: 'bank-1',
          project_id: 'project-1',
          payslip_id: 'payslip-1',
        }),
      /Insufficient cash on account for this project/
    );
  });
});

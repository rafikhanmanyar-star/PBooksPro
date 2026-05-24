import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { recalculateBillPaymentAggregates } from './billsService.js';

describe('recalculateBillPaymentAggregates', () => {
  it('does not include ordinary income rows linked to a bill in paid_amount', async () => {
    const queries: string[] = [];
    const client = {
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes('SELECT amount, status FROM bills')) {
          return { rows: [{ amount: '1000', status: 'Unpaid' }] };
        }
        if (sql.includes('FROM transactions')) {
          return { rows: [{ sum: '0' }] };
        }
        if (sql.includes('FROM vendor_bill_advance_clearings')) {
          return { rows: [{ sum: '0' }] };
        }
        return { rows: [] };
      },
    };

    await recalculateBillPaymentAggregates(client as never, 'tenant-1', 'bill-1');

    const transactionSumSql = queries.find((q) => q.includes('FROM transactions'));
    assert.ok(transactionSumSql, 'transaction aggregate query should run');
    assert.match(transactionSumSql, /LOWER\(TRIM\(type\)\)\s*=\s*'expense'/i);
    assert.match(transactionSumSql, /bill payment.+from security deposit/i);
    assert.doesNotMatch(transactionSumSql, /IN\s*\(\s*'expense'\s*,\s*'income'\s*\)/i);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_BALANCE_CASE,
  ACCOUNT_BALANCE_CASE_BY_ID,
  JOURNAL_SIGNED_BALANCE_SUBQUERY,
} from './accountBalanceSql.js';

describe('accountBalanceSql', () => {
  it('uses journal_lines as sole balance source (ledger unification)', () => {
    assert.match(ACCOUNT_BALANCE_CASE, /journal_lines/);
    assert.doesNotMatch(ACCOUNT_BALANCE_CASE, /FROM transactions/i);
  });

  it('does not apply shared-chart opening_balance to system account balance (tenant isolation)', () => {
    const systemBranch = ACCOUNT_BALANCE_CASE.split('ELSE')[0] ?? '';
    assert.doesNotMatch(systemBranch, /opening_balance/);
  });

  it('uses tenant opening_balance only for tenant-owned accounts', () => {
    assert.match(ACCOUNT_BALANCE_CASE, /ELSE COALESCE\(a\.opening_balance, 0\)/);
  });

  it('uses debit-normal formula for bank/cash/asset/expense in journal subquery', () => {
    assert.match(JOURNAL_SIGNED_BALANCE_SUBQUERY, /bank', 'cash'/);
    assert.match(JOURNAL_SIGNED_BALANCE_SUBQUERY, /debit_amount - jl\.credit_amount/);
  });

  it('get-by-id variant uses tenant param $2 for journal lookup', () => {
    assert.match(ACCOUNT_BALANCE_CASE_BY_ID, /je\.tenant_id = \$2/);
    assert.doesNotMatch(ACCOUNT_BALANCE_CASE_BY_ID, /FROM transactions/i);
  });
});

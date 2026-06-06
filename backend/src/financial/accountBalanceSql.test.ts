import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_BALANCE_CASE,
  ACCOUNT_BALANCE_CASE_BY_ID,
  JOURNAL_SIGNED_BALANCE_SUBQUERY,
  TRANSACTION_SIGNED_BALANCE_SUBQUERY,
} from './accountBalanceSql.js';

describe('accountBalanceSql', () => {
  it('prefers journal_lines when journal activity exists for the account', () => {
    assert.match(ACCOUNT_BALANCE_CASE, /WHEN EXISTS \(\s*SELECT 1 FROM journal_lines/i);
    assert.match(ACCOUNT_BALANCE_CASE, /THEN \(\s*SELECT COALESCE\(SUM/i);
    assert.match(ACCOUNT_BALANCE_CASE, /ELSE \(\s*SELECT COALESCE\(SUM/i);
  });

  it('uses debit-normal formula for bank/cash/asset/expense in journal subquery', () => {
    assert.match(JOURNAL_SIGNED_BALANCE_SUBQUERY, /bank', 'cash'/);
    assert.match(JOURNAL_SIGNED_BALANCE_SUBQUERY, /debit_amount - jl\.credit_amount/);
  });

  it('retains transaction fallback for legacy rows', () => {
    assert.match(TRANSACTION_SIGNED_BALANCE_SUBQUERY, /WHEN t\.type = 'Income'/);
    assert.match(TRANSACTION_SIGNED_BALANCE_SUBQUERY, /WHEN t\.type = 'Transfer'/);
  });

  it('get-by-id variant uses tenant param $2 for journal lookup', () => {
    assert.match(ACCOUNT_BALANCE_CASE_BY_ID, /je\.tenant_id = \$2/);
  });
});

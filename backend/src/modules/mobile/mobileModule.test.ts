import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterApprovalsForUser,
  isPendingInstallmentPlan,
  marketingPlanVisibleToMobileUser,
  normalizeStatus,
  sortApprovalsByDate,
  type MobileApprovalItem,
} from './mobileApprovalsHelpers.js';
import { parseCreateUnpostedTransaction, canReviewUnpostedTransactions, parseUnpostedListFilters } from './services/unpostedTransactionService.js';

describe('mobileApprovalsHelpers', () => {
  it('normalizeStatus lowercases and collapses spaces', () => {
    assert.equal(normalizeStatus('Pending Approval'), 'pending approval');
  });

  it('isPendingInstallmentPlan matches approver user', () => {
    assert.equal(isPendingInstallmentPlan('Pending Approval', 'u1', 'u1'), true);
    assert.equal(isPendingInstallmentPlan('Pending Approval', 'u2', 'u1'), false);
    assert.equal(isPendingInstallmentPlan('Approved', 'u1', 'u1'), false);
  });

  it('sortApprovalsByDate orders newest first', () => {
    const items: MobileApprovalItem[] = [
      { id: 'a', type: 'pev', title: 'A', status: 'submitted', canApprove: true, requestedAt: '2026-01-01' },
      { id: 'b', type: 'pev', title: 'B', status: 'submitted', canApprove: true, requestedAt: '2026-06-01' },
    ];
    const sorted = sortApprovalsByDate(items);
    assert.equal(sorted[0]?.id, 'b');
  });

  it('filterApprovalsForUser keeps approvable and own requests', () => {
    const items: MobileApprovalItem[] = [
      { id: '1', type: 'pev', title: 'X', status: 'submitted', canApprove: true, requestedById: 'other' },
      { id: '2', type: 'pev', title: 'Y', status: 'submitted', canApprove: false, requestedById: 'me' },
      { id: '3', type: 'pev', title: 'Z', status: 'submitted', canApprove: false, requestedById: 'other' },
    ];
    const filtered = filterApprovalsForUser(items, 'me');
    assert.deepEqual(filtered.map((i) => i.id), ['1', '2']);
  });
});

describe('parseCreateUnpostedTransaction', () => {
  it('parses minimal valid payload', () => {
    const input = parseCreateUnpostedTransaction({
      amount: 1500,
      transactionType: 'fuel_expense',
      partyName: 'Station A',
    });
    assert.equal(input.amount, 1500);
    assert.equal(input.transactionType, 'fuel_expense');
    assert.equal(input.partyName, 'Station A');
  });

  it('rejects invalid transaction type', () => {
    assert.throws(() =>
      parseCreateUnpostedTransaction({ amount: 100, transactionType: 'invalid_type' })
    );
  });
});

describe('canReviewUnpostedTransactions', () => {
  it('allows accountant and admin roles', () => {
    assert.equal(canReviewUnpostedTransactions('Accountant'), true);
    assert.equal(canReviewUnpostedTransactions('Admin'), true);
    assert.equal(canReviewUnpostedTransactions('Accounts'), true);
  });

  it('denies read-only roles', () => {
    assert.equal(canReviewUnpostedTransactions('Read Only User'), false);
    assert.equal(canReviewUnpostedTransactions('viewer'), false);
  });
});

describe('marketingPlanVisibleToMobileUser', () => {
  it('shows pending plan to assigned approver', () => {
    assert.equal(
      marketingPlanVisibleToMobileUser(
        {
          status: 'Pending Approval',
          approval_requested_to: 'u1',
          approval_reviewed_by: null,
          approval_requested_at: new Date(),
        },
        'u1',
        false
      ),
      true
    );
  });

  it('shows approved history to reviewer', () => {
    assert.equal(
      marketingPlanVisibleToMobileUser(
        {
          status: 'Approved',
          approval_requested_to: 'u1',
          approval_reviewed_by: 'u2',
          approval_requested_at: new Date(),
        },
        'u2',
        false
      ),
      true
    );
  });

  it('hides approved plan without approval workflow', () => {
    assert.equal(
      marketingPlanVisibleToMobileUser(
        {
          status: 'Approved',
          approval_requested_to: 'u1',
          approval_reviewed_by: 'u2',
          approval_requested_at: null,
        },
        'u2',
        false
      ),
      false
    );
  });
});

describe('parseUnpostedListFilters', () => {
  it('parses valid date and user filters', () => {
    assert.deepEqual(
      parseUnpostedListFilters({
        createdBy: 'user_abc',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
      }),
      { createdBy: 'user_abc', dateFrom: '2026-06-01', dateTo: '2026-06-30' }
    );
  });

  it('ignores invalid dates', () => {
    assert.deepEqual(parseUnpostedListFilters({ dateFrom: '06/01/2026' }), {
      createdBy: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });
});

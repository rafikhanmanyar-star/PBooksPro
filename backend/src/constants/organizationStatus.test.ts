import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterLoginEligibleAccounts,
  organizationLoginBlockError,
} from '../services/organization/organizationApprovalService.js';
import type { MatchedUserAccount } from '../services/auth/userTenantService.js';

function account(status: string, rejectionReason: string | null = null): MatchedUserAccount {
  return {
    userId: 'u1',
    tenantId: 't1',
    role: 'Admin',
    username: 'admin',
    name: 'Admin',
    passwordHash: 'hash',
    tenantName: 'Acme',
    displayTimezone: null,
    interfaceMode: 'auto',
    email: 'a@example.com',
    lastTenantId: null,
    organizationStatus: status,
    rejectionReason,
  };
}

test('organizationLoginBlockError returns pending message for blocked tenant', () => {
  const prev = process.env.ORG_APPROVAL_REQUIRED;
  process.env.ORG_APPROVAL_REQUIRED = 'true';
  try {
    const err = organizationLoginBlockError([account('PENDING')]);
    assert.ok(err);
    assert.equal(err.code, 'ORG_PENDING_APPROVAL');
  } finally {
    if (prev === undefined) delete process.env.ORG_APPROVAL_REQUIRED;
    else process.env.ORG_APPROVAL_REQUIRED = prev;
  }
});

test('filterLoginEligibleAccounts keeps only ACTIVE when approval enabled', () => {
  const prev = process.env.ORG_APPROVAL_REQUIRED;
  process.env.ORG_APPROVAL_REQUIRED = 'true';
  try {
    const eligible = filterLoginEligibleAccounts([
      account('PENDING'),
      account('ACTIVE'),
      account('SUSPENDED'),
    ]);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0]?.organizationStatus, 'ACTIVE');
  } finally {
    if (prev === undefined) delete process.env.ORG_APPROVAL_REQUIRED;
    else process.env.ORG_APPROVAL_REQUIRED = prev;
  }
});

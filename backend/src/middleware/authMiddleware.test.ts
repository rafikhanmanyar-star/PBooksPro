import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isTokenRoleStale } from './authMiddleware.js';

describe('authMiddleware role revalidation', () => {
  it('detects stale token when role changed in database', () => {
    assert.equal(isTokenRoleStale('Admin', 'Accounts'), true);
    assert.equal(isTokenRoleStale('Manager', 'manager'), false);
    assert.equal(isTokenRoleStale('Project Manager', 'project manager'), false);
  });

  it('normalizes spaces and case before comparing', () => {
    assert.equal(isTokenRoleStale('Super Admin', 'super_admin'), false);
    assert.equal(isTokenRoleStale('Sales User', 'Project Manager'), true);
  });
});

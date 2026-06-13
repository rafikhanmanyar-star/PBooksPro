import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLoginUsername,
  normalizeUserEmail,
  UserIdentityConflictError,
} from './userIdentityService.js';

describe('userIdentityService', () => {
  it('normalizeUserEmail trims and lowercases', () => {
    assert.equal(normalizeUserEmail('  Admin@Example.COM '), 'admin@example.com');
    assert.equal(normalizeUserEmail(''), null);
    assert.equal(normalizeUserEmail(null), null);
  });

  it('normalizeLoginUsername trims and lowercases', () => {
    assert.equal(normalizeLoginUsername('  Admin '), 'admin');
    assert.equal(normalizeLoginUsername(''), null);
  });

  it('UserIdentityConflictError uses email-specific message', () => {
    const err = new UserIdentityConflictError([
      {
        field: 'email',
        value: 'a@b.com',
        existingUserId: 'u1',
        existingTenantId: 'org-a',
        existingTenantName: 'Org A',
      },
    ]);
    assert.equal(err.code, 'IDENTITY_CONFLICT');
    assert.match(err.message, /email address is already registered/i);
  });

  it('UserIdentityConflictError uses username-specific message', () => {
    const err = new UserIdentityConflictError([
      {
        field: 'username',
        value: 'admin',
        existingUserId: 'u1',
        existingTenantId: 'org-a',
        existingTenantName: 'Org A',
      },
    ]);
    assert.match(err.message, /username is already in use in this organization/i);
  });

  it('UserIdentityConflictError uses company email message', () => {
    const err = new UserIdentityConflictError([
      {
        field: 'organizationEmail',
        value: 'admin@acme.com',
        existingTenantId: 'org-a',
        existingTenantName: 'Org A',
      },
    ]);
    assert.match(err.message, /company email is already registered/i);
  });
});

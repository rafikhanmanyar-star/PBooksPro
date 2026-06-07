import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivacyRequestType,
  isPrivacyRequestStatus,
  mapExportScopeToRequestType,
  privacyRequestTypeLabel,
  privacyRequestStatusLabel,
} from '../../constants/privacyRequestTypes.js';
import { canUserAccessRequest } from './privacyRequestService.js';
import { anonymizedName, anonymizedUsername } from './privacyAnonymizationService.js';
import type { PrivacyRequestRow } from './privacyRequestService.js';

describe('privacyRequestTypes', () => {
  it('validates request types', () => {
    assert.equal(isPrivacyRequestType('deletion'), true);
    assert.equal(isPrivacyRequestType('correction'), true);
    assert.equal(isPrivacyRequestType('invalid'), false);
  });

  it('validates request statuses', () => {
    assert.equal(isPrivacyRequestStatus('pending'), true);
    assert.equal(isPrivacyRequestStatus('completed'), true);
    assert.equal(isPrivacyRequestStatus('open'), false);
  });

  it('maps export scopes to request types', () => {
    assert.equal(mapExportScopeToRequestType('data'), 'data_export');
    assert.equal(mapExportScopeToRequestType('user'), 'user_data_export');
    assert.equal(mapExportScopeToRequestType('tenant'), 'tenant_data_export');
  });

  it('provides human-readable labels', () => {
    assert.equal(privacyRequestTypeLabel('deletion'), 'Deletion request');
    assert.equal(privacyRequestStatusLabel('pending'), 'Pending');
  });
});

describe('canUserAccessRequest', () => {
  const base: PrivacyRequestRow = {
    id: 'r1',
    tenant_id: 't1',
    request_type: 'deletion',
    status: 'pending',
    requested_at: new Date().toISOString(),
    completed_at: null,
    requested_by_user_id: 'u1',
    metadata: {},
  };

  it('allows request owner access', () => {
    assert.equal(canUserAccessRequest(base, 'u1', false), true);
  });

  it('denies other users', () => {
    assert.equal(canUserAccessRequest(base, 'u2', false), false);
  });

  it('allows admin access to any request', () => {
    assert.equal(canUserAccessRequest(base, 'u2', true), true);
  });
});

describe('anonymization helpers', () => {
  it('generates stable anonymized identifiers', () => {
    const userId = 'abc-def-123-456';
    assert.match(anonymizedUsername(userId), /^deleted_/);
    assert.match(anonymizedName(userId), /Deleted User/);
  });
});

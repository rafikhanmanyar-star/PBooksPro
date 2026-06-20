/**
 * A5.1.3.1 — effective-context endpoint policy tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEffectiveAccessContext } from '../../../auth/effectiveAccessContext.js';
import {
  serializeEffectiveContext,
  validateEffectiveContextAccess,
} from './effectiveContextPolicy.js';

describe('effectiveContextPolicy — current user only', () => {
  const ctx = buildEffectiveAccessContext({
    userId: 'u1',
    tenantId: 't1',
    permissions: ['roles.view'],
    assignments: [{ roleId: 'r1', slug: 'read_only', roleVersion: 1, permissionKeys: ['roles.view'], status: 'active' }],
    scopes: [{ dimension: 'project', mode: 'all' }],
    accessVersion: 2,
    roleVersionHash: 'hash',
  });

  it('requires authentication (tenantId + userId)', () => {
    const err = validateEffectiveContextAccess({
      engineEnabled: true,
      tenantId: undefined,
      userId: undefined,
      effectiveAccess: ctx,
    });
    assert.equal(err?.status, 401);
    assert.equal(err?.code, 'UNAUTHORIZED');
  });

  it('rejects userId query parameter (no admin lookup)', () => {
    const err = validateEffectiveContextAccess({
      engineEnabled: true,
      tenantId: 't1',
      userId: 'u1',
      hasUserIdQueryParam: true,
      effectiveAccess: ctx,
    });
    assert.equal(err?.status, 400);
    assert.equal(err?.code, 'INVALID_QUERY');
  });

  it('rejects when effective context user does not match JWT user', () => {
    const err = validateEffectiveContextAccess({
      engineEnabled: true,
      tenantId: 't1',
      userId: 'u2',
      effectiveAccess: ctx,
    });
    assert.equal(err?.status, 403);
    assert.equal(err?.code, 'FORBIDDEN');
  });

  it('returns null when engine on and context matches current user', () => {
    const err = validateEffectiveContextAccess({
      engineEnabled: true,
      tenantId: 't1',
      userId: 'u1',
      effectiveAccess: ctx,
    });
    assert.equal(err, null);
  });

  it('returns 503 when engine disabled', () => {
    const err = validateEffectiveContextAccess({
      engineEnabled: false,
      tenantId: 't1',
      userId: 'u1',
      effectiveAccess: ctx,
    });
    assert.equal(err?.status, 503);
    assert.equal(err?.code, 'FEATURE_DISABLED');
  });

  it('serializeEffectiveContext includes breakGlassExpiresAt', () => {
    const withBg = buildEffectiveAccessContext({
      userId: 'u1',
      tenantId: 't1',
      permissions: [],
      assignments: [],
      accessVersion: 1,
      roleVersionHash: 'h',
      breakGlassSessionId: 'bgs',
      breakGlassExpiresAt: '2026-06-19T13:00:00.000Z',
    });
    const body = serializeEffectiveContext(withBg);
    assert.equal(body.breakGlassExpiresAt, '2026-06-19T13:00:00.000Z');
    assert.equal(body.breakGlassSessionId, 'bgs');
  });
});

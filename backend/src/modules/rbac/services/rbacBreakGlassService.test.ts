/**
 * A5.1.2 C2 — break-glass service unit tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampBreakGlassDurationMinutes,
  BREAK_GLASS_DEFAULT_MINUTES,
  BREAK_GLASS_MAX_MINUTES,
  BreakGlassError,
} from './rbacBreakGlassService.js';
import { computeBreakGlassAccessHash } from './rbacRoleVersionService.js';
import { signBreakGlassAccessToken, verifyAccessToken } from '../../../auth/jwt.js';

describe('rbacBreakGlassService', () => {
  it('defaults duration to 15 minutes', () => {
    assert.equal(clampBreakGlassDurationMinutes(), BREAK_GLASS_DEFAULT_MINUTES);
  });

  it('clamps duration to max 60 minutes', () => {
    assert.equal(clampBreakGlassDurationMinutes(120), BREAK_GLASS_MAX_MINUTES);
  });

  it('clamps duration minimum to 1 minute', () => {
    assert.equal(clampBreakGlassDurationMinutes(0), 1);
  });

  it('BreakGlassError carries code', () => {
    const err = new BreakGlassError('MFA_INVALID', 'bad code');
    assert.equal(err.code, 'MFA_INVALID');
  });
});

describe('break-glass JWT', () => {
  it('issues and verifies break-glass access token', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-min-16-chars!!';
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const sessionId = 'bgs_test123';
    const hash = computeBreakGlassAccessHash({
      tenantId: 't1',
      userId: 'u1',
      sessionId,
      expiresAt: expiresAt.toISOString(),
    });
    const token = signBreakGlassAccessToken({
      userId: 'u1',
      tenantId: 't1',
      role: 'super_admin',
      sessionId,
      expiresAt,
      accessHash: hash,
    });
    const verified = verifyAccessToken(token);
    assert.equal(verified.sessionType, 'break_glass');
    assert.equal(verified.breakGlassSessionId, sessionId);
    assert.equal(verified.sub, 'u1');
  });
});

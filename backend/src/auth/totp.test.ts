import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateTotp, generateTotpSecret, verifyTotp, normalizeRecoveryCode } from './totp.js';
import { enterpriseRoleRequiresMfa, userRoleRequiresMfa } from './mfaPolicy.js';

describe('TOTP', () => {
  it('generates and verifies a 6-digit code', () => {
    process.env.JWT_SECRET = 'test-jwt-secret-min-16-chars';
    const secret = generateTotpSecret();
    assert.ok(secret.length >= 16);
    const code = generateTotp(secret);
    assert.match(code, /^\d{6}$/);
    assert.equal(verifyTotp(secret, code), true);
    assert.equal(verifyTotp(secret, '000000'), false);
  });

  it('normalizes recovery codes', () => {
    assert.equal(normalizeRecoveryCode('abcd-efgh-ijkl'), 'ABCD-EFGH-IJKL');
    assert.equal(normalizeRecoveryCode(' abcd efgh ijkl '), 'ABCDEFGHIJKL');
  });
});

describe('MFA policy', () => {
  it('requires MFA for super admin, company admin, and accountant', () => {
    assert.equal(enterpriseRoleRequiresMfa('super_admin'), true);
    assert.equal(enterpriseRoleRequiresMfa('company_admin'), true);
    assert.equal(enterpriseRoleRequiresMfa('accountant'), true);
    assert.equal(enterpriseRoleRequiresMfa('read_only'), false);
  });

  it('maps legacy role names', () => {
    assert.equal(userRoleRequiresMfa('Admin'), true);
    assert.equal(userRoleRequiresMfa('Accounts'), true);
    assert.equal(userRoleRequiresMfa('Viewer'), false);
  });
});

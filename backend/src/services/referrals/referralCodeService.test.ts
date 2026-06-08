import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReferralCode, hashSignupIp } from './referralCodeService.js';

describe('referralCodeService', () => {
  it('buildReferralCode includes tenant prefix', () => {
    const code = buildReferralCode('acme-corp');
    assert.match(code, /^ACME/);
    assert.ok(code.includes('-'));
  });

  it('hashSignupIp returns stable hash', () => {
    const a = hashSignupIp('203.0.113.1');
    const b = hashSignupIp('203.0.113.1');
    assert.equal(a, b);
    assert.equal(a?.length, 32);
  });

  it('hashSignupIp returns null for empty ip', () => {
    assert.equal(hashSignupIp(undefined), null);
  });
});

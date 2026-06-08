import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signUnsubscribe, verifyUnsubscribeSignature } from './emailAutomationUnsubscribeService.js';

describe('emailAutomationUnsubscribeService', () => {
  it('signUnsubscribe is stable for same inputs', () => {
    const a = signUnsubscribe('User@Example.com', 'tenant-1', 'lifecycle');
    const b = signUnsubscribe('user@example.com', 'tenant-1', 'lifecycle');
    assert.equal(a, b);
    assert.equal(a.length, 40);
  });

  it('verifyUnsubscribeSignature accepts valid sig', () => {
    const sig = signUnsubscribe('a@b.com', null, 'announcements');
    assert.equal(verifyUnsubscribeSignature('a@b.com', null, 'announcements', sig), true);
  });

  it('verifyUnsubscribeSignature rejects invalid sig', () => {
    const sig = signUnsubscribe('a@b.com', null, 'announcements');
    assert.equal(verifyUnsubscribeSignature('a@b.com', null, 'announcements', sig + 'x'), false);
  });
});

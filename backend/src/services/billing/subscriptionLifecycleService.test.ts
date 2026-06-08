import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPastDueGraceDays,
  gracePeriodEndsAt,
  isWithinPastDueGrace,
} from './subscriptionLifecycleService.js';

describe('subscriptionLifecycleService grace period', () => {
  const original = process.env.PAST_DUE_GRACE_DAYS;

  afterEach(() => {
    if (original === undefined) delete process.env.PAST_DUE_GRACE_DAYS;
    else process.env.PAST_DUE_GRACE_DAYS = original;
  });

  it('defaults grace period to 7 days', () => {
    delete process.env.PAST_DUE_GRACE_DAYS;
    assert.equal(getPastDueGraceDays(), 7);
  });

  it('reads PAST_DUE_GRACE_DAYS from env', () => {
    process.env.PAST_DUE_GRACE_DAYS = '14';
    assert.equal(getPastDueGraceDays(), 14);
  });

  it('computes grace end date from past_due_at', () => {
    process.env.PAST_DUE_GRACE_DAYS = '7';
    const pastDueAt = '2026-06-01T12:00:00.000Z';
    const endsAt = gracePeriodEndsAt(pastDueAt);
    assert.equal(endsAt, '2026-06-08T12:00:00.000Z');
  });

  it('isWithinPastDueGrace returns true before grace ends', () => {
    process.env.PAST_DUE_GRACE_DAYS = '7';
    const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
    assert.equal(isWithinPastDueGrace(recent), true);
  });

  it('isWithinPastDueGrace returns false after grace ends', () => {
    process.env.PAST_DUE_GRACE_DAYS = '3';
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    assert.equal(isWithinPastDueGrace(old), false);
  });

  it('returns false when past_due_at is missing', () => {
    assert.equal(isWithinPastDueGrace(null), false);
    assert.equal(isWithinPastDueGrace(undefined), false);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPgDateToYyyyMmDd, parseApiDateToYyyyMmDd } from './dateOnly.js';

describe('parseApiDateToYyyyMmDd', () => {
  it('passes through plain YYYY-MM-DD (preferred client format)', () => {
    assert.strictEqual(parseApiDateToYyyyMmDd('2026-04-07'), '2026-04-07');
  });

  it('accepts ISO with same calendar prefix as first 10 chars', () => {
    assert.strictEqual(parseApiDateToYyyyMmDd('2026-04-07T12:00:00.000Z'), '2026-04-07');
  });
});

describe('formatPgDateToYyyyMmDd', () => {
  it('formats pg-style UTC midnight DATE as that calendar day', () => {
    const d = new Date(Date.UTC(2026, 3, 7));
    assert.strictEqual(formatPgDateToYyyyMmDd(d), '2026-04-07');
  });
});

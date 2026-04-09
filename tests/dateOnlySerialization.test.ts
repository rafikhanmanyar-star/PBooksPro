/**
 * Ensures calendar date fields never persist as UTC ISO midnight (off-by-one in non-UTC zones).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectToDbFormat } from '../services/database/columnMapper';
import { formatDate, toLocalDateString, toDateOnly, tryParseSqlUtcMidnightIsoToYyyyMmDd } from '../utils/dateUtils';
import { stringifyApiJsonBody } from '../utils/apiJsonSerialize';

test('objectToDbFormat: issueDate Date → local YYYY-MM-DD, not UTC ISO', () => {
  const localApr7 = new Date(2026, 3, 7);
  const out = objectToDbFormat({
    issueDate: localApr7,
    createdAt: localApr7,
  }) as Record<string, string>;
  assert.strictEqual(out.issue_date, toLocalDateString(localApr7));
  assert.strictEqual(out.issue_date, '2026-04-07');
  assert.match(out.created_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('API JSON: issueDate serializes to YYYY-MM-DD', () => {
  const localApr7 = new Date(2026, 3, 7);
  const json = stringifyApiJsonBody({ issueDate: localApr7, createdAt: localApr7 });
  const parsed = JSON.parse(json) as { issueDate: string; createdAt: string };
  assert.strictEqual(parsed.issueDate, '2026-04-07');
  assert.ok(parsed.createdAt.includes('T'));
});

test('toDateOnly helper', () => {
  assert.strictEqual(toDateOnly(new Date(2026, 3, 7)), '2026-04-07');
  assert.strictEqual(toDateOnly('2026-04-07'), '2026-04-07');
});

test('PostgreSQL DATE as UTC midnight Z: parse + display = civil date (not previous day in UTC− zones)', () => {
  const iso = '2026-04-07T00:00:00.000Z';
  assert.strictEqual(tryParseSqlUtcMidnightIsoToYyyyMmDd(iso), '2026-04-07');
  assert.strictEqual(formatDate(iso), '07-04-2026');
});

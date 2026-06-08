import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextRun,
  retryDelayMs,
  MAX_BACKUP_ATTEMPTS,
  RETRY_DELAYS_MS,
} from './backupSchedulerService.js';

function localDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe('backupSchedulerService computeNextRun', () => {
  it('daily schedules next day at 02:00 when past today slot', () => {
    const from = localDate(2026, 6, 7, 3, 0);
    const next = computeNextRun('daily', from);
    assert.equal(next.getFullYear(), 2026);
    assert.equal(next.getMonth(), 5);
    assert.equal(next.getDate(), 8);
    assert.equal(next.getHours(), 2);
    assert.equal(next.getMinutes(), 0);
  });

  it('daily schedules same day at 02:00 when before slot', () => {
    const from = localDate(2026, 6, 7, 1, 30);
    const next = computeNextRun('daily', from);
    assert.equal(next.getDate(), 7);
    assert.equal(next.getHours(), 2);
  });

  it('weekly schedules upcoming Sunday at 01:00', () => {
    const from = localDate(2026, 6, 4, 10, 0);
    const next = computeNextRun('weekly', from);
    assert.equal(next.getDay(), 0);
    assert.equal(next.getDate(), 7);
    assert.equal(next.getHours(), 1);
  });

  it('weekly rolls to next Sunday when Sunday slot already passed', () => {
    const from = localDate(2026, 6, 7, 2, 0);
    const next = computeNextRun('weekly', from);
    assert.equal(next.getDay(), 0);
    assert.equal(next.getDate(), 14);
    assert.equal(next.getHours(), 1);
  });

  it('monthly schedules first of next month at 01:00 when past current slot', () => {
    const from = localDate(2026, 6, 1, 2, 0);
    const next = computeNextRun('monthly', from);
    assert.equal(next.getMonth(), 6);
    assert.equal(next.getDate(), 1);
    assert.equal(next.getHours(), 1);
  });

  it('monthly schedules first of current month when before slot on the 1st', () => {
    const from = localDate(2026, 6, 1, 0, 30);
    const next = computeNextRun('monthly', from);
    assert.equal(next.getMonth(), 5);
    assert.equal(next.getDate(), 1);
    assert.equal(next.getHours(), 1);
    assert.ok(next > from);
  });
});

describe('backupSchedulerService retryDelayMs', () => {
  it('uses escalating delays capped at last entry', () => {
    assert.equal(retryDelayMs(1), RETRY_DELAYS_MS[0]);
    assert.equal(retryDelayMs(2), RETRY_DELAYS_MS[1]);
    assert.equal(retryDelayMs(3), RETRY_DELAYS_MS[2]);
    assert.equal(retryDelayMs(99), RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
  });

  it('max attempts is 3', () => {
    assert.equal(MAX_BACKUP_ATTEMPTS, 3);
  });
});

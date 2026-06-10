import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTrendPercent,
  defaultDashboardPeriod,
  isValidDateOnly,
  previousPeriodRange,
  previousYearRange,
  resolveComparisonRange,
} from './dashboardMetricsHelpers.js';

describe('dashboardMetricsHelpers', () => {
  it('validates YYYY-MM-DD', () => {
    assert.equal(isValidDateOnly('2026-06-10'), true);
    assert.equal(isValidDateOnly('2026-6-10'), false);
    assert.equal(isValidDateOnly('invalid'), false);
  });

  it('default period starts at first of month', () => {
    const { from, to } = defaultDashboardPeriod();
    assert.match(from, /^\d{4}-\d{2}-01$/);
    assert.equal(isValidDateOnly(to), true);
  });

  it('previous period is contiguous before from', () => {
    const prev = previousPeriodRange('2026-06-10', '2026-06-20');
    assert.equal(prev.to, '2026-06-09');
    assert.equal(prev.from, '2026-05-30');
  });

  it('previous year shifts dates back one year', () => {
    const prev = previousYearRange('2026-03-01', '2026-03-31');
    assert.equal(prev.from, '2025-03-01');
    assert.equal(prev.to, '2025-03-31');
  });

  it('resolveComparisonRange returns null when disabled', () => {
    assert.equal(
      resolveComparisonRange({ from: '2026-01-01', to: '2026-01-31', comparisonPeriod: 'none' }),
      null
    );
  });

  it('computeTrendPercent handles zero previous', () => {
    assert.equal(computeTrendPercent(100, 0), 100);
    assert.equal(computeTrendPercent(0, 0), 0);
    assert.equal(computeTrendPercent(50, 100), -50);
  });
});

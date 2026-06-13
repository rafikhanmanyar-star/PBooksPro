import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDashboardEntityFilter,
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

  it('buildDashboardEntityFilter uses $2 for building when tenant is $1', () => {
    const ef = buildDashboardEntityFilter(
      { buildingId: 'bld-1' },
      { alias: 'i', project: 'i.project_id', property: 'i.property_id' }
    );
    assert.match(ef.sql, /i\.building_id = \$2/);
    assert.deepEqual(ef.params, ['bld-1']);
  });

  it('buildDashboardEntityFilter stacks project and building param indices', () => {
    const ef = buildDashboardEntityFilter(
      { projectId: 'proj-1', buildingId: 'bld-1' },
      { alias: 'i', project: 'i.project_id', property: 'i.property_id' }
    );
    assert.match(ef.sql, /i\.project_id = \$2/);
    assert.match(ef.sql, /i\.building_id = \$3/);
    assert.deepEqual(ef.params, ['proj-1', 'bld-1']);
  });
});

/**
 * Project profitability analytics regression tests.
 * Run: npx tsx tests/projectProfitabilityAnalytics.test.ts
 */
import assert from 'node:assert/strict';
import { selectMonthlyChartPoints } from '../modules/project-profitability/services/projectProfitability.service';
import type { MonthlyProfitPoint } from '../modules/project-profitability/types/profitability.types';

const portfolioTrend: MonthlyProfitPoint[] = [
  { monthKey: '2026-03', label: 'Mar 2026', revenue: 1_000_000, expense: 300_000, netProfit: 700_000 },
];

const projectTrend: MonthlyProfitPoint[] = [
  { monthKey: '2026-03', label: 'Mar 2026', revenue: 100_000, expense: 30_000, netProfit: 70_000 },
];

assert.deepEqual(
  selectMonthlyChartPoints(null, projectTrend, portfolioTrend),
  portfolioTrend,
  'portfolio view should use the portfolio monthly trend'
);

assert.deepEqual(
  selectMonthlyChartPoints('project-1', projectTrend, portfolioTrend),
  projectTrend,
  'project view should use the selected project monthly trend'
);

assert.deepEqual(
  selectMonthlyChartPoints('project-1', undefined, portfolioTrend),
  [],
  'project view must not fall back to portfolio data while project details are unavailable'
);

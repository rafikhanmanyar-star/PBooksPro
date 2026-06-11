/**
 * Backend KPI definitions (Architecture v2) — formulas only, no React.
 * Ported incrementally from components/dashboard/kpiDefinitions.ts.
 */

export type KpiComputeContext = {
  tenantId: string;
  revenue: number;
  expenses: number;
  receivables: number;
  collections: number;
};

export type KpiDefinitionBackend = {
  key: string;
  label: string;
  compute: (ctx: KpiComputeContext) => number | null;
};

export const BACKEND_KPI_REGISTRY: KpiDefinitionBackend[] = [
  {
    key: 'revenue',
    label: 'Revenue',
    compute: (ctx) => ctx.revenue,
  },
  {
    key: 'expenses',
    label: 'Expenses',
    compute: (ctx) => ctx.expenses,
  },
  {
    key: 'profit',
    label: 'Profit',
    compute: (ctx) => ctx.revenue - ctx.expenses,
  },
  {
    key: 'receivables',
    label: 'Receivables',
    compute: (ctx) => ctx.receivables,
  },
  {
    key: 'collections',
    label: 'Collections',
    compute: (ctx) => ctx.collections,
  },
];

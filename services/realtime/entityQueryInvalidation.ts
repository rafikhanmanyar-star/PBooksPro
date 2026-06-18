/**
 * Real-Time First — maps backend entity events to React Query cache invalidation.
 * Extend this map when adding new modules; AppContext calls this on every entity_* socket event.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { dashboardMetricsQueryKeys } from '../../hooks/useDashboardMetrics';
import { logger } from '../logger';
import type { InvalidateEntityEventContext, RealtimeEntityPayload } from './realtimePayload';
import { rtTrace, rtTraceDuration } from './realtimeTrace';

/** Entity types that affect selling-analytics dashboards. */
export const SELLING_ANALYTICS_ENTITY_TYPES = new Set([
  'unit',
  'project',
  'project_agreement',
  'sales_return',
  'installment_plan',
  'plan_amenity',
]);

/** Financial / operational entities that should refresh ledger, reports, and dashboard KPIs. */
export const FINANCIAL_ENTITY_TYPES = new Set([
  'bill',
  'invoice',
  'transaction',
  'payment',
  'account',
  'category',
  'journal_entry',
  'contractor_bill',
  'contractor_advance',
  'project_expense_voucher',
  'sales_return',
  'budget',
  'recurring_invoice_template',
  'accounting_period',
]);

export const RENTAL_ENTITY_TYPES = new Set([
  'rental_agreement',
  'agreement',
  'property',
  'building',
  'unit',
  'installment_plan',
  'pm_cycle_allocation',
]);

export const PAYROLL_ENTITY_TYPES = new Set([
  'payroll_department',
  'payroll_grade',
  'payroll_employee',
  'payroll_run',
  'payslip',
  'payroll_settings',
  'payroll_project',
]);

function passesTenantScope(payload: RealtimeEntityPayload, ctx: InvalidateEntityEventContext): boolean {
  if (payload.tenantId && ctx.currentTenantId && payload.tenantId !== ctx.currentTenantId) {
    return false;
  }
  return true;
}

function isSettingsBulkRefresh(payload: RealtimeEntityPayload): boolean {
  const data = payload.data;
  return (
    payload.type === 'settings' &&
    payload.action === 'updated' &&
    !!data &&
    typeof data === 'object' &&
    data !== null &&
    'bulkRefresh' in data &&
    typeof (data as { bulkRefresh: unknown }).bulkRefresh === 'string'
  );
}

async function invalidateAndTrace(
  queryClient: QueryClient,
  keys: readonly (readonly unknown[])[],
  label: string
): Promise<void> {
  const start = Date.now();
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  rtTraceDuration('query.invalidated', start, {
    label,
    keys: keys.map((k) => k[0]),
  });
}

/** Full tenant cache sweep after clear-transactions / factory-reset (all connected sessions). */
async function invalidateBulkTenantRefresh(queryClient: QueryClient): Promise<void> {
  await invalidateAndTrace(
    queryClient,
    [
      queryKeys.ledger.all,
      queryKeys.reports.all,
      dashboardMetricsQueryKeys.root,
      queryKeys.invoices.all,
      ['rental'],
      ['vendors'],
      ['contacts'],
      ['contracts'],
      queryKeys.projects.all,
      ['payroll'],
      ['documents'],
    ],
    'bulk-tenant-refresh'
  );
  await invalidateSellingAnalytics(queryClient);
}

async function invalidateSellingAnalytics(queryClient: QueryClient): Promise<void> {
  const start = Date.now();
  try {
    const { sellingAnalyticsQueryKeys } = await import(
      '../../modules/selling-analytics/hooks/useSellingAnalytics'
    );
    await queryClient.invalidateQueries({ queryKey: sellingAnalyticsQueryKeys.root });
    rtTraceDuration('query.invalidated', start, {
      label: 'selling-analytics',
      keys: [sellingAnalyticsQueryKeys.root[0]],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warnCategory('realtime', 'selling_analytics.invalidate_failed', message);
    rtTrace('selling_analytics.invalidate_failed', { error: message });
  }
}

/**
 * Invalidate React Query caches affected by a tenant entity event.
 * Called from AppContext socket handlers (Real-Time First architecture).
 */
export async function invalidateQueriesForEntityEvent(
  queryClient: QueryClient,
  payload: RealtimeEntityPayload,
  ctx: InvalidateEntityEventContext = {}
): Promise<void> {
  if (!passesTenantScope(payload, ctx)) return;

  const entityType = payload.type;
  if (!entityType) return;

  if (isSettingsBulkRefresh(payload)) {
    await invalidateBulkTenantRefresh(queryClient);
    return;
  }

  if (SELLING_ANALYTICS_ENTITY_TYPES.has(entityType)) {
    await invalidateSellingAnalytics(queryClient);
  }

  if (FINANCIAL_ENTITY_TYPES.has(entityType)) {
    await invalidateAndTrace(
      queryClient,
      [queryKeys.ledger.all, queryKeys.reports.all, dashboardMetricsQueryKeys.root],
      'financial'
    );
  }

  if (entityType === 'invoice' || entityType === 'bill') {
    await invalidateAndTrace(
      queryClient,
      [queryKeys.invoices.all, queryKeys.rental.invoicesList()],
      'invoice-bill'
    );
  }

  if (RENTAL_ENTITY_TYPES.has(entityType)) {
    await invalidateAndTrace(
      queryClient,
      [queryKeys.rental.invoicesList(), ['rental']],
      'rental'
    );
  }

  if (entityType === 'contact') {
    await invalidateAndTrace(queryClient, [['contacts'], queryKeys.reports.orgUsers()], 'contact');
  }

  if (entityType === 'vendor' || entityType === 'quotation') {
    await invalidateAndTrace(
      queryClient,
      [['vendors'], ['quotations'], ['quotation-comparison'], ['procurement-dashboard']],
      'vendor-quotation'
    );
  }

  if (entityType === 'purchase_order') {
    await invalidateAndTrace(
      queryClient,
      [['purchase-orders'], ['procurement-dashboard'], ['quotation-comparison']],
      'purchase-order'
    );
  }

  if (entityType === 'goods_receipt') {
    await invalidateAndTrace(
      queryClient,
      [
        ['goods-receipts'],
        ['goods-receipt-report'],
        ['purchase-orders'],
        ['procurement-dashboard'],
      ],
      'goods-receipt'
    );
  }

  if (entityType === 'approval_request' || entityType === 'settings') {
    await invalidateAndTrace(queryClient, [['workflow']], 'workflow-settings');
  }

  if (entityType === 'contract') {
    await invalidateAndTrace(queryClient, [['contracts']], 'contract');
  }

  if (entityType === 'project') {
    await invalidateAndTrace(queryClient, [queryKeys.projects.all], 'project');
  }

  if (entityType === 'user') {
    await invalidateAndTrace(queryClient, [queryKeys.reports.orgUsers()], 'user');
  }

  if (PAYROLL_ENTITY_TYPES.has(entityType)) {
    await invalidateAndTrace(queryClient, [['payroll']], 'payroll');
  }

  if (entityType === 'document') {
    await invalidateAndTrace(queryClient, [['documents']], 'document');
  }

  if (entityType === 'personal_task' || entityType === 'personal_category' || entityType === 'personal_transaction') {
    await invalidateAndTrace(queryClient, [['personal']], 'personal');
  }

  if (entityType === 'report_definition' || entityType === 'custom_report_template') {
    await invalidateAndTrace(
      queryClient,
      [queryKeys.reports.all, ['reports', 'designer'], ['reports', 'custom']],
      'report-definition'
    );
  }
}

/** Invalidate caches when a GL journal entry is posted (financial.posted socket event). */
export async function invalidateQueriesForFinancialPosted(queryClient: QueryClient): Promise<void> {
  await invalidateAndTrace(
    queryClient,
    [queryKeys.ledger.all, queryKeys.reports.all, dashboardMetricsQueryKeys.root],
    'financial-posted'
  );
}

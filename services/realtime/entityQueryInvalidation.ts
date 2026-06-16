/**
 * Real-Time First — maps backend entity events to React Query cache invalidation.
 * Extend this map when adding new modules; AppContext calls this on every entity_* socket event.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../hooks/queries/queryKeys';
import { dashboardMetricsQueryKeys } from '../../hooks/useDashboardMetrics';
import type { InvalidateEntityEventContext, RealtimeEntityPayload } from './realtimePayload';

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

/** Full tenant cache sweep after clear-transactions / factory-reset (all connected sessions). */
async function invalidateBulkTenantRefresh(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reports.all }),
    queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root }),
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all }),
    queryClient.invalidateQueries({ queryKey: ['rental'] }),
    queryClient.invalidateQueries({ queryKey: ['vendors'] }),
    queryClient.invalidateQueries({ queryKey: ['contacts'] }),
    queryClient.invalidateQueries({ queryKey: ['contracts'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
    queryClient.invalidateQueries({ queryKey: ['payroll'] }),
    queryClient.invalidateQueries({ queryKey: ['documents'] }),
    invalidateSellingAnalytics(queryClient),
  ]);
}

async function invalidateSellingAnalytics(queryClient: QueryClient): Promise<void> {
  try {
    const { sellingAnalyticsQueryKeys } = await import(
      '../../modules/selling-analytics/hooks/useSellingAnalytics'
    );
    await queryClient.invalidateQueries({ queryKey: sellingAnalyticsQueryKeys.root });
  } catch {
    /* module not loaded */
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
    await queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all });
    await queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    await queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });
  }

  if (entityType === 'invoice' || entityType === 'bill') {
    await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    await queryClient.invalidateQueries({ queryKey: queryKeys.rental.invoicesList() });
  }

  if (RENTAL_ENTITY_TYPES.has(entityType)) {
    await queryClient.invalidateQueries({ queryKey: queryKeys.rental.invoicesList() });
    await queryClient.invalidateQueries({ queryKey: ['rental'] });
  }

  if (entityType === 'contact') {
    await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.reports.orgUsers() });
  }

  if (entityType === 'vendor' || entityType === 'quotation') {
    await queryClient.invalidateQueries({ queryKey: ['vendors'] });
    await queryClient.invalidateQueries({ queryKey: ['quotations'] });
    await queryClient.invalidateQueries({ queryKey: ['quotation-comparison'] });
    await queryClient.invalidateQueries({ queryKey: ['procurement-dashboard'] });
  }

  if (entityType === 'purchase_order') {
    await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    await queryClient.invalidateQueries({ queryKey: ['procurement-dashboard'] });
    await queryClient.invalidateQueries({ queryKey: ['quotation-comparison'] });
  }

  if (entityType === 'goods_receipt') {
    await queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
    await queryClient.invalidateQueries({ queryKey: ['goods-receipt-report'] });
    await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    await queryClient.invalidateQueries({ queryKey: ['procurement-dashboard'] });
  }

  if (entityType === 'approval_request' || entityType === 'settings') {
    await queryClient.invalidateQueries({ queryKey: ['workflow'] });
  }

  if (entityType === 'contract') {
    await queryClient.invalidateQueries({ queryKey: ['contracts'] });
  }

  if (entityType === 'project') {
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  }

  if (entityType === 'user') {
    await queryClient.invalidateQueries({ queryKey: queryKeys.reports.orgUsers() });
  }

  if (PAYROLL_ENTITY_TYPES.has(entityType)) {
    await queryClient.invalidateQueries({ queryKey: ['payroll'] });
  }

  if (entityType === 'document') {
    await queryClient.invalidateQueries({ queryKey: ['documents'] });
  }

  if (entityType === 'personal_task' || entityType === 'personal_category' || entityType === 'personal_transaction') {
    await queryClient.invalidateQueries({ queryKey: ['personal'] });
  }

  if (entityType === 'report_definition' || entityType === 'custom_report_template') {
    await queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
    await queryClient.invalidateQueries({ queryKey: ['reports', 'designer'] });
    await queryClient.invalidateQueries({ queryKey: ['reports', 'custom'] });
  }
}

/** Invalidate caches when a GL journal entry is posted (financial.posted socket event). */
export async function invalidateQueriesForFinancialPosted(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.ledger.all });
  await queryClient.invalidateQueries({ queryKey: queryKeys.reports.all });
  await queryClient.invalidateQueries({ queryKey: dashboardMetricsQueryKeys.root });
}

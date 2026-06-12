import type { CustomerReportingFilters, QuickReportKey } from '../../../types/customerReporting.types';
import { CUSTOM_REPORT_MODULE_PROJECT_SELLING } from '../../../services/api/customReportsApi';

export interface QuickReportPreset {
  key: QuickReportKey;
  label: string;
  tab?: import('../../../types/customerReporting.types').CustomerReportTab;
  customReport?: {
    selectedKeys: string[];
    sortField: string;
    sortDir: 'ASC' | 'DESC';
    filters?: { field: string; operator: string; value: unknown }[];
  };
}

export const QUICK_REPORT_PRESETS: QuickReportPreset[] = [
  {
    key: 'customer-statement',
    label: 'Customer Statement',
    customReport: {
      selectedKeys: ['booking_no', 'customer_name', 'project_name', 'unit_numbers', 'selling_price', 'invoice_paid_total', 'outstanding_vs_invoices'],
      sortField: 'customer_name',
      sortDir: 'ASC',
    },
  },
  {
    key: 'customer-balance',
    label: 'Customer Balance Report',
    tab: 'receivable',
    customReport: {
      selectedKeys: ['customer_name', 'project_name', 'selling_price', 'invoice_amount_total', 'invoice_paid_total', 'outstanding_vs_invoices'],
      sortField: 'outstanding_vs_invoices',
      sortDir: 'DESC',
    },
  },
  {
    key: 'customer-ledger',
    label: 'Customer Ledger',
    tab: 'ledger',
  },
  {
    key: 'receivable-aging',
    label: 'Receivable Aging',
    tab: 'receivable',
    customReport: {
      selectedKeys: ['customer_name', 'project_name', 'invoice_amount_total', 'invoice_paid_total', 'outstanding_vs_invoices', 'agreement_status'],
      sortField: 'outstanding_vs_invoices',
      sortDir: 'DESC',
    },
  },
  {
    key: 'defaulters',
    label: 'Defaulters Report',
    tab: 'defaulters',
    customReport: {
      selectedKeys: ['customer_name', 'project_name', 'unit_numbers', 'invoice_amount_total', 'invoice_paid_total', 'outstanding_vs_invoices'],
      sortField: 'outstanding_vs_invoices',
      sortDir: 'DESC',
      filters: [{ field: 'agreement_status', operator: '!=', value: 'Cancelled' }],
    },
  },
  {
    key: 'installment-due',
    label: 'Installment Due Report',
    tab: 'installments',
  },
  {
    key: 'collection',
    label: 'Collection Report',
    tab: 'collection-performance',
    customReport: {
      selectedKeys: ['customer_name', 'project_name', 'invoice_paid_total', 'invoice_amount_total', 'broker_name'],
      sortField: 'invoice_paid_total',
      sortDir: 'DESC',
    },
  },
  {
    key: 'project-receivable',
    label: 'Project Wise Receivable',
    tab: 'receivable',
    customReport: {
      selectedKeys: ['project_name', 'customer_name', 'unit_numbers', 'outstanding_vs_invoices', 'selling_price'],
      sortField: 'project_name',
      sortDir: 'ASC',
    },
  },
  {
    key: 'agent-collection',
    label: 'Sales Agent Collection Report',
    customReport: {
      selectedKeys: ['broker_name', 'customer_name', 'project_name', 'invoice_paid_total', 'selling_price'],
      sortField: 'broker_name',
      sortDir: 'ASC',
    },
  },
];

export function buildCustomReportPayload(
  preset: QuickReportPreset,
  filters: CustomerReportingFilters,
  format: 'xlsx' | 'pdf' | 'csv' = 'xlsx'
): Record<string, unknown> {
  const cr = preset.customReport;
  if (!cr) return {};
  const reportFilters = [...(cr.filters ?? [])];
  if (filters.projectId) {
    reportFilters.push({ field: 'project_id', operator: '=', value: filters.projectId });
  }
  if (filters.customerId) {
    reportFilters.push({ field: 'customer_id', operator: '=', value: filters.customerId });
  }
  if (filters.status) {
    reportFilters.push({ field: 'agreement_status', operator: '=', value: filters.status });
  }
  if (filters.salesAgentId) {
    reportFilters.push({ field: 'broker_id', operator: '=', value: filters.salesAgentId });
  }
  return {
    module: CUSTOM_REPORT_MODULE_PROJECT_SELLING,
    fields: cr.selectedKeys,
    filters: reportFilters.length ? reportFilters : undefined,
    sortBy: [{ field: cr.sortField, direction: cr.sortDir }],
    page: 1,
    pageSize: 500,
    format,
    reportName: preset.label,
  };
}

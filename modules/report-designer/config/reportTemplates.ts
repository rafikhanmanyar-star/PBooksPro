import type { CustomReportModuleKey } from '../../services/api/customReportsApi';

export const REPORT_TYPES = [
  { id: 'tabular', label: 'Tabular Report', enabled: true },
  { id: 'grouped', label: 'Grouped Report', enabled: true },
  { id: 'summary', label: 'Summary Report', enabled: true },
  { id: 'matrix', label: 'Matrix Report', enabled: false },
  { id: 'pivot', label: 'Pivot Report', enabled: false },
  { id: 'aging', label: 'Aging Report', enabled: true },
  { id: 'ledger', label: 'Ledger Report', enabled: true },
  { id: 'financial', label: 'Financial Report', enabled: false },
  { id: 'dashboard', label: 'Dashboard Report', enabled: false },
  { id: 'chart', label: 'Chart Report', enabled: true },
] as const;

export type ReportTypeId = (typeof REPORT_TYPES)[number]['id'];

export type ReportTemplatePreset = {
  id: string;
  name: string;
  description: string;
  module: CustomReportModuleKey;
  reportType: ReportTypeId;
  fields: string[];
  groupBy?: string[];
  filters?: { field: string; operator: string; value: string }[];
  aggregates?: { field: string; operation: string }[];
};

export const BUILTIN_REPORT_TEMPLATES: ReportTemplatePreset[] = [
  {
    id: 'selling-customer-ledger',
    name: 'Customer Ledger',
    description: 'Bookings with paid and outstanding amounts',
    module: 'project_selling',
    reportType: 'ledger',
    fields: ['booking_no', 'customer_name', 'project_name', 'selling_price', 'invoice_paid_total', 'outstanding_vs_invoices'],
  },
  {
    id: 'selling-receivable-aging',
    name: 'Receivable Aging',
    description: 'Outstanding by customer and project',
    module: 'project_selling',
    reportType: 'aging',
    fields: ['customer_name', 'project_name', 'outstanding_vs_invoices', 'invoice_amount_total'],
    groupBy: ['project_name'],
  },
  {
    id: 'selling-defaulters',
    name: 'Defaulter List',
    description: 'Active agreements with outstanding balance',
    module: 'project_selling',
    reportType: 'tabular',
    fields: ['booking_no', 'customer_name', 'project_name', 'outstanding_vs_invoices', 'agreement_status'],
    filters: [{ field: 'outstanding_vs_invoices', operator: '>', value: '0' }],
  },
  {
    id: 'selling-collection-chart',
    name: 'Collections by Project',
    description: 'Chart of outstanding balances grouped by project',
    module: 'project_selling',
    reportType: 'chart',
    fields: ['customer_name', 'project_name', 'outstanding_vs_invoices'],
    groupBy: ['project_name'],
    aggregates: [{ field: 'outstanding_vs_invoices', operation: 'SUM' }],
  },
  {
    id: 'construction-vendor-ledger',
    name: 'Vendor Ledger',
    description: 'Contracts with billed, paid, and outstanding',
    module: 'project_construction',
    reportType: 'ledger',
    fields: ['contract_number', 'vendor_name', 'project_name', 'contract_amount', 'billed_total', 'paid_total', 'outstanding'],
  },
  {
    id: 'construction-site-expense',
    name: 'Site Expense Report',
    description: 'Bills and overdue by vendor and project',
    module: 'project_construction',
    reportType: 'summary',
    fields: ['vendor_name', 'project_name', 'billed_total', 'paid_total', 'overdue_amount'],
    groupBy: ['project_name'],
  },
  {
    id: 'rental-tenant-ledger',
    name: 'Tenant Ledger',
    description: 'Rental agreements with rent and status',
    module: 'rental_agreements',
    reportType: 'ledger',
    fields: ['agreement_number', 'tenant_name', 'property_name', 'building_name', 'monthly_rent', 'status', 'start_date', 'end_date'],
  },
  {
    id: 'rental-rent-collection',
    name: 'Rent Collection',
    description: 'Agreements grouped by building',
    module: 'rental_agreements',
    reportType: 'grouped',
    fields: ['tenant_name', 'monthly_rent', 'building_name', 'property_name'],
    groupBy: ['building_name'],
  },
  {
    id: 'rental-rent-collection-chart',
    name: 'Rent by Building',
    description: 'Chart of monthly rent totals by building',
    module: 'rental_agreements',
    reportType: 'chart',
    fields: ['tenant_name', 'monthly_rent', 'building_name'],
    groupBy: ['building_name'],
    aggregates: [{ field: 'monthly_rent', operation: 'SUM' }],
  },
  {
    id: 'rental-contract-expiry',
    name: 'Contract Expiry',
    description: 'Agreements sorted by end date',
    module: 'rental_agreements',
    reportType: 'tabular',
    fields: ['agreement_number', 'tenant_name', 'property_name', 'end_date', 'status'],
  },
  {
    id: 'accounting-transaction-ledger',
    name: 'Transaction Ledger',
    description: 'All transactions with account, category, and project',
    module: 'accounting_ledger',
    reportType: 'ledger',
    fields: ['txn_date', 'txn_type', 'amount', 'description', 'account_name', 'category_name', 'project_name'],
  },
];

export function templatesForModule(module: CustomReportModuleKey): ReportTemplatePreset[] {
  return BUILTIN_REPORT_TEMPLATES.filter((t) => t.module === module);
}

import {
  CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION,
  CUSTOM_REPORT_MODULE_PROJECT_SELLING,
  CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS,
  CUSTOM_REPORT_MODULE_ACCOUNTING_LEDGER,
  type CustomReportModuleKey,
} from '../../../services/api/customReportsApi';

export const MODULE_DEFAULT_FIELD_KEYS: Record<CustomReportModuleKey, string[]> = {
  [CUSTOM_REPORT_MODULE_PROJECT_SELLING]: [
    'booking_no',
    'customer_name',
    'project_name',
    'selling_price',
    'invoice_paid_total',
    'outstanding_vs_invoices',
  ],
  [CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS]: [
    'agreement_number',
    'tenant_name',
    'property_name',
    'building_name',
    'monthly_rent',
    'status',
    'start_date',
    'end_date',
  ],
  [CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION]: [
    'contract_number',
    'contract_name',
    'vendor_name',
    'project_name',
    'contract_amount',
    'billed_total',
    'paid_total',
    'outstanding',
  ],
  [CUSTOM_REPORT_MODULE_ACCOUNTING_LEDGER]: [
    'txn_date',
    'txn_type',
    'amount',
    'description',
    'account_name',
    'category_name',
    'contact_name',
    'vendor_name',
    'project_name',
  ],
};

export const MODULE_DEFAULT_SORT_FIELD: Record<CustomReportModuleKey, string> = {
  [CUSTOM_REPORT_MODULE_PROJECT_SELLING]: 'booking_date',
  [CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS]: 'start_date',
  [CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION]: 'start_date',
  [CUSTOM_REPORT_MODULE_ACCOUNTING_LEDGER]: 'txn_date',
};

export const MODULE_SCOPE_LABELS: Record<CustomReportModuleKey, { title: string; subtitle: string }> = {
  [CUSTOM_REPORT_MODULE_PROJECT_SELLING]: {
    title: 'Custom Reports',
    subtitle: 'Project selling — design tabular, grouped, and summary reports from bookings and installments.',
  },
  [CUSTOM_REPORT_MODULE_PROJECT_CONSTRUCTION]: {
    title: 'Custom Reports',
    subtitle: 'Project construction — contracts, vendors, bills, and site expenses.',
  },
  [CUSTOM_REPORT_MODULE_RENTAL_AGREEMENTS]: {
    title: 'Custom Reports',
    subtitle: 'Rental management — tenants, properties, and rent collection.',
  },
  [CUSTOM_REPORT_MODULE_ACCOUNTING_LEDGER]: {
    title: 'Report Designer',
    subtitle: 'Accounting ledger — transactions, accounts, categories, and projects.',
  },
};

export function defaultKeysForModule(module: CustomReportModuleKey): string[] {
  return [...MODULE_DEFAULT_FIELD_KEYS[module]];
}

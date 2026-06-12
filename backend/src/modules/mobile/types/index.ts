export type InterfaceMode = 'auto' | 'full_erp' | 'executive_mobile';

export type UnpostedTransactionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'processed'
  | 'rejected';

export const UNPOSTED_TRANSACTION_TYPES = [
  'supplier_payment',
  'employee_payment',
  'material_purchase',
  'customer_collection',
  'fuel_expense',
  'site_expense',
  'travel_expense',
  'office_expense',
  'other',
] as const;

export type UnpostedTransactionType = (typeof UNPOSTED_TRANSACTION_TYPES)[number];

export type UnpostedTransactionRow = {
  id: string;
  tenant_id: string;
  transaction_date: Date;
  amount: string;
  currency: string;
  transaction_type: string;
  description: string | null;
  party_name: string | null;
  supplier_id: string | null;
  employee_id: string | null;
  customer_id: string | null;
  project_id: string | null;
  property_id: string | null;
  created_by: string;
  status: UnpostedTransactionStatus;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  processed_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
};

export type MobileMetric = {
  id: string;
  label: string;
  value: number;
  format?: 'currency' | 'number' | 'percent';
  trend?: number | null;
};

export type MobileDashboardResponse = {
  generatedAt: string;
  metrics: MobileMetric[];
};

export type CreateUnpostedTransactionInput = {
  transactionDate?: string;
  amount: number;
  currency?: string;
  transactionType: string;
  description?: string;
  partyName?: string;
  supplierId?: string;
  employeeId?: string;
  customerId?: string;
  projectId?: string;
  propertyId?: string;
  status?: 'draft' | 'submitted';
};

export function rowToUnpostedTransactionApi(row: UnpostedTransactionRow, createdByName?: string) {
  return {
    id: row.id,
    transactionDate:
      row.transaction_date instanceof Date
        ? row.transaction_date.toISOString().slice(0, 10)
        : String(row.transaction_date).slice(0, 10),
    amount: Number(row.amount),
    currency: row.currency,
    transactionType: row.transaction_type,
    description: row.description ?? undefined,
    partyName: row.party_name ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    employeeId: row.employee_id ?? undefined,
    customerId: row.customer_id ?? undefined,
    projectId: row.project_id ?? undefined,
    propertyId: row.property_id ?? undefined,
    createdBy: row.created_by,
    createdByName,
    status: row.status,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at?.toISOString(),
    processedAt: row.processed_at?.toISOString(),
    rejectionReason: row.rejection_reason ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export type InterfaceMode = 'auto' | 'full_erp' | 'executive_mobile';

export type UnpostedTransactionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'processed'
  | 'rejected';

export const UNPOSTED_TRANSACTION_TYPES = [
  { id: 'supplier_payment', label: 'Paid supplier (cash)' },
  { id: 'employee_payment', label: 'Paid worker wages' },
  { id: 'material_purchase', label: 'Purchased materials' },
  { id: 'customer_collection', label: 'Received customer payment' },
  { id: 'fuel_expense', label: 'Fuel expense' },
  { id: 'site_expense', label: 'Site expense' },
  { id: 'travel_expense', label: 'Travel expense' },
  { id: 'office_expense', label: 'Office expense' },
  { id: 'other', label: 'Other' },
] as const;

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

export type UnpostedTransaction = {
  id: string;
  transactionDate: string;
  amount: number;
  currency: string;
  transactionType: string;
  description?: string;
  partyName?: string;
  supplierId?: string;
  employeeId?: string;
  customerId?: string;
  projectId?: string;
  propertyId?: string;
  createdBy: string;
  createdByName?: string;
  status: UnpostedTransactionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  processedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type ExecutiveModuleId =
  | 'dashboard'
  | 'sales'
  | 'crm'
  | 'projects'
  | 'construction'
  | 'propertySelling'
  | 'rentals'
  | 'finance'
  | 'hr'
  | 'inventory';

export type ExecutiveView =
  | 'home'
  | 'moduleList'
  | 'moduleDashboard'
  | 'quickTransaction'
  | 'reports'
  | 'settings'
  | 'myTransactions'
  | 'approvals'
  | 'notifications';

export type MobileApprovalItem = {
  id: string;
  type: 'pev' | 'installment_plan' | 'contractor_bill';
  title: string;
  subtitle?: string;
  amount?: number;
  currency?: string;
  status: string;
  requestedAt?: string;
  requestedById?: string;
  requestedByName?: string;
  canApprove: boolean;
  requiresFullErp?: boolean;
};

export type MobileNotificationItem = {
  id: string;
  category: 'approval' | 'collections' | 'rental' | 'finance' | 'project';
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'urgent';
  createdAt: string;
  actionType?: 'approval' | 'pev' | 'installment_plan' | 'unposted';
  actionId?: string;
};

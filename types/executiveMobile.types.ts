export type InterfaceMode = 'auto' | 'full_erp' | 'executive_mobile';

export type UnpostedTransactionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'processed'
  | 'rejected';

export const UNPOSTED_TRANSACTION_TYPES = [
  { id: 'fuel_expense', label: 'Fuel Expense' },
  { id: 'office_expense', label: 'Office Expense' },
  { id: 'site_expense', label: 'Site Expense' },
  { id: 'advance_payment', label: 'Advance Payment' },
  { id: 'customer_collection', label: 'Customer Collection' },
  { id: 'supplier_payment', label: 'Vendor Payment' },
  { id: 'cash_deposit', label: 'Cash Deposit' },
  { id: 'cash_withdrawal', label: 'Cash Withdrawal' },
  { id: 'employee_payment', label: 'Worker Wages' },
  { id: 'material_purchase', label: 'Material Purchase' },
  { id: 'travel_expense', label: 'Travel Expense' },
  { id: 'other', label: 'Other' },
] as const;

export const UNPOSTED_SOURCE_EXECUTIVE_APP = 'EXECUTIVE_APP' as const;

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
  costCenterCode?: string;
  source?: string;
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
  | 'profile'
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
  reviewedAt?: string;
  reviewedByName?: string;
};

export type MobileInstallmentPlanDetail = {
  id: string;
  status: string;
  projectId?: string;
  projectName?: string;
  unitId?: string;
  unitLabel?: string;
  leadId?: string;
  leadName?: string;
  description?: string;
  introText?: string;
  listPrice?: number;
  netValue?: number;
  downPaymentAmount?: number;
  downPaymentPercentage?: number;
  installmentAmount?: number;
  totalInstallments?: number;
  durationYears?: number;
  frequency?: string;
  amenitiesTotal?: number;
  customerDiscount?: number;
  floorDiscount?: number;
  lumpSumDiscount?: number;
  miscDiscount?: number;
  selectedAmenities?: Array<{ amenityName?: string; calculatedAmount?: number }>;
  requestedByName?: string;
  reviewedByName?: string;
  approvalRequestedAt?: string;
  approvalReviewedAt?: string;
  canApprove: boolean;
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

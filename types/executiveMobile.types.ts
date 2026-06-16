import type { WorkflowEntityType } from '../shared/workflow/workflowTypes';

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
  | 'notifications'
  | 'inbox'
  | 'constructionDashboard'
  | 'cashPosition';

export type ExecutiveKpiTickerItem = {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'number';
  trend?: number | null;
  trendLabel?: string;
  severity?: 'normal' | 'warning' | 'danger';
};

export type ExecutiveActivityItem = {
  id: string;
  kind: 'contract' | 'vendor_bill' | 'payment' | 'approval' | 'invoice' | 'transaction';
  title: string;
  subtitle?: string;
  amount?: number;
  occurredAt: string;
};

export type ExecutiveCommandCenterResponse = {
  generatedAt: string;
  ticker: ExecutiveKpiTickerItem[];
  financial: {
    cashPosition: MobileMetric;
    receivables: MobileMetric;
    payables: MobileMetric;
    netPosition: MobileMetric;
  };
  projects: {
    activeProjects: number;
    activeProjectsTrend?: number | null;
    onTrack: number;
    delayed: number;
    onTrackPercent: number;
    contractValue: number;
    contractValueTrend?: number | null;
  };
  collections: {
    thisMonth: number;
    thisMonthTrend?: number | null;
    overdue: number;
    overdueTrend?: number | null;
    collectionEfficiency: number;
    efficiencyTrend?: number | null;
    topOverdueAmount: number;
    topOverdueCustomers: number;
  };
  construction: {
    siteExpenses: number;
    vendorPayments: number;
    materialCost: number;
    outstandingBills: number;
  };
  approvalAnalytics: {
    pendingTotal: number;
    pendingActionable: number;
    newSinceYesterday: number;
    byType: Record<string, number>;
  };
  criticalAlerts: number;
  recentActivity: ExecutiveActivityItem[];
};

export type BulkApprovalResult = {
  approved: number;
  failed: Array<{ type: string; id: string; error: string }>;
};

export type QuickActionId =
  | 'approve_all'
  | 'review_contracts'
  | 'view_collections'
  | 'review_vendor_bills'
  | 'retention_releases'
  | 'quick_capture'
  | 'construction_health';

export type MobileLegacyApprovalType = 'pev' | 'installment_plan' | 'contractor_bill';

export type MobileApprovalType = WorkflowEntityType | MobileLegacyApprovalType;

export type MobileApprovalItem = {
  id: string;
  type: MobileApprovalType;
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
  /** Workflow approval request id (same as id for workflow-backed items). */
  workflowRequestId?: string;
  entityId?: string;
  currentLevel?: number;
  maxLevel?: number;
  entityRef?: string;
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
  actionType?: 'approval' | 'approval_request' | 'pev' | 'installment_plan' | 'unposted' | 'contract';
  actionId?: string;
  entityType?: string;
  entityId?: string;
  workflowEntityType?: string;
};

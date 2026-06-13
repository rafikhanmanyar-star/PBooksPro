import type { MobileApprovalItem, MobileNotificationItem } from '../../../types/executiveMobile.types';

export type ApprovalCategoryId = 'all' | MobileApprovalItem['type'];

export const APPROVAL_TYPE_META: Record<
  MobileApprovalItem['type'],
  { label: string; shortLabel: string; description: string }
> = {
  pev: {
    label: 'Expense Vouchers',
    shortLabel: 'PEV',
    description: 'Project expense vouchers awaiting approval',
  },
  installment_plan: {
    label: 'Installment Plans',
    shortLabel: 'Plans',
    description: 'Sales installment plans pending sign-off',
  },
  contractor_bill: {
    label: 'Contractor Bills',
    shortLabel: 'Bills',
    description: 'Contractor bills ready for review',
  },
};

export type AlertCategoryId = 'all' | MobileNotificationItem['category'];

export const ALERT_CATEGORY_META: Record<
  MobileNotificationItem['category'],
  { label: string; description: string }
> = {
  approval: { label: 'Approvals', description: 'Items waiting for your decision' },
  finance: { label: 'Finance', description: 'Quick captures and finance updates' },
  collections: { label: 'Collections', description: 'Receivables and overdue invoices' },
  rental: { label: 'Rental', description: 'Leases, renewals, and rental activity' },
  project: { label: 'Projects', description: 'Project and construction alerts' },
};

export const ALERT_CATEGORY_ORDER: MobileNotificationItem['category'][] = [
  'approval',
  'finance',
  'collections',
  'rental',
  'project',
];

export const APPROVAL_TYPE_ORDER: MobileApprovalItem['type'][] = [
  'pev',
  'installment_plan',
  'contractor_bill',
];

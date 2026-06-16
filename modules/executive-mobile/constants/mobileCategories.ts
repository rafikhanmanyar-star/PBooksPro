import type { MobileApprovalItem } from '../../../types/executiveMobile.types';
import {
  isWorkflowEntityType,
  WORKFLOW_ENTITY_LABELS,
  WORKFLOW_ENTITY_SHORT_LABELS,
  WORKFLOW_ENTITY_TYPES,
  type WorkflowEntityType,
} from '../../../shared/workflow/workflowTypes';

export type ApprovalCategoryId = 'all' | MobileApprovalItem['type'];

export type ApprovalTypeMeta = {
  label: string;
  shortLabel: string;
  description: string;
  iconWrap: string;
  group: 'workflow' | 'domain';
};

const WORKFLOW_ICON = 'executive-metric-icon executive-metric-icon--teal';
const DOMAIN_ICON = 'executive-metric-icon executive-metric-icon--violet';

const WORKFLOW_META: Record<WorkflowEntityType, ApprovalTypeMeta> = {
  purchase_order: {
    label: WORKFLOW_ENTITY_LABELS.purchase_order,
    shortLabel: WORKFLOW_ENTITY_SHORT_LABELS.purchase_order,
    description: 'Purchase orders in the approval workflow',
    iconWrap: 'executive-metric-icon executive-metric-icon--blue',
    group: 'workflow',
  },
  contract: {
    label: WORKFLOW_ENTITY_LABELS.contract,
    shortLabel: WORKFLOW_ENTITY_SHORT_LABELS.contract,
    description: 'Contracts awaiting workflow sign-off',
    iconWrap: 'executive-metric-icon executive-metric-icon--green',
    group: 'workflow',
  },
  bill: {
    label: WORKFLOW_ENTITY_LABELS.bill,
    shortLabel: WORKFLOW_ENTITY_SHORT_LABELS.bill,
    description: 'Vendor bills in the approval pipeline',
    iconWrap: 'executive-metric-icon executive-metric-icon--amber',
    group: 'workflow',
  },
  payment: {
    label: WORKFLOW_ENTITY_LABELS.payment,
    shortLabel: WORKFLOW_ENTITY_SHORT_LABELS.payment,
    description: 'Payments pending workflow approval',
    iconWrap: 'executive-metric-icon executive-metric-icon--violet',
    group: 'workflow',
  },
  retention_release: {
    label: WORKFLOW_ENTITY_LABELS.retention_release,
    shortLabel: WORKFLOW_ENTITY_SHORT_LABELS.retention_release,
    description: 'Retention releases awaiting approval',
    iconWrap: 'executive-metric-icon executive-metric-icon--rose',
    group: 'workflow',
  },
  variation_order: {
    label: WORKFLOW_ENTITY_LABELS.variation_order,
    shortLabel: WORKFLOW_ENTITY_SHORT_LABELS.variation_order,
    description: 'Contract variations in review',
    iconWrap: 'executive-metric-icon executive-metric-icon--teal',
    group: 'workflow',
  },
};

const DOMAIN_META: Record<'pev' | 'installment_plan' | 'contractor_bill', ApprovalTypeMeta> = {
  pev: {
    label: 'Expense Vouchers',
    shortLabel: 'PEV',
    description: 'Project expense vouchers awaiting approval',
    iconWrap: DOMAIN_ICON,
    group: 'domain',
  },
  installment_plan: {
    label: 'Marketing Plans',
    shortLabel: 'Marketing',
    description: 'Sales marketing plans pending review and recently approved',
    iconWrap: 'executive-metric-icon executive-metric-icon--violet',
    group: 'domain',
  },
  contractor_bill: {
    label: 'Contractor Bills',
    shortLabel: 'Contractor',
    description: 'Construction contractor bills for review in full ERP',
    iconWrap: 'executive-metric-icon executive-metric-icon--amber',
    group: 'domain',
  },
};

export const APPROVAL_TYPE_META: Record<MobileApprovalItem['type'], ApprovalTypeMeta> = {
  ...WORKFLOW_META,
  ...DOMAIN_META,
};

export const WORKFLOW_APPROVAL_TYPE_ORDER: WorkflowEntityType[] = [...WORKFLOW_ENTITY_TYPES];

export const DOMAIN_APPROVAL_TYPE_ORDER: Array<'pev' | 'installment_plan' | 'contractor_bill'> = [
  'pev',
  'installment_plan',
  'contractor_bill',
];

export const APPROVAL_TYPE_ORDER: MobileApprovalItem['type'][] = [
  ...WORKFLOW_APPROVAL_TYPE_ORDER,
  ...DOMAIN_APPROVAL_TYPE_ORDER,
];

export function getApprovalTypeMeta(type: string): ApprovalTypeMeta {
  if (type in APPROVAL_TYPE_META) {
    return APPROVAL_TYPE_META[type as MobileApprovalItem['type']];
  }
  return {
    label: type,
    shortLabel: type,
    description: 'Approval item',
    iconWrap: WORKFLOW_ICON,
    group: 'workflow',
  };
}

export function isWorkflowApprovalItem(item: MobileApprovalItem): boolean {
  return isWorkflowEntityType(item.type);
}

export function buildApprovalCategoryChips(
  items: MobileApprovalItem[]
): Array<{ id: string; label: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }

  const typesWithItems = APPROVAL_TYPE_ORDER.filter((type) => (counts[type] ?? 0) > 0);

  return [
    { id: 'all', label: 'All', count: items.length },
    ...typesWithItems.map((type) => ({
      id: type,
      label: APPROVAL_TYPE_META[type].shortLabel,
      count: counts[type] ?? 0,
    })),
  ];
}

export type AlertCategoryId = 'all' | import('../../../types/executiveMobile.types').MobileNotificationItem['category'];

export const ALERT_CATEGORY_META: Record<
  import('../../../types/executiveMobile.types').MobileNotificationItem['category'],
  { label: string; description: string }
> = {
  approval: { label: 'Approvals', description: 'Items waiting for your decision' },
  finance: { label: 'Finance', description: 'Quick captures and finance updates' },
  collections: { label: 'Collections', description: 'Receivables and overdue invoices' },
  rental: { label: 'Rental', description: 'Leases, renewals, and rental activity' },
  project: { label: 'Projects', description: 'Project and construction alerts' },
};

export const ALERT_CATEGORY_ORDER: import('../../../types/executiveMobile.types').MobileNotificationItem['category'][] =
  ['approval', 'finance', 'collections', 'rental', 'project'];

export function buildAlertCategoryChips(
  items: import('../../../types/executiveMobile.types').MobileNotificationItem[]
): Array<{ id: string; label: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }

  const categoriesWithItems = ALERT_CATEGORY_ORDER.filter((cat) => (counts[cat] ?? 0) > 0);

  return [
    { id: 'all', label: 'All', count: items.length },
    ...categoriesWithItems.map((cat) => ({
      id: cat,
      label: ALERT_CATEGORY_META[cat].label,
      count: counts[cat] ?? 0,
    })),
  ];
}

export function workflowAlertLabel(entityType?: string): string | undefined {
  if (!entityType || !isWorkflowEntityType(entityType)) return undefined;
  return WORKFLOW_ENTITY_LABELS[entityType];
}

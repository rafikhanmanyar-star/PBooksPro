export type MobileApprovalType = 'pev' | 'installment_plan' | 'contractor_bill';

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
};

export function normalizeStatus(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isPendingInstallmentPlan(
  status: string,
  approvalRequestedTo: string | null | undefined,
  userId: string
): boolean {
  if (normalizeStatus(status) !== 'pending approval') return false;
  if (!approvalRequestedTo) return false;
  return approvalRequestedTo === userId;
}

export function filterApprovalsForUser(
  items: MobileApprovalItem[],
  userId: string
): MobileApprovalItem[] {
  return items.filter((item) => item.canApprove || item.requestedById === userId);
}

export function sortApprovalsByDate(items: MobileApprovalItem[]): MobileApprovalItem[] {
  return [...items].sort((a, b) => {
    const ta = a.requestedAt ? Date.parse(a.requestedAt) : 0;
    const tb = b.requestedAt ? Date.parse(b.requestedAt) : 0;
    return tb - ta;
  });
}

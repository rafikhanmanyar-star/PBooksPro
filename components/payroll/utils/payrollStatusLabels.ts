import type { PayrollStatus } from '../types';

/** Display labels for payroll run lifecycle — backend enums unchanged. */
export function payrollRunStatusLabel(status: PayrollStatus | string | null | undefined): string {
  switch (status) {
    case 'GENERATED':
      return 'Ready For Approval';
    case 'APPROVED':
      return 'Approved';
    case 'PAID':
      return 'Paid';
    case 'DRAFT':
      return 'Draft';
    case 'PROCESSING':
      return 'Processing';
    default:
      return status ? String(status) : '—';
  }
}

export function payrollApprovalStatusLabel(
  run: { status: PayrollStatus | string } | null | undefined,
  isCreator: boolean
): string {
  if (!run) return '—';
  if (run.status === 'APPROVED' || run.status === 'PAID') return 'Approved';
  if (run.status === 'GENERATED') {
    return isCreator ? 'Pending Independent Approval' : 'Pending Approval';
  }
  return payrollRunStatusLabel(run.status);
}

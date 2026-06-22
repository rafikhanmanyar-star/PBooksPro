import type { PayrollRun } from '../types';

/** Shown when API returns SoD / creator-cannot-approve errors. */
export const PAYROLL_SOD_API_ERROR_MESSAGE =
  'This payroll run was created by you. Company policy requires a different authorized user to approve payroll runs.';

export const PAYROLL_SOD_CREATOR_BLOCKED_MESSAGE =
  'This payroll run was prepared by you. Company policy requires another authorized user with payroll approval permission to approve payroll before payment can proceed.';

export const PAYROLL_SOD_POLICY_SUMMARY =
  'The payroll creator cannot approve their own payroll run. A different authorized user with payroll.runs.approve permission must complete approval.';

/** True when the logged-in user created this payroll run (SoD conflict). */
export function isPayrollRunCreator(
  run: PayrollRun | null | undefined,
  currentUserId: string | null | undefined
): boolean {
  if (!run?.created_by || !currentUserId) return false;
  return run.created_by === currentUserId;
}

type UserLike = { id: string; name?: string; username?: string };

/** Resolve a user id to a display name from tenant users or the current session user. */
export function resolvePayrollUserDisplayName(
  userId: string | null | undefined,
  users: readonly UserLike[],
  currentUser?: UserLike | null
): string {
  if (!userId) return '—';
  if (currentUser?.id === userId) {
    return currentUser.name || currentUser.username || 'You';
  }
  const match = users.find((u) => u.id === userId);
  if (match) return match.name || match.username || userId;
  return userId;
}

/** Map API SoD / approval errors to user-facing copy. */
export function mapPayrollApprovalErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Approval failed.';
  if (/segregation of duties|cannot approve.*own|creator cannot approve/i.test(trimmed)) {
    return PAYROLL_SOD_API_ERROR_MESSAGE;
  }
  if (/insufficient permissions/i.test(trimmed)) {
    return 'You do not have permission to approve payroll runs. Contact your administrator.';
  }
  return trimmed;
}

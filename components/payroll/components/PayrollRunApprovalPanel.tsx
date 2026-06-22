import React from 'react';
import { CheckCircle2, Circle, ShieldAlert } from 'lucide-react';
import type { PayrollRun } from '../types';
import {
  isPayrollRunCreator,
  PAYROLL_SOD_POLICY_SUMMARY,
  resolvePayrollUserDisplayName,
} from '../utils/payrollApprovalSod';
import { canApprovePayrollRunWorkflow } from '../utils/payrollWorkflowGuards';
import { payrollApprovalStatusLabel, payrollRunStatusLabel } from '../utils/payrollStatusLabels';
import PayrollCorrectionGuide from './PayrollCorrectionGuide';

type UserLike = { id: string; name?: string; username?: string };

type Props = {
  run: PayrollRun;
  payslipCount: number;
  canApprove: boolean;
  currentUserId: string | null | undefined;
  currentUser?: UserLike | null;
  users: readonly UserLike[];
  onApprove: () => void;
  onUnapprove?: () => void;
  busy?: boolean;
  error?: string;
  /** Compact layout for Payroll Cycle banner */
  compact?: boolean;
};

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function RequirementRow({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {met ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
      ) : (
        <Circle className="w-4 h-4 text-app-muted shrink-0 mt-0.5" aria-hidden />
      )}
      <span className={met ? 'text-app-text' : 'text-app-muted'}>{label}</span>
    </li>
  );
}

const PayrollRunApprovalPanel: React.FC<Props> = ({
  run,
  payslipCount,
  canApprove,
  currentUserId,
  currentUser,
  users,
  onApprove,
  onUnapprove,
  busy,
  error,
  compact,
}) => {
  const isCreator = isPayrollRunCreator(run, currentUserId);
  const creatorName = resolvePayrollUserDisplayName(run.created_by, users, currentUser);
  const approverName = resolvePayrollUserDisplayName(run.approved_by, users, currentUser);
  const approveGuard = canApprovePayrollRunWorkflow(run, payslipCount, { currentUserId });

  const payrollGenerated = run.status === 'GENERATED' || run.status === 'APPROVED' || run.status === 'PAID';
  const payslipsProcessed = payslipCount > 0;
  const readyForApproval = payrollGenerated && payslipsProcessed && run.status === 'GENERATED';

  const showApproveAction = run.status === 'GENERATED' && canApprove;
  const approveBlockedBySod = isCreator;
  const approveDisabled =
    busy || !approveGuard.allowed || approveBlockedBySod || !canApprove;

  const statusHeading =
    run.status === 'APPROVED' || run.status === 'PAID'
      ? payrollRunStatusLabel(run.status)
      : isCreator
        ? 'Ready For Independent Approval'
        : 'Ready For Approval';

  return (
    <div className={`space-y-4 ${compact ? 'max-w-none' : 'max-w-2xl'}`}>
      {!compact && <h3 className="text-lg font-bold">Approval</h3>}

      {run.status === 'APPROVED' || run.status === 'PAID' ? (
        <div className="rounded-xl border border-ds-success/30 bg-ds-success/5 p-4 space-y-2">
          <p className="text-base font-bold text-ds-success">Payroll Approved Successfully</p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <div>
              <dt className="text-app-muted">Approved by</dt>
              <dd className="font-medium text-app-text">{approverName}</dd>
            </div>
            <div>
              <dt className="text-app-muted">Approved on</dt>
              <dd className="font-medium text-app-text">{formatDisplayDate(run.approved_at)}</dd>
            </div>
          </dl>
          <p className="text-sm text-app-muted pt-1">
            <span className="font-semibold text-app-text">Next action:</span> Proceed with payroll payment from
            Payroll Cycle.
          </p>
          {canApprove && onUnapprove && run.status === 'APPROVED' && (
            <button
              type="button"
              disabled={busy}
              onClick={onUnapprove}
              className="mt-2 px-4 py-2 rounded-xl border border-amber-300 text-amber-800 text-sm font-semibold disabled:opacity-50"
            >
              Revert to generated
            </button>
          )}
          <PayrollCorrectionGuide
            run={run}
            canUnapprove={Boolean(canApprove && onUnapprove)}
            onUnapprove={onUnapprove}
            busy={busy}
          />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-app-border bg-app-toolbar/20 p-4 space-y-3">
            <p className="text-sm font-semibold text-app-text">
              Status: <span className="text-violet-700 dark:text-violet-300">{statusHeading}</span>
            </p>

            {isCreator && run.status === 'GENERATED' && (
              <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                {PAYROLL_SOD_POLICY_SUMMARY}
              </p>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-app-muted">Created by</dt>
                <dd className="font-medium text-app-text">{creatorName}</dd>
              </div>
              <div>
                <dt className="text-app-muted">Created on</dt>
                <dd className="font-medium text-app-text">{formatDisplayDate(run.created_at)}</dd>
              </div>
              <div>
                <dt className="text-app-muted">Current status</dt>
                <dd className="font-medium text-app-text">{payrollRunStatusLabel(run.status)}</dd>
              </div>
              <div>
                <dt className="text-app-muted">Approval status</dt>
                <dd className="font-medium text-app-text">{payrollApprovalStatusLabel(run, isCreator)}</dd>
              </div>
              {payslipCount > 0 && (
                <div>
                  <dt className="text-app-muted">Payslips</dt>
                  <dd className="font-medium text-app-text">{payslipCount}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-app-border p-4 space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-app-muted">Approval Requirements</p>
            <ul className="space-y-2">
              <RequirementRow met={payrollGenerated} label="Payroll generated" />
              <RequirementRow met={payslipsProcessed} label="Payslips processed" />
              <RequirementRow met={readyForApproval} label="Ready for approval" />
            </ul>
            <div className="pt-2 border-t border-app-border text-sm space-y-1">
              <p>
                <span className="text-app-muted">Creator:</span>{' '}
                <span className="font-medium text-app-text">{creatorName}</span>
              </p>
              <div className="flex items-start gap-2 text-app-muted">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
                <p>
                  <span className="font-semibold text-app-text">Approval policy:</span> {PAYROLL_SOD_POLICY_SUMMARY}
                </p>
              </div>
            </div>
          </div>

          {showApproveAction && (
            <div className="space-y-2">
              {!approveGuard.allowed && approveGuard.reason && !approveBlockedBySod && (
                <p className="text-xs text-amber-700">{approveGuard.reason}</p>
              )}
              {approveBlockedBySod ? (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 rounded-xl bg-app-muted/20 text-app-muted text-sm font-semibold cursor-not-allowed"
                >
                  Waiting For Approver
                </button>
              ) : (
                <button
                  type="button"
                  disabled={approveDisabled}
                  title={approveDisabled && approveGuard.reason ? approveGuard.reason : undefined}
                  onClick={onApprove}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? 'Approving…' : 'Approve Payroll Run'}
                </button>
              )}
            </div>
          )}

          {!canApprove && run.status === 'GENERATED' && (
            <p className="text-xs text-amber-700">
              Requires payroll approval permission. You can prepare payroll runs but cannot approve them.
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default PayrollRunApprovalPanel;

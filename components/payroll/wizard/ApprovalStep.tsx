import React from 'react';
import type { PayrollRun } from '../types';
import { canApprovePayrollRunWorkflow } from '../utils/payrollWorkflowGuards';

type Props = {
  run: PayrollRun | null;
  payslipCount: number;
  canApprove: boolean;
  onApprove: () => void;
  onUnapprove: () => void;
  busy?: boolean;
  error?: string;
};

const ApprovalStep: React.FC<Props> = ({
  run,
  payslipCount,
  canApprove,
  onApprove,
  onUnapprove,
  busy,
  error,
}) => {
  const approveGuard = canApprovePayrollRunWorkflow(run, payslipCount);

  if (!run) {
    return <p className="text-sm text-app-muted">Generate summaries and process payslips first.</p>;
  }

  const approveDisabled = busy || !canApprove || !approveGuard.allowed;

  return (
    <div className="space-y-4 max-w-lg">
      <h3 className="text-lg font-bold">Approval</h3>
      <p className="text-sm text-app-muted">
        Run status: <span className="font-semibold">{run.status}</span>
        {run.approved_at && <> · Approved {String(run.approved_at).slice(0, 10)}</>}
        {payslipCount > 0 && <> · {payslipCount} payslip(s)</>}
      </p>
      {run.status === 'GENERATED' && canApprove && (
        <>
          {!approveGuard.allowed && approveGuard.reason && (
            <p className="text-xs text-amber-700">{approveGuard.reason}</p>
          )}
          <button
            type="button"
            disabled={approveDisabled}
            title={approveDisabled && approveGuard.reason ? approveGuard.reason : undefined}
            onClick={onApprove}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            Approve payroll run
          </button>
        </>
      )}
      {run.status === 'APPROVED' && canApprove && (
        <button
          type="button"
          disabled={busy}
          onClick={onUnapprove}
          className="px-4 py-2 rounded-xl border border-amber-300 text-amber-800 text-sm font-semibold disabled:opacity-50"
        >
          Revert to generated
        </button>
      )}
      {run.status === 'APPROVED' && (
        <p className="text-xs text-app-muted">Approved — pay salaries from Payroll Cycle.</p>
      )}
      {!canApprove && <p className="text-xs text-amber-700">Requires payroll.runs.approve permission.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default ApprovalStep;

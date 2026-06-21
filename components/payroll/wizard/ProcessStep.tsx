import React from 'react';
import type { PayrollRun } from '../types';
import { canProcessPayrollRun } from '../utils/payrollWorkflowGuards';

type Props = {
  run: PayrollRun | null;
  canProcess: boolean;
  payslipCount: number;
  onProcess: () => void;
  busy?: boolean;
  error?: string;
  lastSummary?: {
    new_payslips_generated?: number;
    existing_payslips_skipped?: number;
    total_payslips?: number;
  } | null;
};

const ProcessStep: React.FC<Props> = ({
  run,
  canProcess,
  payslipCount,
  onProcess,
  busy,
  error,
  lastSummary,
}) => {
  const guard = canProcessPayrollRun(run);
  const disabled = busy || !canProcess || !guard.allowed;

  if (!run) {
    return <p className="text-sm text-app-muted">Generate attendance summaries first to link a payroll run.</p>;
  }

  return (
    <div className="space-y-4 max-w-lg">
      <h3 className="text-lg font-bold">Process payslips</h3>
      <p className="text-sm text-app-muted">
        Generate attendance-aware payslips for {run.month} {run.year}. Run status must remain GENERATED until
        approval.
      </p>
      <p className="text-sm text-app-text">
        Run status: <span className="font-semibold">{run.status}</span>
        {payslipCount > 0 && <> · {payslipCount} payslip(s) already in run</>}
      </p>
      {lastSummary && (
        <p className="text-xs text-app-muted">
          Last run: {lastSummary.new_payslips_generated ?? 0} new, {lastSummary.existing_payslips_skipped ?? 0}{' '}
          skipped, {lastSummary.total_payslips ?? payslipCount} total.
        </p>
      )}
      {!canProcess && (
        <p className="text-xs text-amber-700">Requires payroll.runs.create or payroll.write permission.</p>
      )}
      {canProcess && !guard.allowed && guard.reason && (
        <p className="text-xs text-amber-700">{guard.reason}</p>
      )}
      <button
        type="button"
        disabled={disabled}
        title={disabled && guard.reason ? guard.reason : undefined}
        onClick={onProcess}
        className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
      >
        {busy ? 'Processing…' : 'Process payslips'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default ProcessStep;

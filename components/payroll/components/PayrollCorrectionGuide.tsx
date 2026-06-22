import React from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { PayrollRun } from '../types';

type Props = {
  run: PayrollRun;
  canUnapprove: boolean;
  onUnapprove?: () => void;
  busy?: boolean;
};

const STEPS = [
  { key: 'unapprove', label: 'Unapprove run', detail: 'Reverses payroll accrual journal (if no payments recorded).' },
  { key: 'edit', label: 'Edit payslips or reprocess', detail: 'Adjust amounts in Payroll Cycle or re-run Process in the wizard.' },
  { key: 'reprocess', label: 'Reprocess if needed', detail: 'Generate payslips for new employees or refresh calculations.' },
  { key: 'reapprove', label: 'Re-approve', detail: 'A different user (not the creator) must approve again; accrual posts on approval.' },
] as const;

const PayrollCorrectionGuide: React.FC<Props> = ({ run, canUnapprove, onUnapprove, busy }) => {
  if (run.status !== 'APPROVED') return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-900/10 dark:border-amber-800 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <RotateCcw className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Correction workflow</p>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
            To fix an approved payroll run, follow these steps in order. Each step is recorded in the audit trail.
          </p>
        </div>
      </div>
      <ol className="space-y-2">
        {STEPS.map((step, i) => (
          <li key={step.key} className="flex items-start gap-2 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200/80 text-[10px] font-black text-amber-900">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold text-app-text">{step.label}</p>
              <p className="text-xs text-app-muted">{step.detail}</p>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight className="w-3 h-3 text-amber-600 shrink-0 mt-1 ml-auto hidden sm:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
      {canUnapprove && onUnapprove && (
        <button
          type="button"
          disabled={busy}
          onClick={onUnapprove}
          className="w-full sm:w-auto px-4 py-2 rounded-xl border border-amber-400 text-amber-900 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Start: Unapprove run'}
        </button>
      )}
      {!canUnapprove && (
        <p className="text-xs text-amber-800">
          Requires payroll approval permission to unapprove. If payments exist, reverse them before unapproving.
        </p>
      )}
    </div>
  );
};

export default PayrollCorrectionGuide;

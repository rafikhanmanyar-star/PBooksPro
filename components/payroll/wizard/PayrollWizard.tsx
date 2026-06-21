import React, { useEffect, useState } from 'react';
import PayrollPeriodStep from './PayrollPeriodStep';
import AttendanceReviewStep from './AttendanceReviewStep';
import LOPReviewStep from './LOPReviewStep';
import PayrollPreviewStep from './PayrollPreviewStep';
import ProcessStep from './ProcessStep';
import ApprovalStep from './ApprovalStep';
import {
  usePayrollAttendanceMutations,
  usePayrollAttendancePreview,
  usePayrollImpactPreview,
  useRunPayslipCount,
} from './hooks/usePayrollWizardQueries';
import { usePermissions } from '../../../hooks/usePermissions';
import { usePayrollContext } from '../../../context/PayrollContext';
import type { PayrollRun } from '../types';

const STEPS = ['Period', 'Attendance', 'LOP', 'Preview', 'Generate', 'Process', 'Approval'] as const;

const PayrollWizard: React.FC = () => {
  const now = new Date();
  const { wizardSeed, setWizardSeed } = usePayrollContext();
  const [step, setStep] = useState(0);
  const [month, setMonth] = useState(now.getMonth() === 0 ? 12 : now.getMonth());
  const [year, setYear] = useState(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);
  const [processSummary, setProcessSummary] = useState<{
    new_payslips_generated?: number;
    existing_payslips_skipped?: number;
    total_payslips?: number;
  } | null>(null);

  useEffect(() => {
    if (!wizardSeed) return;
    setMonth(wizardSeed.month);
    setYear(wizardSeed.year);
    setStep(0);
    setRun(null);
    setError('');
    setProcessSummary(null);
    setWizardSeed(null);
  }, [wizardSeed, setWizardSeed]);

  const { canWritePayroll, canApprovePayrollRun, canCreatePayrollRun } = usePermissions();
  const mutations = usePayrollAttendanceMutations();
  const previewEnabled = step >= 1;
  const impactEnabled = step >= 3;
  const previewQuery = usePayrollAttendancePreview(month, year, previewEnabled);
  const impactQuery = usePayrollImpactPreview(month, year, impactEnabled);
  const payslipCountQuery = useRunPayslipCount(run?.id ?? null, step >= 5);

  const items = previewQuery.data?.items ?? [];
  const payslipCount = payslipCountQuery.data ?? 0;

  const canRunWizard = canCreatePayrollRun || canWritePayroll;

  const startPeriod = async () => {
    if (!canRunWizard) {
      setError('You need payroll.runs.create to run the wizard.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await mutations.startWizard.mutateAsync({ month, year });
      setRun(created);
      setProcessSummary(null);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start wizard.');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!canRunWizard) return;
    setBusy(true);
    setError('');
    try {
      const result = await mutations.generateSummaries.mutateAsync({
        month,
        year,
        runId: run?.id,
        forceOverride: forceOverride || undefined,
      });
      if (result.runId && run) {
        setRun({ ...run, status: 'GENERATED' as PayrollRun['status'] });
      }
      setForceOverride(false);
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed.');
    } finally {
      setBusy(false);
    }
  };

  const processPayslips = async () => {
    if (!run?.id || !canRunWizard) return;
    setBusy(true);
    setError('');
    try {
      const result = await mutations.processRun.mutateAsync(run.id);
      setProcessSummary(result.processing_summary ?? null);
      void payslipCountQuery.refetch();
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Process failed.');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!run?.id) return;
    setBusy(true);
    setError('');
    try {
      const updated = await mutations.approveRun.mutateAsync(run.id);
      setRun(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  };

  const unapprove = async () => {
    if (!run?.id) return;
    setBusy(true);
    setError('');
    try {
      const updated = await mutations.unapproveRun.mutateAsync(run.id);
      setRun(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unapprove failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-black text-app-text">Payroll wizard</h2>
        <p className="text-sm text-app-muted">
          Attendance summaries → process payslips → approve → pay from Payroll Cycle.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`px-2 py-1 rounded-lg text-xs font-semibold ${i === step ? 'bg-violet-100 text-violet-800' : 'bg-app-muted/10 text-app-muted'}`}
          >
            {i + 1}. {label}
          </span>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {step === 0 && (
        <PayrollPeriodStep
          month={month}
          year={year}
          onMonthChange={setMonth}
          onYearChange={setYear}
          onContinue={() => void startPeriod()}
          busy={busy}
        />
      )}
      {step === 1 && (
        <>
          <AttendanceReviewStep items={items} loading={previewQuery.isLoading} />
          <button type="button" onClick={() => setStep(2)} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold">Next: LOP review</button>
        </>
      )}
      {step === 2 && (
        <>
          <LOPReviewStep items={items} loading={previewQuery.isLoading} />
          <button type="button" onClick={() => setStep(3)} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold">Next: Preview</button>
        </>
      )}
      {step === 3 && (
        <>
          <PayrollPreviewStep items={impactQuery.data?.items ?? []} loading={impactQuery.isLoading} />
          <button type="button" onClick={() => setStep(4)} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold">Next: Generate</button>
        </>
      )}
      {step === 4 && (
        <div className="space-y-3 max-w-lg">
          <h3 className="text-lg font-bold">Generate payroll attendance summaries</h3>
          <p className="text-sm text-app-muted">
            Persists summaries for {month}/{year} and sets run status to GENERATED.
          </p>
          {canWritePayroll && (
            <label className="flex items-start gap-2 text-sm text-amber-800">
              <input
                type="checkbox"
                checked={forceOverride}
                onChange={(e) => setForceOverride(e.target.checked)}
                className="mt-1"
              />
              <span>
                Admin override: regenerate summaries even if payslips already exist for this period (may leave
                stale payslips until reprocessed).
              </span>
            </label>
          )}
          <button
            type="button"
            disabled={busy || !canRunWizard}
            onClick={() => void generate()}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            Generate summaries
          </button>
        </div>
      )}
      {step === 5 && (
        <ProcessStep
          run={run}
          canProcess={canRunWizard}
          payslipCount={payslipCount}
          onProcess={() => void processPayslips()}
          busy={busy}
          error={error}
          lastSummary={processSummary}
        />
      )}
      {step === 6 && (
        <ApprovalStep
          run={run}
          payslipCount={payslipCount}
          canApprove={canApprovePayrollRun}
          onApprove={() => void approve()}
          onUnapprove={() => void unapprove()}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
};

export default PayrollWizard;

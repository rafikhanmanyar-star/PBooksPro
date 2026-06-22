import { useCallback, useState } from 'react';
import { formatApiErrorMessage } from '../../../services/api/client';
import type { PayrollRun } from '../types';
import { isPayrollRunCreator, mapPayrollApprovalErrorMessage } from '../utils/payrollApprovalSod';
import { usePayrollAttendanceMutations } from '../wizard/hooks/usePayrollWizardQueries';

type Options = {
  onRunUpdated?: (run: PayrollRun) => void;
  onAfterMutation?: () => void | Promise<void>;
};

export function usePayrollRunApprovalController(options?: Options) {
  const mutations = usePayrollAttendanceMutations();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const approve = useCallback(
    async (run: PayrollRun, currentUserId: string | null | undefined) => {
      if (!run?.id) return undefined;
      if (isPayrollRunCreator(run, currentUserId)) return undefined;
      setBusy(true);
      setError('');
      try {
        const updated = await mutations.approveRun.mutateAsync(run.id);
        options?.onRunUpdated?.(updated);
        await options?.onAfterMutation?.();
        return updated;
      } catch (e) {
        setError(mapPayrollApprovalErrorMessage(formatApiErrorMessage(e)));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [mutations, options]
  );

  const unapprove = useCallback(
    async (run: PayrollRun) => {
      if (!run?.id) return undefined;
      setBusy(true);
      setError('');
      try {
        const updated = await mutations.unapproveRun.mutateAsync(run.id);
        options?.onRunUpdated?.(updated);
        await options?.onAfterMutation?.();
        return updated;
      } catch (e) {
        setError(mapPayrollApprovalErrorMessage(formatApiErrorMessage(e)));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [mutations, options]
  );

  return {
    approve,
    unapprove,
    busy,
    error,
    setError,
    clearError: () => setError(''),
  };
}

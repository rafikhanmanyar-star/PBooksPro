import { useCallback, useRef, useState } from 'react';
import { useNotification } from '../context/NotificationContext';
import { formatApiErrorMessage } from '../utils/formatApiErrorMessage';
import { notifyDuplicateRecordIfApplicable } from '../services/dbErrorNotification';

export interface SubmitGuardOptions<T> {
  /** Shown via showProgress while the operation runs. */
  progressMessage?: string;
  /** Toast on success (default: "Record saved successfully"). */
  successMessage?: string;
  /** Toast on failure (default: "Save failed. Please try again."). */
  errorMessage?: string;
  /** When false, skip success toast. */
  showSuccessToast?: boolean;
  /** When false, skip error toast (caller handles errors). */
  showErrorToast?: boolean;
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
}

const DEFAULT_SUCCESS = 'Record saved successfully';
const DEFAULT_ERROR = 'Save failed. Please try again.';

/**
 * Reusable submit lock: disables UI via isSubmitting, ignores duplicate calls,
 * shows progress overlay + toasts, and surfaces DUPLICATE_RECORD errors.
 */
export function useSubmitGuard() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lockRef = useRef(false);
  const { showToast, showProgress, hideProgress } = useNotification();

  const guardSubmit = useCallback(
    async <T>(fn: () => Promise<T>, options: SubmitGuardOptions<T> = {}): Promise<T | undefined> => {
      if (lockRef.current) return undefined;
      lockRef.current = true;
      setIsSubmitting(true);

      const progressMsg = options.progressMessage ?? 'Saving record...\nPlease wait.';
      showProgress(progressMsg);

      try {
        const result = await fn();
        if (options.showSuccessToast !== false) {
          showToast(options.successMessage ?? DEFAULT_SUCCESS, 'success');
        }
        options.onSuccess?.(result);
        return result;
      } catch (error) {
        if (notifyDuplicateRecordIfApplicable(error)) {
          options.onError?.(error);
          return undefined;
        }
        if (options.showErrorToast !== false) {
          const msg = formatApiErrorMessage(error);
          showToast(
            options.errorMessage ? `${options.errorMessage}\n${msg}` : `${DEFAULT_ERROR}\n${msg}`,
            'error'
          );
        }
        options.onError?.(error);
        return undefined;
      } finally {
        hideProgress();
        lockRef.current = false;
        setIsSubmitting(false);
      }
    },
    [showToast, showProgress, hideProgress]
  );

  return { isSubmitting, guardSubmit };
}

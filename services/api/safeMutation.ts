import { formatApiErrorMessage } from './client';
import type { ToastActionOptions } from '../../context/NotificationContext';

type ShowToast = (message: string, type?: 'success' | 'error' | 'info' | 'warning', actionOptions?: ToastActionOptions) => void;

/**
 * Runs an API call once; on failure shows an error toast with Retry (same operation).
 * On success, optionally shows success toast and runs onSuccess (e.g. refetch from server).
 */
export async function runApiWithRetryToast<T>(
  operation: () => Promise<T>,
  showToast: ShowToast,
  options?: {
    successMessage?: string;
    onSuccess?: (value: T) => void | Promise<void>;
  }
): Promise<T | undefined> {
  const attempt = async (): Promise<T | undefined> => {
    try {
      const value = await operation();
      if (options?.successMessage) {
        showToast(options.successMessage, 'success');
      }
      await options?.onSuccess?.(value);
      return value;
    } catch (e) {
      const msg = formatApiErrorMessage(e);
      showToast(msg, 'error', {
        onRetry: () => {
          void attempt();
        },
      });
      return undefined;
    }
  };
  return attempt();
}

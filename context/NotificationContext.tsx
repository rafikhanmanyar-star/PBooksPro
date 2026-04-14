
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import { ICONS } from '../constants';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { useAppContext } from './AppContext';
import { useAuth } from './AuthContext';
import { PBOOKS_DB_ERROR_EVENT, type DbErrorNotificationDetail } from '../services/dbErrorNotification';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface ToastActionOptions {
  onRetry?: () => void;
  retryLabel?: string;
}

interface Toast {
  id: string;
  message: string;
  type: NotificationType;
  onRetry?: () => void;
  retryLabel?: string;
}

interface DialogOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface NotificationContextType {
  showToast: (message: string, type?: NotificationType, actionOptions?: ToastActionOptions) => void;
  showAlert: (message: string, options?: DialogOptions) => Promise<void>;
  showConfirm: (message: string, options?: DialogOptions) => Promise<boolean>;
  showProgress: (message: string) => void;
  hideProgress: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Helper to play a quick success beep using AudioContext
const playSuccessSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // "Ding" sound: High pitch sine wave ramping down quickly
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1); // Drop pitch

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { state } = useAppContext();
  const { isAuthenticated } = useAuth();
  // --- Toast State ---
  const [toasts, setToasts] = useState<Toast[]>([]);

  // --- Dialog State ---
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    message: string;
    options: DialogOptions;
    resolve: (value: any) => void;
  } | null>(null);

  // --- Progress overlay (e.g. "Creating invoices") ---
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // --- Toast Logic ---
  const showToast = useCallback((message: string, type: NotificationType = 'success', actionOptions?: ToastActionOptions) => {
    const id = Date.now().toString() + Math.random().toString();
    const onRetry = actionOptions?.onRetry;
    const retryLabel = actionOptions?.retryLabel ?? 'Retry';
    setToasts((prev) => [...prev, { id, message, type, onRetry, retryLabel }]);

    if (type === 'success' && state.enableBeepOnSave) {
      playSuccessSound();
    }

    const dismissMs = type === 'error' && onRetry ? 12_000 : 3000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, dismissMs);
  }, [state.enableBeepOnSave]);

  // Listen for sync warning events
  useEffect(() => {
    const handleSyncWarning = (event: CustomEvent) => {
      const { message, type } = event.detail;
      showToast(message, type || 'info');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('show-sync-warning', handleSyncWarning as EventListener);
      return () => {
        window.removeEventListener('show-sync-warning', handleSyncWarning as EventListener);
      };
    }
  }, [showToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // --- Dialog Logic ---
  const showAlert = useCallback((message: string, options: DialogOptions = {}) => {
    return new Promise<void>((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'alert',
        message,
        options,
        resolve: () => {
          setDialogState(null);
          resolve();
        },
      });
    });
  }, []);

  // Local DB / API conflict errors dispatched from services (must run after showAlert exists)
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<DbErrorNotificationDetail>;
      const d = ce.detail;
      if (d?.message) {
        void showAlert(d.message, { title: d.title || 'Could not save' });
      }
    };
    window.addEventListener(PBOOKS_DB_ERROR_EVENT, handler as EventListener);
    return () => window.removeEventListener(PBOOKS_DB_ERROR_EVENT, handler as EventListener);
  }, [showAlert]);

  const showConfirm = useCallback((message: string, options: DialogOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setDialogState({
        isOpen: true,
        type: 'confirm',
        message,
        options,
        resolve: (result: boolean) => {
          setDialogState(null);
          resolve(result);
        },
      });
    });
  }, []);

  const showProgress = useCallback((message: string) => {
    setProgressMessage(message);
  }, []);

  const hideProgress = useCallback(() => {
    setProgressMessage(null);
  }, []);

  /**
   * Full-screen progress sits above the entire app (z-[10000]). If it stays open after logout
   * or when the sign-in screen mounts, it blocks all clicks on username/password. Clear it
   * whenever there is no authenticated session.
   */
  useEffect(() => {
    if (!isAuthenticated) {
      setProgressMessage(null);
    }
  }, [isAuthenticated]);

  const handleDialogClose = (result: boolean) => {
    if (dialogState) {
      dialogState.resolve(result);
    }
  };

  const contextValue = useMemo(() => ({
    showToast, showAlert, showConfirm, showProgress, hideProgress,
  }), [showToast, showAlert, showConfirm, showProgress, hideProgress]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[110] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-fade-in-down ${toast.type === 'success' ? 'bg-emerald-600' :
                toast.type === 'error' ? 'bg-rose-600' :
                  toast.type === 'warning' ? 'bg-amber-500' : 'bg-slate-700'
              }`}
          >
            <div className="flex-shrink-0">
              {toast.type === 'success' && <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">✓</div>}
              {toast.type === 'error' && <div className="w-5 h-5">{ICONS.alertTriangle}</div>}
              {toast.type === 'warning' && <div className="w-5 h-5">{ICONS.alertTriangle || '⚠'}</div>}
              {toast.type === 'info' && <div className="w-5 h-5">ℹ</div>}
            </div>
            <p className="flex-grow">{toast.message}</p>
            {toast.type === 'error' && toast.onRetry && (
              <button
                type="button"
                className="flex-shrink-0 px-2 py-1 text-xs font-semibold bg-white/20 rounded hover:bg-white/30"
                onClick={() => {
                  toast.onRetry?.();
                }}
              >
                {toast.retryLabel ?? 'Retry'}
              </button>
            )}
            <button onClick={() => removeToast(toast.id)} className="opacity-70 hover:opacity-100">
              <div className="w-4 h-4">{ICONS.x}</div>
            </button>
          </div>
        ))}
      </div>

      {/* Dialog Modal - solid backdrop so it doesn't look translucent over other modals */}
      {dialogState && (
        <Modal
          isOpen={dialogState.isOpen}
          onClose={() => handleDialogClose(false)}
          title={dialogState.options.title || (dialogState.type === 'confirm' ? 'Please Confirm' : 'Alert')}
          size="md"
          backdropClassName="bg-black/90"
        >
          <div className="space-y-6 bg-white">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-slate-700 text-base leading-relaxed whitespace-pre-wrap">{dialogState.message}</p>
            </div>

            <div className="flex justify-end gap-3">
              {dialogState.type === 'confirm' && (
                <Button variant="secondary" onClick={() => handleDialogClose(false)}>
                  {dialogState.options.cancelLabel || 'Cancel'}
                </Button>
              )}
              <Button onClick={() => handleDialogClose(true)}>
                {dialogState.options.confirmLabel || 'OK'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Progress overlay - full-screen "Creating invoices" style */}
      {progressMessage && (
        <div className="fixed inset-0 bg-black/85 z-[10000] flex flex-col items-center justify-center p-4 animate-fade-in-fast">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-6 sm:p-8 max-w-sm w-full text-center">
            <p className="text-slate-800 font-semibold text-lg mb-4">{progressMessage}</p>
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-indigo-600 rounded-full animate-progress-bar" />
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
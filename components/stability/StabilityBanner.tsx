import React, { useEffect, useState } from 'react';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { clearSafeModeAndReset, isSafeModeEnabled } from '../../services/stability/stabilityLayer';

/**
 * Enterprise stability notices: safe mode after repeated errors, recovery after unclean exit.
 */
const StabilityBanner: React.FC = () => {
  const [safeMode, setSafeMode] = useState(false);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!isLocalOnlyMode()) return;
    setSafeMode(isSafeModeEnabled());

    const onSafe = () => setSafeMode(true);
    const onCleared = () => setSafeMode(false);
    const onRecovery = () => setRecovery(true);
    window.addEventListener('pbooks-safe-mode', onSafe);
    window.addEventListener('pbooks-safe-mode-cleared', onCleared);
    window.addEventListener('pbooks-recovery-notice', onRecovery);
    return () => {
      window.removeEventListener('pbooks-safe-mode', onSafe);
      window.removeEventListener('pbooks-safe-mode-cleared', onCleared);
      window.removeEventListener('pbooks-recovery-notice', onRecovery);
    };
  }, []);

  if (!isLocalOnlyMode()) return null;

  if (!safeMode && !recovery) return null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 text-amber-950 dark:text-amber-100 text-sm shrink-0 z-[100]">
      {safeMode && (
        <p className="flex-1">
          <strong>Safe mode:</strong> The app detected repeated errors (often after a failed screen load). If you have
          rebuilt or updated the app, use <strong>Dismiss</strong> below. Use Backup &amp; Restore only if crashes
          continue.
        </p>
      )}
      {recovery && (
        <p className="flex-1">
          <strong>Previous session did not exit cleanly.</strong> If anything looks wrong, use Settings → Backup &amp;
          Restore.
        </p>
      )}
      {safeMode && (
        <button
          type="button"
          onClick={() => {
            clearSafeModeAndReset();
            setSafeMode(false);
          }}
          className="shrink-0 px-3 py-1.5 rounded-md bg-amber-200/90 dark:bg-amber-800/80 text-amber-950 dark:text-amber-50 text-sm font-medium hover:bg-amber-300 dark:hover:bg-amber-700 border border-amber-300 dark:border-amber-700"
        >
          Dismiss safe mode
        </button>
      )}
    </div>
  );
};

export default StabilityBanner;

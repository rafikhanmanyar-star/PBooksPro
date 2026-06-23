import React from 'react';
import { useBootstrapSoftFailure } from '../../hooks/useSelectiveState';

/**
 * Non-blocking banner when primary bootstrap exhausted retries but the app shell remains usable.
 */
const BootstrapRecoveryBanner: React.FC = () => {
  const { active, message } = useBootstrapSoftFailure();
  if (!active) return null;

  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2 text-sm shadow-md"
    >
      <span className="font-medium">{message ?? 'Some data could not be loaded. Retrying in background.'}</span>
    </div>
  );
};

export default BootstrapRecoveryBanner;

import React, { useMemo } from 'react';
import { useBreakGlassSession } from '../../hooks/useBreakGlassSession';

const BreakGlassBanner: React.FC = () => {
  const { status, enabled, deactivate } = useBreakGlassSession();

  const expiresLabel = useMemo(() => {
    if (!status.expiresAt) return '';
    try {
      return new Date(status.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return status.expiresAt;
    }
  }, [status.expiresAt]);

  if (!enabled || !status.active) return null;

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950"
      role="status"
      aria-live="polite"
    >
      <div>
        <strong>Break-glass active</strong>
        <span className="ml-2 text-amber-900">
          Emergency SYSTEM_OWNER session — all actions are audited as system_owner. Expires {expiresLabel}.
        </span>
      </div>
      <button
        type="button"
        className="rounded border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100"
        onClick={() => void deactivate()}
      >
        End session
      </button>
    </div>
  );
};

export default BreakGlassBanner;

import React from 'react';

type Props = {
  mode: 'self' | 'other';
  otherEditorName?: string | null;
  currentUserName?: string | null;
};

const RecordLockBanner: React.FC<Props> = ({ mode, otherEditorName, currentUserName }) => {
  if (mode === 'self') {
    return (
      <div className="lock-banner rounded-lg border border-ds-success/30 bg-[color:var(--badge-paid-bg)] px-3 py-2 text-sm text-app-text flex flex-wrap items-center gap-2 mb-2 flex-shrink-0">
        <span className="w-2 h-2 rounded-full bg-ds-success animate-pulse" aria-hidden />
        <span>
          Editing by you{currentUserName ? ` (${currentUserName})` : ''}
        </span>
      </div>
    );
  }
  return (
    <div className="lock-banner rounded-lg border border-ds-danger/30 bg-[color:var(--badge-unpaid-bg)] px-3 py-2 text-sm text-app-text flex flex-wrap items-center gap-2 mb-2 flex-shrink-0">
      <span className="w-2 h-2 rounded-full bg-ds-danger" aria-hidden />
      <span>
        Locked by {otherEditorName ?? 'another user'} — view only
      </span>
    </div>
  );
};

export default RecordLockBanner;

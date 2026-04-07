import React from 'react';

type Props = {
  mode: 'self' | 'other';
  otherEditorName?: string | null;
  currentUserName?: string | null;
};

const RecordLockBanner: React.FC<Props> = ({ mode, otherEditorName, currentUserName }) => {
  if (mode === 'self') {
    return (
      <div className="lock-banner rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 flex flex-wrap items-center gap-2">
        <span aria-hidden>🟢</span>
        <span>
          Editing by you{currentUserName ? ` (${currentUserName})` : ''}
        </span>
      </div>
    );
  }
  return (
    <div className="lock-banner rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 flex flex-wrap items-center gap-2">
      <span aria-hidden>🔴</span>
      <span>
        Locked by {otherEditorName ?? 'another user'} — view only
      </span>
    </div>
  );
};

export default RecordLockBanner;

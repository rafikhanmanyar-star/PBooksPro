import React from 'react';

interface Props {
  errors: string[];
  onOpenSettingsBackup?: () => void;
}

const SchemaBlockedScreen: React.FC<Props> = ({ errors, onOpenSettingsBackup }) => {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900 text-white p-6">
      <div className="max-w-lg text-center space-y-4">
        <h1 className="text-2xl font-semibold">Database cannot be used safely</h1>
        <p className="text-slate-300 text-sm leading-relaxed">
          The local database failed integrity or schema checks. To protect your data, the app is blocked until the problem is resolved.
        </p>
        {errors.length > 0 && (
          <ul className="text-left text-sm bg-slate-800/80 rounded-lg p-4 list-disc list-inside space-y-1 text-amber-100">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        <div className="text-sm text-slate-400 space-y-2">
          <p>Try restoring from a recent backup (Settings → Backup &amp; Restore), or contact support with a copy of the log.</p>
        </div>
        {onOpenSettingsBackup && (
          <button
            type="button"
            onClick={onOpenSettingsBackup}
            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium"
          >
            Open Backup &amp; Restore
          </button>
        )}
      </div>
    </div>
  );
};

export default SchemaBlockedScreen;

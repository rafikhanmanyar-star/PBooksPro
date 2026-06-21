import React from 'react';

interface AccessDeniedProps {
  /** Optional: the specific permission key that was required. */
  requiredPermission?: string;
  /** Optional: human-readable module name for the message. */
  moduleName?: string;
  onGoHome?: () => void;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({ requiredPermission, moduleName, onGoHome }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>

      <p className="text-slate-400 text-sm max-w-sm mb-1">
        You do not have permission to access{' '}
        {moduleName ? <span className="text-slate-300 font-medium">{moduleName}</span> : 'this module'}.
      </p>

      {requiredPermission && (
        <p className="text-slate-500 text-xs mt-1 mb-6">
          Required permission:{' '}
          <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
            {requiredPermission}
          </code>
        </p>
      )}

      {!requiredPermission && <div className="mb-6" />}

      <p className="text-slate-500 text-xs mb-6">
        Contact your administrator if you believe this is an error.
      </p>

      {onGoHome && (
        <button
          type="button"
          onClick={onGoHome}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          Return Home
        </button>
      )}
    </div>
  );
};

export default AccessDenied;

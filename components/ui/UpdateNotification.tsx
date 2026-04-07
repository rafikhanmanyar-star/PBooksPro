import React, { useState } from 'react';
import { useUpdate } from '../../context/UpdateContext';
import { Download, CheckCircle, RefreshCw, X, AlertCircle, ExternalLink } from 'lucide-react';

const UpdateNotification: React.FC = () => {
  const {
    updateAvailable,
    updateDownloaded,
    updateInfo,
    downloadProgress,
    error,
    unavailableReleasesUrl,
    checkForUpdates,
    startDownload,
    installUpdate,
    isElectronUpdate,
  } = useUpdate();

  const [isDismissed, setIsDismissed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  if (!isElectronUpdate) return null;
  if (isDismissed && !updateDownloaded) return null;
  if (!updateAvailable && !updateDownloaded && !error && !downloadProgress) return null;

  if (updateDownloaded && updateInfo) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-slide-in-up">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500">
            <div className="flex items-center gap-2 text-white">
              <CheckCircle className="w-4 h-4" />
              <span className="font-semibold text-sm">Update Ready</span>
            </div>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-sm text-slate-700 mb-2">
              Version <span className="font-semibold">{updateInfo.version}</span> has been downloaded and is ready to install.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              The update will be applied when you close the app, or you can restart now.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  if (isRestarting) return;
                  setIsRestarting(true);
                  try {
                    const result = await installUpdate();
                    if (!result.ok && result.error) {
                      alert(result.error);
                    }
                  } finally {
                    setIsRestarting(false);
                  }
                }}
                disabled={isRestarting}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-70 disabled:cursor-wait text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Saving data…' : 'Restart Now'}
              </button>
              <button
                onClick={() => setIsDismissed(true)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
              >
                Install on Quit
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (downloadProgress) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-slide-in-up">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500">
            <div className="flex items-center gap-2 text-white">
              <Download className="w-4 h-4 animate-pulse" />
              <span className="font-semibold text-sm">Downloading Update</span>
            </div>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!isMinimized && (
            <div className="px-4 py-3">
              <div className="space-y-1">
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
                <p className="text-center text-xs font-medium text-indigo-600">
                  {downloadProgress.percent.toFixed(1)}% complete
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (updateAvailable && updateInfo) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-slide-in-up">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500">
            <div className="flex items-center gap-2 text-white">
              <Download className="w-4 h-4" />
              <span className="font-semibold text-sm">Update Available</span>
            </div>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-sm text-slate-700 mb-4">
              Version <span className="font-semibold">{updateInfo.version}</span> is available.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => startDownload()}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download & Install
              </button>
              <button
                onClick={() => setIsDismissed(true)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const isUnavailable = !!unavailableReleasesUrl || error.includes('development build') || error.includes('not available in this build');
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-slide-in-up">
        <div className={`bg-white rounded-xl shadow-2xl border overflow-hidden ${isUnavailable ? 'border-slate-200' : 'border-red-200'}`}>
          <div className={`flex items-center justify-between px-4 py-3 ${isUnavailable ? 'bg-gradient-to-r from-slate-500 to-slate-600' : 'bg-gradient-to-r from-red-500 to-rose-500'}`}>
            <div className="flex items-center gap-2 text-white">
              {isUnavailable ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span className="font-semibold text-sm">{isUnavailable ? 'Updates' : 'Update Error'}</span>
            </div>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-3">
            <p className={`text-sm mb-4 ${isUnavailable ? 'text-slate-700' : 'text-rose-600'}`}>{error}</p>
            <div className="flex flex-wrap gap-2">
              {unavailableReleasesUrl && (
                <button
                  onClick={() => window.open(unavailableReleasesUrl, '_blank', 'noopener,noreferrer')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-600 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open latest release
                </button>
              )}
              <button
                onClick={() => {
                  checkForUpdates();
                  setIsDismissed(false);
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {isUnavailable ? 'Check again' : 'Try Again'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default UpdateNotification;

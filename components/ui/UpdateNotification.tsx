import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, X, CheckCircle, AlertCircle, ArrowDownToLine, Clock } from 'lucide-react';
import { useUpdate } from '../../context/UpdateContext';

// TypeScript declarations for the Electron API
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getAppVersion: () => Promise<string>;
      getPlatform: () => string;
    };
  }
}

const UpdateNotification: React.FC = () => {
  const {
    isChecking,
    updateAvailable,
    updateDownloaded,
    updateInfo,
    downloadProgress,
    error,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useUpdate();

  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Get current app version
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.getAppVersion().then(setCurrentVersion);
    }
  }, [isElectron]);

  // Show notification when updates are available or downloaded
  useEffect(() => {
    if (updateAvailable || updateDownloaded || error) {
      setIsVisible(true);
      setIsDismissed(false);
    }
  }, [updateAvailable, updateDownloaded, error]);

  // Don't render if not in Electron
  if (!isElectron) return null;

  // Don't render if dismissed or nothing to show
  if (isDismissed || (!updateAvailable && !updateDownloaded && !error && !isChecking)) {
    return null;
  }

  // Update downloaded - show notification with seamless install option
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
            
            <div className="flex gap-2">
              <button
                onClick={() => installUpdate(true)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Restart Now
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

  // Download in progress
  if (downloadProgress) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-slide-in-up">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-500">
            <div className="flex items-center gap-2 text-white">
              <Download className="w-4 h-4 animate-pulse" />
              <span className="font-semibold text-sm">Downloading Update</span>
            </div>
            {isMinimized ? (
              <button
                onClick={() => setIsMinimized(false)}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
              >
                <Clock className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setIsMinimized(true)}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {!isMinimized && (
            <div className="px-4 py-3">
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}</span>
                  <span>{formatBytes(downloadProgress.bytesPerSecond)}/s</span>
                </div>
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

  // Update available - show notification (auto-download will start)
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
            <p className="text-sm text-slate-700 mb-2">
              Version <span className="font-semibold">{updateInfo.version}</span> is available.
            </p>
            {updateInfo.releaseNotes && (
              <p className="text-xs text-slate-500 mb-4 line-clamp-2">
                {updateInfo.releaseNotes}
              </p>
            )}
            <p className="text-xs text-slate-500 mb-4">
              Downloading in the background...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] animate-slide-in-up">
        <div className="bg-white rounded-xl shadow-2xl border border-red-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-red-500 to-rose-500">
            <div className="flex items-center gap-2 text-white">
              <AlertCircle className="w-4 h-4" />
              <span className="font-semibold text-sm">Update Error</span>
            </div>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="px-4 py-3">
            <p className="text-sm text-rose-600 mb-4">{error}</p>
            <button
              onClick={() => {
                checkForUpdates();
                setIsDismissed(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default UpdateNotification;


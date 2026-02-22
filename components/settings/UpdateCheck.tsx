import React, { useState, useEffect, useCallback } from 'react';
import { usePWA } from '../../context/PWAContext';
import { useUpdate } from '../../context/UpdateContext';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';
import { RefreshCw, CheckCircle, AlertCircle, Download, ArrowDownToLine, Copy } from 'lucide-react';
import packageJson from '../../package.json';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

const UpdateCheck: React.FC = () => {
  const { isUpdateAvailable, checkForUpdates: pwaCheckForUpdates, applyUpdate } = usePWA();
  const {
    isChecking: electronChecking,
    updateAvailable: electronUpdateAvailable,
    updateDownloaded: electronUpdateDownloaded,
    updateInfo: electronUpdateInfo,
    downloadProgress: electronDownloadProgress,
    error: electronError,
    checkForUpdates: electronCheckForUpdates,
    installUpdate: electronInstallUpdate,
    isElectronUpdate,
  } = useUpdate();
  const { showConfirm, showToast } = useNotification();

  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const currentVersion = packageJson.version;

  // Sync Electron update state into local status
  useEffect(() => {
    if (!isElectronUpdate) return;

    if (electronChecking) {
      setStatus('checking');
    } else if (electronUpdateDownloaded) {
      setStatus('downloaded');
    } else if (electronError) {
      setStatus('error');
      setError(electronError);
      setErrorDetails(electronError);
    } else if (electronDownloadProgress) {
      setStatus('downloading');
    } else if (electronUpdateAvailable) {
      setStatus('available');
    } else if (!electronChecking && !electronUpdateAvailable && status === 'checking') {
      setStatus('not-available');
    }
  }, [isElectronUpdate, electronChecking, electronUpdateAvailable, electronUpdateDownloaded, electronDownloadProgress, electronError, status]);

  // PWA update detection
  useEffect(() => {
    if (isElectronUpdate) return;
    if (isUpdateAvailable && status === 'idle') {
      setStatus('available');
    }
  }, [isUpdateAvailable, status, isElectronUpdate]);

  const handleCheckForUpdates = useCallback(async () => {
    setStatus('checking');
    setError(null);
    setErrorDetails(null);
    showToast("Checking for updates...", "info");

    if (isElectronUpdate) {
      electronCheckForUpdates();
      // Fallback timeout: Render free tier cold starts can take 30-45s
      setTimeout(() => {
        setStatus((prev) => (prev === 'checking' ? 'not-available' : prev));
      }, 60000);
    } else {
      try {
        await pwaCheckForUpdates();
        setTimeout(() => {
          if (isUpdateAvailable) {
            setStatus('available');
          } else {
            setStatus('not-available');
            setTimeout(() => setStatus('idle'), 3000);
          }
        }, 1500);
      } catch (err) {
        setStatus('error');
        const errorMessage = err instanceof Error ? err.message : 'Failed to check for updates';
        setError(errorMessage);
        setErrorDetails(err instanceof Error ? (err.stack || err.message) : String(err));
      }
    }
  }, [isElectronUpdate, electronCheckForUpdates, pwaCheckForUpdates, isUpdateAvailable, showToast]);

  const handleInstall = useCallback(async () => {
    if (isElectronUpdate) {
      const confirm = await showConfirm(
        "The update has been downloaded. The app will restart to apply the update. Continue?",
        { title: "Install Update", confirmLabel: "Restart & Install" }
      );
      if (confirm) {
        electronInstallUpdate();
      }
    } else {
      const confirm = await showConfirm("A new version of the app is available. Update now?", {
        title: "Update Available",
        confirmLabel: "Update & Reload",
      });
      if (confirm) {
        applyUpdate();
      }
    }
  }, [isElectronUpdate, showConfirm, electronInstallUpdate, applyUpdate]);

  const handleCopyError = useCallback(async () => {
    const errorText = errorDetails || error || 'No error details available';
    const fullErrorText = `Update Error Details\n` +
      `===================\n` +
      `Version: ${currentVersion}\n` +
      `Platform: ${isElectronUpdate ? 'Electron' : 'Web/PWA'}\n` +
      `Status: ${status}\n` +
      `Error: ${error || 'Unknown error'}\n` +
      `\nDetails:\n${errorText}\n` +
      `\nTimestamp: ${new Date().toISOString()}`;

    try {
      await navigator.clipboard.writeText(fullErrorText);
      showToast('Error details copied to clipboard', 'success');
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = fullErrorText;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showToast('Error details copied to clipboard', 'success');
      } catch (e) {
        showToast('Failed to copy error details', 'error');
      }
      document.body.removeChild(textArea);
    }
  }, [error, errorDetails, currentVersion, status, showToast, isElectronUpdate]);

  return (
    <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50" data-update-section>
      <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
        </svg>
        Application Updates
      </h4>

      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          <span className="font-medium">Current Version:</span> {currentVersion || 'Unknown'}
          {isElectronUpdate && (
            <span className="ml-2 text-xs text-slate-400">(Desktop)</span>
          )}
        </div>

        {status === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Checking for updates...</span>
          </div>
        )}

        {status === 'available' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Download className="w-4 h-4 text-emerald-600" />
              <span className="font-medium text-emerald-700">
                {electronUpdateInfo
                  ? `Version ${electronUpdateInfo.version} is available`
                  : 'An update is available'}
              </span>
            </div>
            {isElectronUpdate ? (
              <p className="text-xs text-slate-500">Downloading in background...</p>
            ) : (
              <Button onClick={handleInstall} className="w-full sm:w-auto">
                <RefreshCw className="w-4 h-4 mr-2" />
                Update & Reload
              </Button>
            )}
          </div>
        )}

        {status === 'downloading' && electronDownloadProgress && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <ArrowDownToLine className="w-4 h-4 animate-bounce" />
              <span>Downloading update...</span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out"
                style={{ width: `${electronDownloadProgress.percent}%` }}
              />
            </div>
            <p className="text-center text-xs font-medium text-indigo-600">
              {electronDownloadProgress.percent.toFixed(1)}% complete
            </p>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="font-medium text-emerald-700">
                {electronUpdateInfo
                  ? `Version ${electronUpdateInfo.version} downloaded. Ready to install.`
                  : 'Update downloaded. Ready to install.'}
              </span>
            </div>
            <Button onClick={handleInstall} variant="primary" className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              Restart & Install
            </Button>
          </div>
        )}

        {status === 'not-available' && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>You're running the latest version.</span>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-rose-800 mb-1">
                    {error || 'An error occurred while checking for updates.'}
                  </div>
                  {errorDetails && (
                    <pre className="text-xs text-rose-700 bg-rose-100 p-2 rounded mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                      {errorDetails}
                    </pre>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  onClick={handleCopyError}
                  variant="secondary"
                  className="text-xs py-1 px-2 h-auto"
                  title="Copy error details to clipboard"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy Error Log
                </Button>
                <Button
                  onClick={handleCheckForUpdates}
                  variant="secondary"
                  className="text-xs py-1 px-2 h-auto"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {(status === 'idle' || status === 'not-available') && (
          <Button onClick={handleCheckForUpdates} variant="secondary" className="w-full sm:w-auto">
            <RefreshCw className="w-4 h-4 mr-2" />
            Check for Updates
          </Button>
        )}
      </div>
    </div>
  );
};

export default UpdateCheck;

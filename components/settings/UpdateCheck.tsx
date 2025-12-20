import React, { useState, useEffect, useCallback } from 'react';
import { usePWA } from '../../context/PWAContext';
import { useNotification } from '../../context/NotificationContext';
import Button from '../ui/Button';
import { RefreshCw, CheckCircle, AlertCircle, Download, ArrowDownToLine, Copy } from 'lucide-react';
import packageJson from '../../package.json';

// TypeScript declarations for the Electron API
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<{ success: boolean; updateAvailable?: boolean; version?: string; error?: string }>;
      downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
      installUpdate: (immediate?: boolean) => Promise<{ success: boolean; error?: string }>;
      onUpdateChecking: (callback: () => void) => () => void;
      onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
      onUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void;
      onUpdateError: (callback: (error: { message: string }) => void) => () => void;
      onDownloadProgress: (callback: (progress: { bytesPerSecond: number; percent: number; transferred: number; total: number }) => void) => () => void;
      onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
      onOpenUpdateSettings: (callback: () => void) => () => void;
    };
  }
}

interface UpdateInfo {
  version: string;
}

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

const UpdateCheck: React.FC = () => {
  const { isUpdateAvailable, checkForUpdates, applyUpdate } = usePWA();
  const { showConfirm, showToast } = useNotification();
  
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  
  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  // Get current app version
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.getAppVersion().then(setCurrentVersion);
    } else {
      // For PWA, use version from package.json
      setCurrentVersion(packageJson.version);
    }
  }, [isElectron]);

  // Set up event listeners for Electron update events
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    const cleanupFns: (() => void)[] = [];

    cleanupFns.push(
      window.electronAPI.onUpdateChecking(() => {
        setStatus('checking');
        setError(null);
        setErrorDetails(null);
      })
    );

    cleanupFns.push(
      window.electronAPI.onUpdateAvailable((info) => {
        setStatus('available');
        setUpdateInfo(info);
      })
    );

    cleanupFns.push(
      window.electronAPI.onUpdateNotAvailable(() => {
        setStatus('not-available');
        setTimeout(() => {
          if (status === 'not-available') setStatus('idle');
        }, 3000);
      })
    );

    cleanupFns.push(
      window.electronAPI.onUpdateError((err) => {
        setStatus('error');
        setError(err.message);
        setErrorDetails(err.stack || err.message || JSON.stringify(err, null, 2));
      })
    );

    cleanupFns.push(
      window.electronAPI.onDownloadProgress((progress) => {
        setStatus('downloading');
        setDownloadProgress({ percent: progress.percent });
      })
    );

    cleanupFns.push(
      window.electronAPI.onUpdateDownloaded((info) => {
        setStatus('downloaded');
        setUpdateInfo(info);
      })
    );

    return () => {
      cleanupFns.forEach(cleanup => cleanup());
    };
  }, [isElectron, status]);

  // Manual check for updates
  const handleCheckForUpdates = useCallback(async () => {
    if (isElectron && window.electronAPI) {
      // Electron update check
      setStatus('checking');
      setError(null);
      setErrorDetails(null);
      try {
        await window.electronAPI.checkForUpdates();
      } catch (err) {
        setStatus('error');
        const errorMessage = err instanceof Error ? err.message : 'Failed to check for updates';
        setError(errorMessage);
        setErrorDetails(err instanceof Error ? (err.stack || err.message) : String(err));
      }
    } else {
      // PWA update check
      setStatus('checking');
      setError(null);
      setErrorDetails(null);
      showToast("Checking for updates...", "info");
      try {
        await checkForUpdates();
        // Wait a moment for service worker to detect updates
        setTimeout(() => {
          if (isUpdateAvailable) {
            setStatus('available');
            setUpdateInfo({ version: 'Latest' });
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
  }, [isElectron, checkForUpdates, isUpdateAvailable, showToast]);

  // Monitor PWA update availability
  useEffect(() => {
    if (!isElectron && isUpdateAvailable && status === 'idle') {
      setStatus('available');
      setUpdateInfo({ version: 'Latest' });
    }
  }, [isElectron, isUpdateAvailable, status]);

  // Download update (Electron only)
  const handleDownload = useCallback(async () => {
    if (!isElectron || !window.electronAPI) return;
    
    setStatus('downloading');
    setDownloadProgress({ percent: 0 });
    
    try {
      await window.electronAPI.downloadUpdate();
    } catch (err) {
      setStatus('error');
      const errorMessage = err instanceof Error ? err.message : 'Failed to download update';
      setError(errorMessage);
      setErrorDetails(err instanceof Error ? (err.stack || err.message) : String(err));
    }
  }, [isElectron]);

  // Install update
  const handleInstall = useCallback(async () => {
    if (isElectron && window.electronAPI) {
      // Electron install - show confirmation with data consistency info
      const confirmed = await showConfirm(
        `Ready to install version ${updateInfo?.version || 'new version'}.\n\n` +
        `✅ Your data and settings will be preserved\n` +
        `✅ All accounts, transactions, and configurations will remain intact\n` +
        `✅ The application will restart automatically\n\n` +
        `Would you like to install the update now?`,
        {
          title: 'Install Update',
          confirmLabel: 'Install Now',
          cancelLabel: 'Cancel'
        }
      );
      
      if (!confirmed) {
        return; // User cancelled
      }

      try {
        await window.electronAPI.installUpdate(true); // Pass true for immediate install
      } catch (err) {
        setStatus('error');
        const errorMessage = err instanceof Error ? err.message : 'Failed to install update';
        setError(errorMessage);
        setErrorDetails(err instanceof Error ? (err.stack || err.message) : String(err));
      }
    } else {
      // PWA install (apply update)
      const confirm = await showConfirm("A new version of the app is available. Update now?", { 
        title: "Update Available", 
        confirmLabel: "Update & Reload" 
      });
      if (confirm) {
        applyUpdate();
      }
    }
  }, [isElectron, showConfirm, applyUpdate]);

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Copy error to clipboard
  const handleCopyError = useCallback(async () => {
    const errorText = errorDetails || error || 'No error details available';
    const fullErrorText = `Update Error Details\n` +
      `===================\n` +
      `Version: ${currentVersion}\n` +
      `Status: ${status}\n` +
      `Error: ${error || 'Unknown error'}\n` +
      `\nDetails:\n${errorText}\n` +
      `\nTimestamp: ${new Date().toISOString()}`;
    
    try {
      await navigator.clipboard.writeText(fullErrorText);
      showToast('Error details copied to clipboard', 'success');
    } catch (err) {
      // Fallback for older browsers
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
  }, [error, errorDetails, currentVersion, status, showToast]);

  return (
    <div className="p-4 border border-slate-200 rounded-lg bg-slate-50/50" data-update-section>
      <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>
        </svg>
        Application Updates
      </h4>
      
      <div className="space-y-4">
        {/* Current Version */}
        <div className="text-sm text-slate-600">
          <span className="font-medium">Current Version:</span> {currentVersion || 'Unknown'}
        </div>

        {/* Status Display */}
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
                {updateInfo ? `Version ${updateInfo.version} is available` : 'An update is available'}
              </span>
            </div>
            {isElectron ? (
              <Button onClick={handleDownload} className="w-full sm:w-auto">
                <Download className="w-4 h-4 mr-2" />
                Download Update
              </Button>
            ) : (
              <Button onClick={handleInstall} className="w-full sm:w-auto">
                <RefreshCw className="w-4 h-4 mr-2" />
                Update & Reload
              </Button>
            )}
          </div>
        )}

        {status === 'downloading' && downloadProgress && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <ArrowDownToLine className="w-4 h-4 animate-bounce" />
              <span>Downloading update...</span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            <p className="text-center text-xs font-medium text-indigo-600">
              {downloadProgress.percent.toFixed(1)}% complete
            </p>
          </div>
        )}

        {status === 'downloaded' && updateInfo && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="font-medium text-emerald-700">
                Version {updateInfo.version} downloaded. Ready to install.
              </span>
            </div>
            <Button onClick={handleInstall} variant="primary" className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              Restart & Install
            </Button>
          </div>
        )}
        
        {/* Show available state if downloaded but not yet in downloaded status */}
        {status === 'available' && updateInfo && isElectron && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Download className="w-4 h-4 text-emerald-600" />
              <span className="font-medium text-emerald-700">
                Version {updateInfo.version} is available
              </span>
            </div>
            <Button onClick={handleDownload} className="w-full sm:w-auto">
              <Download className="w-4 h-4 mr-2" />
              Download Update
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

        {/* Check for Updates Button */}
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


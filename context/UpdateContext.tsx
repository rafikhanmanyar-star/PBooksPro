import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
  isIncremental?: boolean;
}

interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

interface UpdateContextType {
  isChecking: boolean;
  updateAvailable: boolean;
  updateDownloaded: boolean;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  smoothedProgress: number;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: (immediate?: boolean) => Promise<void>;
  isUpdateReady: () => Promise<boolean>;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

export const UpdateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smoothedProgress, setSmoothedProgress] = useState<number>(0);

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI?.isElectron;

  useEffect(() => {
    if (!isElectron) return;

    const electronAPI = (window as any).electronAPI;

    // Set up event listeners
    const unsubscribers: (() => void)[] = [];

    // Update checking
    const unsubChecking = electronAPI.onUpdateChecking(() => {
      setIsChecking(true);
      setError(null);
    });
    unsubscribers.push(unsubChecking);

    // Update available
    const unsubAvailable = electronAPI.onUpdateAvailable((info: UpdateInfo) => {
      setIsChecking(false);
      setUpdateAvailable(true);
      setUpdateInfo(info);
      setError(null);
      setSmoothedProgress(0); // Reset progress when new update is available
      console.log('Update available:', info.version);
    });
    unsubscribers.push(unsubAvailable);

    // Update not available
    const unsubNotAvailable = electronAPI.onUpdateNotAvailable(() => {
      setIsChecking(false);
      setUpdateAvailable(false);
      setError(null);
    });
    unsubscribers.push(unsubNotAvailable);

    // Download progress - with smoothing to prevent jumping
    const unsubProgress = electronAPI.onDownloadProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress);
      setError(null);
      
      // Smooth the progress to prevent jumping backward/forward
      setSmoothedProgress(prev => {
        const current = progress.percent;
        // Never go backward - always move forward or stay the same
        if (current <= prev) {
          return prev; // Keep current value if progress goes backward
        }
        // If progress jumps significantly forward (likely a reset or correction), use new value
        if (current - prev > 10) {
          return current;
        }
        // Smooth transition: move towards current value gradually (max 3% per update)
        const diff = current - prev;
        const step = Math.min(diff, 3); // Only move forward, max 3% per update
        return prev + step;
      });
    });
    unsubscribers.push(unsubProgress);

    // Update downloaded
    const unsubDownloaded = electronAPI.onUpdateDownloaded((info: UpdateInfo) => {
      setUpdateDownloaded(true);
      setUpdateInfo(info);
      setDownloadProgress(null);
      setSmoothedProgress(100); // Ensure progress shows 100%
      setError(null);
      console.log('Update downloaded:', info.version);
    });
    unsubscribers.push(unsubDownloaded);

    // Update error
    const unsubError = electronAPI.onUpdateError((err: { message: string; errorType?: string; originalMessage?: string }) => {
      setIsChecking(false);
      // Use the user-friendly message from main process
      setError(err.message || 'Update error occurred');
      console.error('Update error:', {
        userMessage: err.message,
        errorType: err.errorType,
        originalMessage: err.originalMessage
      });
    });
    unsubscribers.push(unsubError);

    // Check if update is already ready on mount
    electronAPI.isUpdateReady().then((result: { ready: boolean }) => {
      if (result.ready) {
        setUpdateDownloaded(true);
      }
    }).catch(() => {
      // Ignore errors
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [isElectron]);

  const checkForUpdates = async () => {
    if (!isElectron) {
      console.log('Update check skipped - not running in Electron');
      return;
    }
    try {
      setIsChecking(true);
      setError(null);
      
      // Add timeout wrapper (30 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Update check timed out after 30 seconds. The update server may be unreachable.'));
        }, 30000);
      });
      
      const checkPromise = (window as any).electronAPI.checkForUpdates();
      const result = await Promise.race([checkPromise, timeoutPromise]) as any;
      
      if (!result.success) {
        setError(result.error || 'Failed to check for updates');
      }
    } catch (err: any) {
      console.error('Update check error:', err);
      setError(err.message || 'Failed to check for updates');
    } finally {
      setIsChecking(false);
    }
  };

  const downloadUpdate = async () => {
    if (!isElectron) {
      console.log('Update download skipped - not running in Electron');
      return;
    }
    try {
      setError(null);
      const result = await (window as any).electronAPI.downloadUpdate();
      if (!result.success) {
        setError(result.error || 'Failed to download update');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to download update');
    }
  };

  const installUpdate = async (immediate = false) => {
    if (!isElectron) {
      console.log('Update install skipped - not running in Electron');
      return;
    }
    try {
      setError(null);
      const result = await (window as any).electronAPI.installUpdate(immediate);
      if (!result.success) {
        setError(result.error || 'Failed to install update');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to install update');
    }
  };

  const isUpdateReady = async (): Promise<boolean> => {
    if (!isElectron) return false;
    try {
      const result = await (window as any).electronAPI.isUpdateReady();
      return result.ready || false;
    } catch {
      return false;
    }
  };

  return (
    <UpdateContext.Provider
      value={{
        isChecking,
        updateAvailable,
        updateDownloaded,
        updateInfo,
        downloadProgress,
        smoothedProgress,
        error,
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        isUpdateReady,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
};

export const useUpdate = () => {
  const context = useContext(UpdateContext);
  if (context === undefined) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
};


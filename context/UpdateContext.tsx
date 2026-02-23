import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
}

interface UpdateStatusPayload {
  status: string;
  message?: string;
  version?: string;
  percent?: number;
}

interface UpdateContextType {
  appVersion: string | null;
  isChecking: boolean;
  updateAvailable: boolean;
  updateDownloaded: boolean;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  error: string | null;
  checkForUpdates: () => void;
  startDownload: () => void;
  installUpdate: () => void;
  isElectronUpdate: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      versions: { electron: string; chrome: string; node: string };
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<void>;
      onUpdateStatus: (cb: (payload: UpdateStatusPayload) => void) => () => void;
      startUpdateDownload: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
    };
  }
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

export const UpdateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isElectronUpdate = typeof window !== 'undefined' && !!window.electronAPI;

  useEffect(() => {
    if (!isElectronUpdate || !window.electronAPI) return;
    window.electronAPI.getAppVersion().then(setAppVersion);
  }, [isElectronUpdate]);

  useEffect(() => {
    if (!isElectronUpdate || !window.electronAPI) return;

    const unsub = window.electronAPI.onUpdateStatus((payload: UpdateStatusPayload) => {
      switch (payload.status) {
        case 'checking':
          setIsChecking(true);
          setError(null);
          break;
        case 'available':
          setIsChecking(false);
          setUpdateAvailable(true);
          if (payload.version) {
            setUpdateInfo({ version: payload.version });
          }
          break;
        case 'not-available':
          setIsChecking(false);
          setUpdateAvailable(false);
          break;
        case 'downloading':
          setIsChecking(false);
          setDownloadProgress({ percent: payload.percent ?? 0 });
          break;
        case 'downloaded':
          setUpdateDownloaded(true);
          setDownloadProgress(null);
          break;
        case 'error':
        case 'unavailable':
          setIsChecking(false);
          setUpdateAvailable(false);
          setDownloadProgress(null);
          setError(payload.message || 'Unknown update error');
          break;
      }
    });

    return unsub;
  }, [isElectronUpdate]);

  const checkForUpdates = useCallback(() => {
    if (!window.electronAPI) return;
    setError(null);
    window.electronAPI.checkForUpdates();
  }, []);

  const startDownload = useCallback(() => {
    if (!window.electronAPI) return;
    window.electronAPI.startUpdateDownload();
  }, []);

  const installUpdate = useCallback(() => {
    if (!window.electronAPI) return;
    window.electronAPI.quitAndInstall();
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        appVersion,
        isChecking,
        updateAvailable,
        updateDownloaded,
        updateInfo,
        downloadProgress,
        error,
        checkForUpdates,
        startDownload,
        installUpdate,
        isElectronUpdate,
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

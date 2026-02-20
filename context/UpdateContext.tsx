import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
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
  error: string | null;
  checkForUpdates: () => void;
  installUpdate: () => void;
  isElectronUpdate: boolean;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

function getElectronUpdater() {
  if (typeof window !== 'undefined') {
    return (window as any).electronAPI?.updater ?? null;
  }
  return null;
}

export const UpdateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updater = getElectronUpdater();
  const isElectronUpdate = !!updater;

  useEffect(() => {
    if (!updater) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(updater.onChecking(() => {
      setIsChecking(true);
      setError(null);
    }));

    cleanups.push(updater.onUpdateAvailable((info: UpdateInfo) => {
      setIsChecking(false);
      setUpdateAvailable(true);
      setUpdateInfo(info);
    }));

    cleanups.push(updater.onUpdateNotAvailable(() => {
      setIsChecking(false);
      setUpdateAvailable(false);
    }));

    cleanups.push(updater.onDownloadProgress((progress: DownloadProgress) => {
      setDownloadProgress(progress);
    }));

    cleanups.push(updater.onUpdateDownloaded((info: UpdateInfo) => {
      setUpdateDownloaded(true);
      setUpdateInfo(info);
      setDownloadProgress(null);
    }));

    cleanups.push(updater.onError((message: string) => {
      setIsChecking(false);
      setUpdateAvailable(false);
      setDownloadProgress(null);
      setError(message);
    }));

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [updater]);

  const checkForUpdates = useCallback(() => {
    if (!updater) return;
    setError(null);
    updater.checkForUpdates();
  }, [updater]);

  const installUpdate = useCallback(() => {
    if (!updater) return;
    updater.installUpdate();
  }, [updater]);

  return (
    <UpdateContext.Provider
      value={{
        isChecking,
        updateAvailable,
        updateDownloaded,
        updateInfo,
        downloadProgress,
        error,
        checkForUpdates,
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

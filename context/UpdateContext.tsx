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
  // Electron support removed - all update methods are no-ops
  const checkForUpdates = async () => {
    // No-op: Electron updates removed
  };

  const downloadUpdate = async () => {
    // No-op: Electron updates removed
  };

  const installUpdate = async (immediate = false) => {
    // No-op: Electron updates removed
  };

  const isUpdateReady = async (): Promise<boolean> => {
    return false;
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


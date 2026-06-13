import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

export type ProgressStatus = 'idle' | 'running' | 'success' | 'error';

interface ProgressState {
  status: ProgressStatus;
  title: string;
  message: string;
  progress: number; // 0 to 100
}

export interface ProgressContextType {
  progressState: ProgressState;
  startProgress: (title: string) => void;
  updateProgress: (progress: number, message: string) => void;
  finishProgress: (message: string) => void;
  errorProgress: (message: string) => void;
  resetProgress: () => void;
}

const initialState: ProgressState = {
  status: 'idle',
  title: '',
  message: '',
  progress: 0,
};

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

export const ProgressProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [progressState, setProgressState] = useState<ProgressState>(initialState);

  const startProgress = useCallback((title: string) => {
    setProgressState({ status: 'running', title, message: 'Starting...', progress: 0 });
  }, []);

  const updateProgress = useCallback((progress: number, message: string) => {
    setProgressState(prev => ({ ...prev, status: 'running', progress, message }));
  }, []);

  const finishProgress = useCallback((message: string) => {
    setProgressState(prev => ({ ...prev, status: 'success', message, progress: 100 }));
    setTimeout(() => setProgressState(initialState), 3000); // Auto-hide after 3s
  }, []);

  const errorProgress = useCallback((message: string) => {
    setProgressState(prev => ({ ...prev, status: 'error', message }));
  }, []);

  const resetProgress = useCallback(() => {
    setProgressState(initialState);
  }, []);

  /** ProgressDisplay overlay (z-[100]) must not cover the sign-in screen after logout. */
  useEffect(() => {
    if (!isAuthenticated && progressState.status !== 'idle') {
      setProgressState(initialState);
    }
  }, [isAuthenticated, progressState.status]);

  return (
    <ProgressContext.Provider value={{ progressState, startProgress, updateProgress, finishProgress, errorProgress, resetProgress }}>
      {children}
    </ProgressContext.Provider>
  );
};

export const useProgress = () => {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};
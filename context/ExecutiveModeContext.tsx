import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isLocalOnlyMode } from '../config/apiUrl';
import { useAuth } from './AuthContext';
import { apiClient } from '../services/api/client';
import { isMobileDevice, isTabletPortrait } from '../utils/platformDetection';
import {
  persistInterfaceMode,
  resolveEffectiveInterfaceMode,
} from '../utils/interfaceModePreference';
import type { ExecutiveModuleId, ExecutiveView, InterfaceMode } from '../types/executiveMobile.types';

type ExecutiveModeContextValue = {
  interfaceMode: InterfaceMode;
  isExecutiveMobileActive: boolean;
  isCloudEligible: boolean;
  setInterfaceMode: (mode: InterfaceMode) => Promise<void>;
  /** Temporary switch to full ERP for this browser tab/session only (not saved to server). */
  enterFullErpSession: () => void;
  /** Return to executive mobile UI without changing server preference (unless server is full_erp). */
  returnToExecutiveMobile: () => Promise<void>;
  view: ExecutiveView;
  setView: (view: ExecutiveView) => void;
  activeModule: ExecutiveModuleId;
  setActiveModule: (module: ExecutiveModuleId) => void;
  openModule: (module: ExecutiveModuleId) => void;
};

const ExecutiveModeContext = createContext<ExecutiveModeContextValue | null>(null);

function resolveExecutiveActive(
  interfaceMode: InterfaceMode,
  cloudEligible: boolean,
  sessionFullErp: boolean
): boolean {
  if (!cloudEligible) return false;
  if (sessionFullErp || interfaceMode === 'full_erp') return false;
  if (interfaceMode === 'executive_mobile') return true;
  return isMobileDevice() || isTabletPortrait();
}

export function ExecutiveModeProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUserProfile } = useAuth();
  const cloudEligible = !isLocalOnlyMode();
  const [sessionFullErp, setSessionFullErpState] = useState(false);
  const [viewportTick, setViewportTick] = useState(0);

  const interfaceMode: InterfaceMode = resolveEffectiveInterfaceMode(
    user?.interfaceMode as InterfaceMode | undefined,
    sessionFullErp
  );

  const [view, setView] = useState<ExecutiveView>('home');
  const [activeModule, setActiveModule] = useState<ExecutiveModuleId>('dashboard');

  useEffect(() => {
    const userMode = user?.interfaceMode as InterfaceMode | undefined;
    if (userMode) persistInterfaceMode(userMode);
  }, [user?.interfaceMode]);

  const isExecutiveMobileActive = useMemo(
    () => resolveExecutiveActive(interfaceMode, cloudEligible, sessionFullErp),
    [interfaceMode, cloudEligible, sessionFullErp, viewportTick]
  );

  const setInterfaceMode = useCallback(
    async (mode: InterfaceMode) => {
      if (mode !== 'full_erp') {
        setSessionFullErpState(false);
      }
      persistInterfaceMode(mode);
      if (!apiClient.getToken()) {
        updateUserProfile?.({ interfaceMode: mode });
        return;
      }
      const res = await apiClient.patch<{ interfaceMode: InterfaceMode }>('/users/me', {
        interfaceMode: mode,
      });
      updateUserProfile?.({ interfaceMode: res.interfaceMode });
      persistInterfaceMode(res.interfaceMode as InterfaceMode);
    },
    [updateUserProfile]
  );

  const enterFullErpSession = useCallback(() => {
    setSessionFullErpState(true);
  }, []);

  const returnToExecutiveMobile = useCallback(async () => {
    setSessionFullErpState(false);
    const serverMode = user?.interfaceMode as InterfaceMode | undefined;
    if (serverMode === 'full_erp') {
      await setInterfaceMode(isMobileDevice() ? 'executive_mobile' : 'auto');
    }
  }, [setInterfaceMode, user?.interfaceMode]);

  const openModule = useCallback((module: ExecutiveModuleId) => {
    setActiveModule(module);
    setView('moduleDashboard');
  }, []);

  useEffect(() => {
    const onViewportChange = () => setViewportTick((n) => n + 1);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, []);

  const value = useMemo(
    () => ({
      interfaceMode,
      isExecutiveMobileActive,
      isCloudEligible: cloudEligible,
      setInterfaceMode,
      enterFullErpSession,
      returnToExecutiveMobile,
      view,
      setView,
      activeModule,
      setActiveModule,
      openModule,
    }),
    [
      interfaceMode,
      isExecutiveMobileActive,
      cloudEligible,
      setInterfaceMode,
      enterFullErpSession,
      returnToExecutiveMobile,
      view,
      activeModule,
      openModule,
    ]
  );

  return (
    <ExecutiveModeContext.Provider value={value}>{children}</ExecutiveModeContext.Provider>
  );
}

export function useExecutiveMode(): ExecutiveModeContextValue {
  const ctx = useContext(ExecutiveModeContext);
  if (!ctx) {
    throw new Error('useExecutiveMode must be used within ExecutiveModeProvider');
  }
  return ctx;
}

export function useExecutiveModeOptional(): ExecutiveModeContextValue | null {
  return useContext(ExecutiveModeContext);
}

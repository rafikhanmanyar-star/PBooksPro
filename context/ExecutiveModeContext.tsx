import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isLocalOnlyMode } from '../config/apiUrl';
import { useAuth } from './AuthContext';
import { apiClient } from '../services/api/client';
import { isMobileDevice, isTabletPortrait } from '../utils/platformDetection';
import type { ExecutiveModuleId, ExecutiveView, InterfaceMode } from '../types/executiveMobile.types';

type ExecutiveModeContextValue = {
  interfaceMode: InterfaceMode;
  isExecutiveMobileActive: boolean;
  isCloudEligible: boolean;
  setInterfaceMode: (mode: InterfaceMode) => Promise<void>;
  view: ExecutiveView;
  setView: (view: ExecutiveView) => void;
  activeModule: ExecutiveModuleId;
  setActiveModule: (module: ExecutiveModuleId) => void;
  openModule: (module: ExecutiveModuleId) => void;
};

const ExecutiveModeContext = createContext<ExecutiveModeContextValue | null>(null);

function resolveExecutiveActive(
  interfaceMode: InterfaceMode,
  cloudEligible: boolean
): boolean {
  if (!cloudEligible) return false;
  if (interfaceMode === 'full_erp') return false;
  if (interfaceMode === 'executive_mobile') return true;
  return isMobileDevice() || isTabletPortrait();
}

export function ExecutiveModeProvider({ children }: { children: React.ReactNode }) {
  const { user, updateUserProfile } = useAuth();
  const cloudEligible = !isLocalOnlyMode();
  const interfaceMode: InterfaceMode =
    (user?.interfaceMode as InterfaceMode | undefined) ?? 'auto';

  const [view, setView] = useState<ExecutiveView>('home');
  const [activeModule, setActiveModule] = useState<ExecutiveModuleId>('dashboard');

  const isExecutiveMobileActive = useMemo(
    () => resolveExecutiveActive(interfaceMode, cloudEligible),
    [interfaceMode, cloudEligible]
  );

  const setInterfaceMode = useCallback(
    async (mode: InterfaceMode) => {
      if (!apiClient.getToken()) return;
      const res = await apiClient.patch<{ interfaceMode: InterfaceMode }>('/users/me', {
        interfaceMode: mode,
      });
      updateUserProfile?.({ interfaceMode: res.interfaceMode });
    },
    [updateUserProfile]
  );

  const openModule = useCallback((module: ExecutiveModuleId) => {
    setActiveModule(module);
    setView('moduleDashboard');
  }, []);

  useEffect(() => {
    const onResize = () => {
      /* re-render on breakpoint change for auto mode */
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const value = useMemo(
    () => ({
      interfaceMode,
      isExecutiveMobileActive,
      isCloudEligible: cloudEligible,
      setInterfaceMode,
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

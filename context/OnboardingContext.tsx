import React, { createContext, useContext, type ReactNode } from 'react';
import { useOnboarding } from '../hooks/useOnboarding';

type OnboardingContextValue = ReturnType<typeof useOnboarding>;

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const value = useOnboarding();
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
};

export function useOnboardingContext(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboardingContext must be used within OnboardingProvider');
  }
  return ctx;
}

/** Safe accessor when provider may be absent (e.g. tests). */
export function useOnboardingOptional(): OnboardingContextValue | null {
  return useContext(OnboardingContext) ?? null;
}

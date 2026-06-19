import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { invalidatePageGroupQueries } from '../hooks/pageActiveInvalidation';

/** Feature flag — set `VITE_PAGE_ACTIVE_GATE=false` to disable gating (rollback). */
export function isPageActiveGateEnabled(): boolean {
  return import.meta.env.VITE_PAGE_ACTIVE_GATE !== 'false';
}

type PageActiveRootContextValue = {
  activeGroup: string;
  gateEnabled: boolean;
  isPageGroupActive: (group: string) => boolean;
};

type PageActiveScopeContextValue = {
  pageGroup: string;
};

const PageActiveRootContext = createContext<PageActiveRootContextValue | null>(null);
const PageActiveScopeContext = createContext<PageActiveScopeContextValue | null>(null);

export interface PageActiveProviderProps {
  activeGroup: string;
  children: React.ReactNode;
}

export function PageActiveProvider({ activeGroup, children }: PageActiveProviderProps) {
  const gateEnabled = isPageActiveGateEnabled();
  const value = useMemo(
    (): PageActiveRootContextValue => ({
      activeGroup,
      gateEnabled,
      isPageGroupActive: (group: string) => !gateEnabled || activeGroup === group,
    }),
    [activeGroup, gateEnabled]
  );

  return <PageActiveRootContext.Provider value={value}>{children}</PageActiveRootContext.Provider>;
}

export interface PageActiveScopeProps {
  pageGroup: string;
  isActive: boolean;
  children: React.ReactNode;
}

/**
 * Marks a persistent page subtree with its group key.
 * Descendant `useStateSelector` calls suspend when this group is hidden.
 */
export function PageActiveScope({ pageGroup, isActive, children }: PageActiveScopeProps) {
  const scopeValue = useMemo(() => ({ pageGroup }), [pageGroup]);
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    if (!isPageActiveGateEnabled()) return;
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    if (!wasActive && isActive) {
      void invalidatePageGroupQueries(pageGroup);
    }
  }, [isActive, pageGroup]);

  return (
    <PageActiveScopeContext.Provider value={scopeValue}>{children}</PageActiveScopeContext.Provider>
  );
}

export function usePageActive(): {
  isActive: boolean;
  gateEnabled: boolean;
  pageGroup: string | null;
  activeGroup: string | null;
} {
  const root = useContext(PageActiveRootContext);
  const scope = useContext(PageActiveScopeContext);
  const gateEnabled = root?.gateEnabled ?? false;
  const pageGroup = scope?.pageGroup ?? null;
  const activeGroup = root?.activeGroup ?? null;
  const isActive = !gateEnabled || pageGroup === null || activeGroup === pageGroup;

  return { isActive, gateEnabled, pageGroup, activeGroup };
}

/** Used by gated subscription layer — safe when provider/scope absent. */
export function usePageActiveGateState(): {
  shouldGate: boolean;
  isActive: boolean;
} {
  const { isActive, gateEnabled, pageGroup } = usePageActive();
  const shouldGate = gateEnabled && pageGroup !== null && !isActive;
  return { shouldGate, isActive };
}

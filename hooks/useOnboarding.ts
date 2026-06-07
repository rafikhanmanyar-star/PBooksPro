import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompanyOptional } from '../context/CompanyContext';
import { isLocalOnlyMode } from '../config/apiUrl';
import { isDemoModeActive } from '../config/demoEnvironment';
import {
  onboardingApi,
  loadLocalOnboarding,
  saveLocalOnboarding,
  type OnboardingState,
} from '../services/api/onboardingApi';
import type { OnboardingStepId } from '../shared/onboarding/onboardingSteps';
import { usePermissions } from './usePermissions';

const SESSION_DISMISS_KEY = 'pbooks_onboarding_dismissed_session';

function defaultState(tenantId: string): OnboardingState {
  return {
    tenantId,
    status: 'in_progress',
    currentStep: 'welcome',
    completedSteps: [],
    stepData: {},
    startedAt: new Date().toISOString(),
    completedAt: null,
    updatedAt: new Date().toISOString(),
    progressPercent: 0,
  };
}

export function useOnboarding() {
  const { isAuthenticated, tenant } = useAuth();
  const companyCtx = useCompanyOptional();
  const perms = usePermissions();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storageId = useMemo(() => {
    if (!isLocalOnlyMode()) return tenant?.id ?? localStorage.getItem('tenant_id') ?? '';
    return companyCtx?.activeCompany?.id ?? 'local';
  }, [tenant?.id, companyCtx?.activeCompany?.id]);

  const canManage = perms.canManageUsers;

  const load = useCallback(async () => {
    if (!storageId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isLocalOnlyMode()) {
        const local = loadLocalOnboarding(storageId) ?? defaultState(storageId);
        setState(local);
      } else if (isAuthenticated && canManage) {
        const remote = await onboardingApi.get();
        setState(remote);
        saveLocalOnboarding(storageId, remote);
      } else {
        setState(null);
      }
    } catch (err: unknown) {
      const fallback = loadLocalOnboarding(storageId);
      if (fallback) {
        setState(fallback);
      } else if (storageId) {
        setState(defaultState(storageId));
      }
      setError(err instanceof Error ? err.message : 'Could not load onboarding.');
    } finally {
      setLoading(false);
    }
  }, [storageId, isAuthenticated, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (next: OnboardingState) => {
      setState(next);
      if (storageId) saveLocalOnboarding(storageId, next);
      if (!isLocalOnlyMode() && isAuthenticated && canManage) {
        try {
          const remote = await onboardingApi.save({
            currentStep: next.currentStep,
            completedSteps: next.completedSteps,
            stepData: next.stepData,
          });
          setState(remote);
          saveLocalOnboarding(storageId, remote);
        } catch {
          /* local copy remains */
        }
      }
    },
    [storageId, isAuthenticated, canManage]
  );

  const completeStep = useCallback(
    async (stepId: OnboardingStepId, stepData?: Record<string, unknown>) => {
      if (!state) return;
      if (isLocalOnlyMode() || !isAuthenticated) {
        const completed = new Set(state.completedSteps);
        completed.add(stepId);
        const stepOrder = [
          'welcome',
          'business_setup',
          'company_info',
          'fiscal_year',
          'chart_of_accounts',
          'property_setup',
          'user_setup',
          'first_transaction',
          'completion',
        ] as OnboardingStepId[];
        const stepIdx = stepOrder.indexOf(stepId);
        const nextStep = stepIdx >= 0 && stepIdx < stepOrder.length - 1 ? stepOrder[stepIdx + 1] : 'completion';
        const merged = stepData ? { ...state.stepData, [stepId]: stepData } : state.stepData;
        const actionable = stepOrder.filter((id) => id !== 'completion');
        const done = actionable.filter((id) => completed.has(id)).length;
        const next: OnboardingState = {
          ...state,
          currentStep: nextStep,
          completedSteps: [...completed],
          stepData: merged,
          updatedAt: new Date().toISOString(),
          progressPercent: Math.round((done / actionable.length) * 100),
          status: done >= actionable.length ? 'completed' : state.status,
          completedAt: done >= actionable.length ? new Date().toISOString() : state.completedAt,
        };
        await persist(next);
        return next;
      }
      const remote = await onboardingApi.completeStep(stepId, stepData);
      setState(remote);
      if (storageId) saveLocalOnboarding(storageId, remote);
      return remote;
    },
    [state, isAuthenticated, persist, storageId]
  );

  const skipAll = useCallback(async () => {
    if (!isLocalOnlyMode() && isAuthenticated && canManage) {
      const remote = await onboardingApi.skip();
      setState(remote);
      if (storageId) saveLocalOnboarding(storageId, remote);
    } else if (state) {
      const next = { ...state, status: 'skipped' as const, completedAt: new Date().toISOString() };
      await persist(next);
    }
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, [state, isAuthenticated, canManage, persist, storageId]);

  const resumeLater = useCallback(() => {
    setOpen(false);
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const restart = useCallback(async () => {
    if (!isLocalOnlyMode() && isAuthenticated && canManage) {
      const remote = await onboardingApi.restart();
      setState(remote);
      if (storageId) saveLocalOnboarding(storageId, remote);
    } else if (storageId) {
      const fresh = defaultState(storageId);
      setState(fresh);
      saveLocalOnboarding(storageId, fresh);
    }
    setOpen(true);
    try {
      sessionStorage.removeItem(SESSION_DISMISS_KEY);
    } catch {
      /* ignore */
    }
  }, [isAuthenticated, canManage, storageId]);

  const shouldAutoOpen = useMemo(() => {
    if (isDemoModeActive()) return false;
    if (!canManage) return false;
    if (!state || state.status !== 'in_progress') return false;
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') return false;
    } catch {
      /* ignore */
    }
    return true;
  }, [state, canManage]);

  useEffect(() => {
    if (!loading && shouldAutoOpen) setOpen(true);
  }, [loading, shouldAutoOpen]);

  return {
    state,
    loading,
    error,
    open,
    setOpen,
    load,
    persist,
    completeStep,
    skipAll,
    resumeLater,
    restart,
    canManage,
    isComplete: state?.status === 'completed' || state?.status === 'skipped',
  };
}
